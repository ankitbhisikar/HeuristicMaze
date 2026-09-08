// ── db.js ─────────────────────────────────────────────────────────
// Unified Backend Layer for Beacon
// Supports:
//   1. SQL Backend (Node.js + SQLite `beacon.db` at /api/*)
//   2. Firebase Firestore (Cloud NoSQL via firebase-config.js)
//   3. Demo Mode (Offline browser preview)
// ──────────────────────────────────────────────────────────────────

let _backendMode = 'detecting'; // 'sql' | 'firebase' | 'demo'
let _db = null;
let _sqlPollInterval = null;

/** Auto-detect which backend is active */
async function detectBackend() {
  if (_backendMode !== 'detecting') return _backendMode;

  // 1. Check if Node.js SQL backend is reachable
  try {
    const res = await fetch('/api/db-info', { method: 'GET', cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.engine) {
        console.log(`🗄️ Connected to SQL Backend (${data.engine})`);
        _backendMode = 'sql';
        return _backendMode;
      }
    }
  } catch (_) {
    // Not running on Node server or server unreachable
  }

  // 2. Check if Firebase is configured
  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
    _backendMode = 'firebase';
    return _backendMode;
  }

  // 3. Fallback to Demo mode
  _backendMode = 'demo';
  return _backendMode;
}

function getBackendMode() {
  return _backendMode;
}

function getDB() {
  if (_db) return _db;
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    _db = firebase.firestore();
  }
  return _db;
}

// ═══════════════════════════════════════════════════════════════════
//  INCIDENTS (CRUD via SQL / Firebase / Demo)
// ═══════════════════════════════════════════════════════════════════

/**
 * Real-time or polled incident listener.
 * Returns an unsubscribe function.
 */
function listenIncidents(callback, onError) {
  if (_backendMode === 'sql') {
    const loadSqlIncidents = async () => {
      try {
        const res = await fetch('/api/incidents', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        callback(data.map(d => ({
          _id:       String(d.id),
          id:        d.display_id || ('#' + d.id),
          service:   d.service,
          title:     d.title,
          severity:  d.severity,
          status:    d.status,
          owner:     d.owner,
          createdAt: d.created_at,
          createdBy: { name: d.created_by_name, email: d.created_by_email }
        })));
      } catch (err) {
        console.error('SQL Incidents fetch error:', err);
        onError?.(err);
      }
    };

    loadSqlIncidents();
    if (_sqlPollInterval) clearInterval(_sqlPollInterval);
    _sqlPollInterval = setInterval(loadSqlIncidents, 4000);
    return () => clearInterval(_sqlPollInterval);
  }

  if (_backendMode === 'firebase') {
    return getDB()
      .collection('incidents')
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => callback(snap.docs.map(d => ({ _id: d.id, id: d.id.slice(0, 6), ...d.data() }))),
        err  => { console.error('Firebase Incidents listener:', err); onError?.(err); }
      );
  }

  // Demo mode
  const localIncidents = typeof BEACON_DATA !== 'undefined' ? BEACON_DATA.incidents : [];
  callback(localIncidents.map((inc, i) => ({ ...inc, _id: 'demo-' + (inc.id || i) })));
  return () => {};
}

/**
 * Create a new incident.
 */
async function createIncident({ service, title, severity, owner }) {
  if (_backendMode === 'sql') {
    const res = await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, title, severity, owner })
    });
    if (!res.ok) throw new Error('Failed to create incident in SQL database');
    return await res.json();
  }

  if (_backendMode === 'firebase') {
    const user = firebase.auth().currentUser;
    return getDB().collection('incidents').add({
      service,
      title,
      severity,
      owner:     owner || '@' + (user?.displayName?.toLowerCase().replace(/\s+/g, '') || 'me'),
      status:    'open',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: {
        uid:   user?.uid         || 'anon',
        name:  user?.displayName || 'Unknown',
        email: user?.email       || '',
      },
    });
  }

  // Demo mode fallback
  return { id: 'demo-' + Date.now(), service, title, severity, status: 'open', owner };
}

/**
 * Update incident status ('open' | 'acknowledged' | 'resolved').
 */
