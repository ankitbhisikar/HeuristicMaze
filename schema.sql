-- ═══════════════════════════════════════════════════════════════
-- Beacon & A* Algorithm Platform — SQL Database Schema
-- Supports SQLite (built-in), PostgreSQL, and MySQL
-- ═══════════════════════════════════════════════════════════════

-- 1. Users Table (Stores user profiles, roles, plan tier, and Admin IDs)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'member',       -- 'admin' | 'member'
    is_admin INTEGER NOT NULL DEFAULT 0,        -- 1 = Admin, 0 = Member
    plan TEXT NOT NULL DEFAULT 'free',          -- 'free' | 'pro' | 'enterprise'
    plan_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Incidents Table (Full Incident Lifecycle: Open -> Acknowledged -> Resolved)
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved')),
    owner TEXT NOT NULL,
    created_by_uid TEXT,
    created_by_name TEXT,
    created_by_email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_uid) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. On-Call Roster Table (Engineer Rotations)
CREATE TABLE IF NOT EXISTS oncall (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    initials TEXT NOT NULL,
    color TEXT NOT NULL,
    shift TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1
);

-- 4. Monitored Microservices Table
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'down')),
    uptime TEXT NOT NULL,
    latency TEXT NOT NULL
);

-- 5. Pricing Plans Table (Stores subscription tiers and details)
CREATE TABLE IF NOT EXISTS pricing_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL,
    price_annual INTEGER NOT NULL,
    description TEXT NOT NULL,
    features_json TEXT NOT NULL,
    badge TEXT,
    popular INTEGER DEFAULT 0
);

-- 6. Saved Mazes & Pathfinding Simulation History Table
CREATE TABLE IF NOT EXISTS saved_mazes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    start_pos TEXT NOT NULL,     -- JSON "[r, c]"
    goal_pos TEXT NOT NULL,      -- JSON "[r, c]"
    walls_json TEXT NOT NULL,    -- JSON Array of "[r, c]"
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Real-Time Road Accident & Hazard Monitoring Table
CREATE TABLE IF NOT EXISTS road_accidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    road_name TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'moderate', -- 'minor', 'moderate', 'severe', 'critical'
    speed_drop_pct INTEGER DEFAULT 35,
    delay_minutes INTEGER DEFAULT 8,
    status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'cleared'
    description TEXT,
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Performance Indexes for Fast Lookups & Sorting
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_oncall_order ON oncall(sort_order);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_road_accidents_status ON road_accidents(status);
CREATE INDEX IF NOT EXISTS idx_road_accidents_road ON road_accidents(road_name);

-- ═══════════════════════════════════════════════════════════════
-- Initial Seed Data (Pure SQL INSERT Statements)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO users (id, name, email, picture, role, is_admin, plan) VALUES
('admin_1', 'Ankit Dev', 'ankit@example.com', NULL, 'admin', 1, 'enterprise'),
('admin_2', 'Beacon Admin', 'admin@beacon.app', NULL, 'admin', 1, 'enterprise'),
('usr_seed_2', 'Priya Mehta', 'priya@beacon.app', NULL, 'member', 0, 'pro'),
('usr_seed_3', 'Marcus Webb', 'marcus@beacon.app', NULL, 'member', 0, 'free'),
('usr_seed_4', 'Yuna Park', 'yuna@beacon.app', NULL, 'member', 0, 'free'),
('usr_seed_5', 'Sam Okafor', 'sam@beacon.app', NULL, 'member', 0, 'pro');

INSERT OR IGNORE INTO oncall (id, name, role, initials, color, shift, sort_order) VALUES
(1, 'Priya Mehta', 'Platform · primary', 'P', 'violet', 'until 23:00', 1),
(2, 'Marcus Webb', 'Auth · primary',     'M', 'green',  'until 23:00', 2),
(3, 'Yuna Park',   'Search · primary',   'Y', 'amber',  'until 23:00', 3),
(4, 'Sam Okafor',  'Infra · secondary',  'S', 'red',    'backup',      4);

