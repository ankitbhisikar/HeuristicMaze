require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const db   = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Body parsers ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Initialize SQL Database ──────────────────────────────────
db.initDatabase();

// ── Check OAuth configuration ────────────────────────────────
const hasGoogleAuth = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here' &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CLIENT_SECRET !== 'your_google_client_secret_here'
);

if (hasGoogleAuth) {
  console.log('🔑 Google OAuth is CONFIGURED');
} else {
  console.log('ℹ️  Google OAuth is NOT configured in .env');
  console.log('   Running in local SQL development mode.');
  console.log('   You can still sign in with Demo accounts or configure .env anytime.\n');
}

// ── Session ──────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'beacon-sql-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,              // Set to true when behind HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  },
}));

// ── Passport setup ────────────────────────────────────────────
if (hasGoogleAuth) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id:         profile.id,
        name:       profile.displayName,
        given_name: profile.name?.givenName,
        email:      profile.emails?.[0]?.value,
        picture:    profile.photos?.[0]?.value,
      };

      // Persist user in SQL database
      try {
        db.upsertUser(user);
      } catch (err) {
        console.error('Error saving user to SQL database:', err);
      }

      return done(null, user);
    }
  ));
}

passport.serializeUser((user, done)  => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ── Static files (HTML, CSS, JS) ─────────────────────────────
app.use(express.static(path.join(__dirname)));

// ── Auth middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  // In development / demo mode, if session has user, allow access
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  return res.status(401).json({ authenticated: false, error: 'Not authenticated', redirect: '/?auth_required=true' });
}

// ── Google OAuth routes ───────────────────────────────────────
if (hasGoogleAuth) {
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/?error=auth_failed',
      failureMessage: true,
    }),
    (req, res) => {
      res.redirect('/dashboard.html');
    }
  );
} else {
  app.get('/auth/google', (req, res) => {
    res.redirect('/?error=oauth_not_configured');
  });
}

// Dev login route (for testing without Google keys)
app.post('/auth/dev-login', (req, res) => {
  const { id, name, email, picture, role, is_admin } = req.body;

  let existing = null;
  if (email) existing = db.getUserByEmail(email);
  if (!existing && id) existing = db.getUserById(id);

  const calculatedRole = role || existing?.role || (email?.includes('admin') || name?.includes('Admin') || id?.startsWith('admin') ? 'admin' : 'member');
  const calculatedIsAdmin = is_admin !== undefined ? is_admin : (existing?.is_admin || (calculatedRole === 'admin' ? 1 : 0));

  const user = {
    id:         id || existing?.id || ('user_' + Date.now()),
    name:       name || existing?.name || 'Ankit Dev',
    given_name: (name || existing?.name || 'Ankit').split(' ')[0],
    email:      email || existing?.email || 'ankit@example.com',
    role:       calculatedRole,
    is_admin:   calculatedIsAdmin,
    picture:    picture || existing?.picture || null,
  };

  try {
    db.upsertUser(user);
  } catch (err) {
    console.error('Error saving user:', err);
  }

  req.session.user = user;
  res.json({ success: true, user });
});

// Logout route
app.get('/auth/logout', (req, res, next) => {
  const finalizeLogout = () => {
    res.clearCookie('connect.sid', { path: '/' });
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, redirect: '/index.html?logged_out=true&signin=true' });
    }
    return res.redirect('/index.html?logged_out=true&signin=true');
  };

  if (req.session) {
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session:', err);
      finalizeLogout();
    });
  } else if (req.logout) {
    req.logout((err) => {
      if (err) console.error('Passport logout error:', err);
      finalizeLogout();
    });
  } else {
    finalizeLogout();
  }
});

// ═══════════════════════════════════════════════════════════════
//  SQL BACKEND API ROUTES
// ═══════════════════════════════════════════════════════════════

/** GET /api/db-info — SQL backend status */
app.get('/api/db-info', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({
      engine: 'SQLite3 (SQL)',
      databaseFile: 'beacon.db',
      connected: true,
      hasGoogleAuth,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/me — current signed-in user */
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.user);
});