async function updateIncidentStatus(incidentId, status) {
  const cleanId = String(incidentId).replace(/^#/, '');

  if (_backendMode === 'sql') {
    const res = await fetch(`/api/incidents/${cleanId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update incident in SQL database');
    return await res.json();
  }

  if (_backendMode === 'firebase') {
    return getDB().collection('incidents').doc(incidentId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.displayName || 'unknown',
    });
  }

  return { id: incidentId, status };
}

/**
 * Delete an incident.
 */
async function deleteIncident(incidentId) {
  const cleanId = String(incidentId).replace(/^#/, '');

  if (_backendMode === 'sql') {
    const res = await fetch(`/api/incidents/${cleanId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete incident from SQL database');
    return await res.json();
  }

  if (_backendMode === 'firebase') {
    return getDB().collection('incidents').doc(incidentId).delete();
  }

  return { success: true, id: incidentId };
}

// ═══════════════════════════════════════════════════════════════════
//  ON-CALL ROSTER & SERVICES
// ═══════════════════════════════════════════════════════════════════

/**
 * Listen or load on-call roster.
 */
function listenOncall(callback) {
  if (_backendMode === 'sql') {
    fetch('/api/oncall', { cache: 'no-store' })
      .then(res => res.json())
      .then(callback)
      .catch(err => console.error('SQL oncall error:', err));
    return () => {};
  }

  if (_backendMode === 'firebase') {
    return getDB()
      .collection('oncall')
      .orderBy('order')
      .onSnapshot(
        snap => callback(snap.docs.map(d => ({ _id: d.id, ...d.data() }))),
        err  => console.error('Oncall listener:', err)
      );
  }

  const localOncall = typeof BEACON_DATA !== 'undefined' ? BEACON_DATA.oncall : [];
  callback(localOncall);
  return () => {};
}

/**
 * Upsert user profile to database.
 */
async function saveUserProfile(user) {
  if (_backendMode === 'sql') {
    return fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:      user.uid || user.id,
        name:    user.displayName || user.name,
        email:   user.email,
        picture: user.photoURL || user.picture
      })
    }).then(r => r.json()).catch(() => {});
  }

  if (_backendMode === 'firebase') {
    return getDB().collection('users').doc(user.uid).set({
      name:      user.displayName,
      email:     user.email,
      picture:   user.photoURL,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

/** Seed database (if using Firestore) */
async function seedDatabaseIfEmpty() {
  if (_backendMode !== 'firebase') return;
  const snap = await getDB().collection('incidents').limit(1).get();
  if (!snap.empty) return;

  const batch = getDB().batch();
  const ts    = firebase.firestore.Timestamp.fromDate;
  const now   = new Date();
  const seed  = { uid: 'seed', name: 'System', email: '' };

  const incidents = [
    { service:'checkout-api',    title:'Latency p99 > 2.4s',    severity:'critical', status:'open',         owner:'@priya',  createdAt: ts(new Date(now - 4   * 60000)), createdBy: seed },
    { service:'auth-service',    title:'Error rate spike 3.2%', severity:'high',     status:'acknowledged', owner:'@marcus', createdAt: ts(new Date(now - 18  * 60000)), createdBy: seed },
    { service:'search-indexer',  title:'Queue depth > 50k',     severity:'high',     status:'acknowledged', owner:'@yuna',   createdAt: ts(new Date(now - 31  * 60000)), createdBy: seed },
    { service:'notification-svc',title:'Delivery delay',         severity:'low',      status:'resolved',     owner:'@sam',    createdAt: ts(new Date(now - 72  * 60000)), createdBy: seed },
    { service:'billing-api',     title:'Cert expiry warning',    severity:'low',      status:'resolved',     owner:'@priya',  createdAt: ts(new Date(now - 3600000)),      createdBy: seed },
  ];

  incidents.forEach(inc => batch.set(getDB().collection('incidents').doc(), inc));
  await batch.commit();
}

/** Computed stats helper */
function computeStats(incidents) {
  const open         = incidents.filter(i => i.status === 'open').length;
  const acknowledged = incidents.filter(i => i.status === 'acknowledged').length;
  const resolved     = incidents.filter(i => i.status === 'resolved').length;
  return { open, acknowledged, resolved, total: incidents.length };
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN ID & REPORTING HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Check Admin ID or Email against SQL database */
async function checkAdminId(idOrEmail) {
  if (_backendMode === 'sql') {
    const res = await fetch(`/api/admin/check?id=${encodeURIComponent(idOrEmail || '')}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to verify admin ID');
    return await res.json();
  }
  // Local demo fallback
  const isDemoAdmin = idOrEmail === 'admin_1' || idOrEmail === 'admin_2' || idOrEmail === 'admin@beacon.app' || idOrEmail === 'ankit@example.com';
  return {
    isAdmin: isDemoAdmin,
    adminId: isDemoAdmin ? (idOrEmail || 'admin_1') : null,
    role: isDemoAdmin ? 'admin' : 'member',
    message: isDemoAdmin ? `✅ '${idOrEmail}' is a verified Admin` : `ℹ️ '${idOrEmail}' is a regular member`
  };
}

/** Fetch all team members */
async function fetchUsers() {
  if (_backendMode === 'sql') {
    const res = await fetch('/api/users', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch team members');
    return await res.json();
  }
  return [
    { id: 'admin_1', name: 'Ankit Dev', email: 'ankit@example.com', role: 'admin', is_admin: 1 },
    { id: 'admin_2', name: 'Beacon Admin', email: 'admin@beacon.app', role: 'admin', is_admin: 1 },
    { id: 'usr_seed_2', name: 'Priya Mehta', email: 'priya@beacon.app', role: 'member', is_admin: 0 },
    { id: 'usr_seed_3', name: 'Marcus Webb', email: 'marcus@beacon.app', role: 'member', is_admin: 0 }
  ];
}

/** Fetch reports and SQL aggregations */
async function fetchReports() {
  if (_backendMode === 'sql') {
    const res = await fetch('/api/reports', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch reports');
    return await res.json();
  }
  return {
    byService: [
      { service: 'checkout-api', total_incidents: 2, open: 1, in_progress: 1, resolved: 0 },
      { service: 'auth-service', total_incidents: 1, open: 0, in_progress: 1, resolved: 0 }
    ],
    bySeverity: [{ severity: 'critical', count: 1 }, { severity: 'high', count: 2 }, { severity: 'low', count: 2 }],
    resolutionRate: '40%',
    avgMttr: '14.2 min',
    totalIncidents: 5,
    resolvedIncidents: 2
  };
}

/** Fetch monitored microservices list */
async function fetchServices() {
  if (_backendMode === 'sql') {
    const res = await fetch('/api/services', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch services');
    return await res.json();
  }
  return typeof BEACON_DATA !== 'undefined' ? BEACON_DATA.services : [];
}

/** Ping / update service status */
async function pingService(id, status = 'healthy') {
  if (_backendMode === 'sql') {
    const res = await fetch(`/api/services/${id}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return await res.json();
  }
  return { id, status };
}