INSERT OR IGNORE INTO services (id, name, status, uptime, latency) VALUES
(1, 'checkout-api',    'degraded', '99.1%',  '842ms'),
(2, 'auth-service',    'degraded', '98.4%',  '310ms'),
(3, 'search-indexer',  'degraded', '99.6%',  '120ms'),
(4, 'payment-gateway', 'healthy',  '99.99%', '56ms'),
(5, 'notification-svc','healthy',  '99.8%',  '78ms'),
(6, 'billing-api',     'healthy',  '99.95%', '91ms');

INSERT OR IGNORE INTO incidents (id, service, title, severity, status, owner, created_by_name, created_by_email, created_at) VALUES
(1, 'checkout-api',    'Latency p99 > 2.4s',    'critical', 'open',         '@priya',  'System Monitor', 'bot@beacon.app', datetime('now', '-4 minutes')),
(2, 'auth-service',    'Error rate spike 3.2%', 'high',     'acknowledged', '@marcus', 'System Monitor', 'bot@beacon.app', datetime('now', '-18 minutes')),
(3, 'search-indexer',  'Queue depth > 50k',     'high',     'acknowledged', '@yuna',   'System Monitor', 'bot@beacon.app', datetime('now', '-31 minutes')),
(4, 'notification-svc','Delivery delay',         'low',      'resolved',     '@sam',    'Sam Okafor',     'sam@beacon.app', datetime('now', '-72 minutes')),
(5, 'billing-api',     'Cert expiry warning',    'low',      'resolved',     '@priya',  'Priya Mehta',    'priya@beacon.app', datetime('now', '-1 day'));

-- Pricing Plans Seed
INSERT OR IGNORE INTO pricing_plans (id, name, price_monthly, price_annual, description, features_json, badge, popular) VALUES
('free', 'Starter / Free', 0, 0, 'Perfect for students, individuals, and algorithm practice.', 
 '["Unlimited Maze Grid Pathfinding","Manhattan & Euclidean Heuristic Solvers","Character Movement Simulation","Up to 3 Saved Mazes","Basic Map Shortest Route Finder","Community Docs Access"]', 
 'Free Forever', 0),

('pro', 'Pro Developer', 29, 290, 'For developers, engineers, and competitive programmers needing deep algorithmic analysis.', 
 '["Everything in Starter","Instant Side-by-Side Heuristic Comparison","Unlimited Maze Generation & Export","Custom Road Graph & GPS Navigation","Full REST API Access & Token","Priority Incident Alerts & SLA Monitoring","High-Speed Step-by-Step Traversal"]', 
 'Most Popular', 1),

('enterprise', 'Enterprise Team', 99, 990, 'Full platform capacity for engineering organizations, universities, and operations.', 
 '["Everything in Pro","Custom Heuristic Weighting (Admissible & Inadmissible)","Unlimited Microservice Monitoring","Multi-Shift Escalation & On-Call Schedules","Dedicated SQL Instance & Backups","Audit Logs & Advanced Reports","24/7 Dedicated Support"]', 
 'Ultimate Power', 0);

-- Initial Real-Time Road Accidents & Hazards Seed
INSERT OR IGNORE INTO road_accidents (id, road_name, from_node, to_node, severity, speed_drop_pct, delay_minutes, status, description, reported_at) VALUES
(1, 'Skyline Expressway', 'tech_park', 'airport', 'critical', 65, 22, 'active', 'Multi-vehicle collision on KM 4.2 eastbound. Two lanes blocked; speed dropped 65%.', datetime('now', '-8 minutes')),
(2, 'Metropolitan Arterial', 'central_hub', 'tech_park', 'moderate', 35, 9, 'active', 'Fender bender near Junction 7. Emergency services on scene; expect 9 min delay.', datetime('now', '-21 minutes')),
(3, 'Heritage Way', 'university', 'central_hub', 'minor', 20, 4, 'active', 'Stalled delivery van causing localized slowdown; traffic moving at 32 km/h.', datetime('now', '-4 minutes'));