/** GET /api/stats — live stats calculated via SQL query */
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (err) {
    console.error('SQL stats error:', err);
    res.status(500).json({ error: 'Failed to query stats from SQL database' });
  }
});

/** GET /api/incidents — list all incidents from SQL table */
app.get('/api/incidents', (req, res) => {
  try {
    const incidents = db.getAllIncidents();
    res.json(incidents);
  } catch (err) {
    console.error('SQL select incidents error:', err);
    res.status(500).json({ error: 'Failed to fetch incidents from SQL database' });
  }
});

/** POST /api/incidents — create new incident via SQL INSERT */
app.post('/api/incidents', (req, res) => {
  try {
    const { service, title, severity, owner } = req.body;
    if (!service || !title) {
      return res.status(400).json({ error: 'Service and title are required' });
    }

    const createdBy = req.user || { name: 'Local User', email: 'user@beacon.app' };

    const newIncident = db.createIncident({
      service,
      title,
      severity,
      owner,
      created_by_name:  createdBy.name,
      created_by_email: createdBy.email,
      created_by_uid:   createdBy.id
    });

    res.status(201).json(newIncident);
  } catch (err) {
    console.error('SQL insert incident error:', err);
    res.status(500).json({ error: 'Failed to create incident in SQL database' });
  }
});

/** PATCH /api/incidents/:id — update incident status via SQL UPDATE */
app.patch('/api/incidents/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updated = db.updateIncidentStatus(id, status);
    res.json(updated);
  } catch (err) {
    console.error('SQL update incident error:', err);
    res.status(500).json({ error: 'Failed to update incident in SQL database' });
  }
});

/** DELETE /api/incidents/:id — delete incident via SQL DELETE */
app.delete('/api/incidents/:id', (req, res) => {
  try {
    const id = req.params.id;
    const deleted = db.deleteIncident(id);
    if (deleted) {
      res.json({ success: true, id });
    } else {
      res.status(404).json({ error: 'Incident not found' });
    }
  } catch (err) {
    console.error('SQL delete incident error:', err);
    res.status(500).json({ error: 'Failed to delete incident from SQL database' });
  }
});

/** GET /api/oncall — on-call roster from SQL table */
app.get('/api/oncall', (req, res) => {
  try {
    const roster = db.getOncallRoster();
    res.json(roster);
  } catch (err) {
    console.error('SQL select oncall error:', err);
    res.status(500).json({ error: 'Failed to fetch on-call roster from SQL database' });
  }
});

/** GET /api/services — monitored services from SQL table */
app.get('/api/services', (req, res) => {
  try {
    const services = db.getServices();
    res.json(services);
  } catch (err) {
    console.error('SQL select services error:', err);
    res.status(500).json({ error: 'Failed to fetch services from SQL database' });
  }
});

/** GET /api/admin/check — verify if an ID or Email has Admin privileges */
app.get('/api/admin/check', (req, res) => {
  try {
    const target = req.query.id || req.query.email || req.user?.id || req.user?.email || 'admin_1';
    const result = db.checkAdmin(target);
    res.json(result);
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Failed to check admin ID' });
  }
});

/** GET /api/users — get all team members from SQL table */
app.get('/api/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json(users);
  } catch (err) {
    console.error('SQL select users error:', err);
    res.status(500).json({ error: 'Failed to fetch users from SQL database' });
  }
});

/** POST /api/users/:id/role — change user role in SQL table */
app.post('/api/users/:id/role', (req, res) => {
  try {
    const { role } = req.body;
    const user = db.setUserRole(req.params.id, role);
    res.json(user);
  } catch (err) {
    console.error('SQL update role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/** GET /api/reports — SQL analytics and incident breakdown */
app.get('/api/reports', (req, res) => {
  try {
    const reports = db.getReports();
    res.json(reports);
  } catch (err) {
    console.error('SQL reports error:', err);
    res.status(500).json({ error: 'Failed to calculate reports' });
  }
});

/** POST /api/services/:id/ping — toggle or refresh service status */
app.post('/api/services/:id/ping', (req, res) => {
  try {
    const status = req.body.status || 'healthy';
    const updated = db.updateServiceStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    console.error('Service ping error:', err);
    res.status(500).json({ error: 'Failed to ping service' });
  }
});

/** POST /api/users — save or update user in SQL table */
app.post('/api/users', (req, res) => {
  try {
    const user = db.upsertUser(req.body);
    res.json(user);
  } catch (err) {
    console.error('SQL upsert user error:', err);
    res.status(500).json({ error: 'Failed to save user in SQL database' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  PRICING & SUBSCRIPTIONS API
// ═══════════════════════════════════════════════════════════════

/** GET /api/pricing/plans — list all subscription tiers from SQL */
app.get('/api/pricing/plans', (req, res) => {
  try {
    const plans = db.getPricingPlans();
    res.json(plans);
  } catch (err) {
    console.error('SQL pricing plans error:', err);
    res.status(500).json({ error: 'Failed to fetch pricing plans' });
  }
});

/** POST /api/pricing/subscribe — change or upgrade user subscription */
app.post('/api/pricing/subscribe', (req, res) => {
  try {
    const { planId, email, userId } = req.body;
    const targetUser = userId || email || req.user?.id || req.user?.email || req.session?.user?.id || 'admin_1';

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required (free, pro, enterprise)' });
    }

    const updated = db.updateUserPlan(targetUser, planId);
    if (req.session?.user) {
      req.session.user.plan = planId;
    }

    res.json({
      success: true,
      message: `Subscription successfully updated to ${planId.toUpperCase()}`,
      subscription: updated
    });
  } catch (err) {
    console.error('SQL subscribe error:', err);
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/pricing/my-subscription — get active plan for current user */
app.get('/api/pricing/my-subscription', (req, res) => {
  try {
    const target = req.query.id || req.query.email || req.user?.id || req.user?.email || req.session?.user?.id || 'admin_1';
    const sub = db.getUserSubscription(target);
    res.json(sub);
  } catch (err) {
    console.error('Subscription fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTATION API
// ═══════════════════════════════════════════════════════════════

/** GET /api/docs — list documentation catalog */
app.get('/api/docs', (req, res) => {
  try {
    const docs = db.getDocsCatalog();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documentation catalog' });
  }
});

/** GET /api/docs/:id — get specific documentation article */
app.get('/api/docs/:id', (req, res) => {
  try {
    const docs = db.getDocsCatalog();
    const doc = docs.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documentation topic not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documentation topic' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  A* ALGORITHM & HEURISTICS SOLVER API
// ═══════════════════════════════════════════════════════════════

/** POST /api/astar/solve — solve grid maze pathfinding with selected heuristic */
app.post('/api/astar/solve', (req, res) => {
  try {
    const { grid, width, height, start, goal, heuristic, allowDiagonal } = req.body;

    if (!start || !goal) {
      return res.status(400).json({ error: 'Start [r,c] and Goal [r,c] coordinates are required.' });
    }

    const result = db.solveAStarGrid({
      grid,
      width: width || 20,
      height: height || 20,
      start,
      goal,
      heuristic: heuristic || 'manhattan',
      allowDiagonal: Boolean(allowDiagonal)
    });

    res.json(result);
  } catch (err) {
    console.error('A* solve error:', err);
    res.status(500).json({ error: 'Failed to solve A* grid path: ' + err.message });
  }
});

/** POST /api/astar/compare — compare Manhattan vs Euclidean heuristics */
app.post('/api/astar/compare', (req, res) => {
  try {
    const { grid, width, height, start, goal, allowDiagonal } = req.body;

    if (!start || !goal) {
      return res.status(400).json({ error: 'Start [r,c] and Goal [r,c] coordinates are required.' });
    }

    const comparison = db.compareHeuristics({
      grid,
      width: width || 20,
      height: height || 20,
      start,
      goal,
      allowDiagonal: Boolean(allowDiagonal)
    });

    res.json(comparison);
  } catch (err) {
    console.error('A* comparison error:', err);
    res.status(500).json({ error: 'Failed to compare heuristics: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  CITY MAP GRAPH & SHORTEST ROUTE API
// ═══════════════════════════════════════════════════════════════

/** GET /api/map/graph — get city map nodes and road edges */
app.get('/api/map/graph', (req, res) => {
  try {
    const mapGraph = db.getMapGraph();
    res.json(mapGraph);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch map graph' });
  }
});

/** POST /api/map/route — solve shortest route between two map locations using A* */
app.post('/api/map/route', (req, res) => {
  try {
    const { startId, goalId, heuristic } = req.body;
    if (!startId || !goalId) {
      return res.status(400).json({ error: 'startId and goalId are required.' });
    }

    const route = db.solveMapRoute({ 
      startId, 
      goalId, 
      heuristic: heuristic || 'euclidean',
      avoidAccidents: req.body.avoidAccidents !== false
    });
    res.json(route);
  } catch (err) {
    console.error('Map route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  REAL-TIME ACCIDENT RATE MONITOR API
// ═══════════════════════════════════════════════════════════════

/** GET /api/accidents/stats — returns real-time accident rate and city hazard metrics */
app.get('/api/accidents/stats', (req, res) => {
  try {
    const stats = db.getAccidentMonitorStats();
    res.json(stats);
  } catch (err) {
    console.error('Accidents stats error:', err);
    res.status(500).json({ error: 'Failed to fetch accident stats' });
  }
});

/** POST /api/accidents/report — report a new road accident */
app.post('/api/accidents/report', (req, res) => {
  try {
    const { road_name, from_node, to_node, severity, speed_drop_pct, delay_minutes, description } = req.body;
    if (!road_name) {
      return res.status(400).json({ error: 'road_name is required' });
    }
    const report = db.reportRoadAccident({ road_name, from_node, to_node, severity, speed_drop_pct, delay_minutes, description });
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to report accident' });
  }
});

/** POST /api/accidents/simulate-random — simulate a live road accident */
app.post('/api/accidents/simulate-random', (req, res) => {
  try {
    const accident = db.simulateRandomAccident();
    const stats = db.getAccidentMonitorStats();
    res.status(201).json({ accident, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to simulate accident: ' + err.message });
  }
});

/** POST /api/accidents/resolve/:id — mark accident as resolved */
app.post('/api/accidents/resolve/:id', (req, res) => {
  try {
    const result = db.resolveRoadAccident(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve accident' });
  }
});

/** POST /api/accidents/clear — clear all active road hazards */
app.post('/api/accidents/clear', (req, res) => {
  try {
    const result = db.clearAllRoadAccidents();
    const stats = db.getAccidentMonitorStats();
    res.json({ result, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear accidents' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  SAVED MAZES API
// ═══════════════════════════════════════════════════════════════

app.get('/api/mazes', (req, res) => {
  try {
    const mazes = db.getSavedMazes();
    res.json(mazes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch saved mazes' });
  }
});

app.post('/api/mazes', (req, res) => {
  try {
    const { name, width, height, start, goal, walls } = req.body;
    const author = req.user?.name || req.session?.user?.name || 'Local User';
    const saved = db.saveMaze({ name, width, height, start, goal, walls, created_by: author });
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save maze' });
  }
});

// ── Web Page & Auth Routes ────────────────────────────────────
app.get(['/logout', '/signout'], (req, res) => res.redirect('/auth/logout'));
app.get(['/login', '/signin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(['/pricing', '/pricing.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pricing.html'));
});

app.get(['/docs', '/docs.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'docs.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ── 404 & error handlers ──────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Beacon SQL Backend Server is running!`);
    console.log(`   URL:          http://localhost:${PORT}`);
    console.log(`   Database:     beacon.db (SQLite SQL)`);
    console.log(`   SQL Schema:   schema.sql`);
    console.log(`   API Endpoint: http://localhost:${PORT}/api/incidents`);
    console.log(`==================================================\n`);
  });
}

module.exports = app;
