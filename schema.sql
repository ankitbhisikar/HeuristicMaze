-- ═══════════════════════════════════════════════════════════════
-- Beacon Incident Management — SQL Database Schema
-- Supports SQLite (built-in), PostgreSQL, and MySQL
-- ═══════════════════════════════════════════════════════════════

-- 1. Users Table (Stores user profiles, roles, and Admin IDs)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'member',       -- 'admin' | 'member'
    is_admin INTEGER NOT NULL DEFAULT 0,        -- 1 = Admin, 0 = Member
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

-- Performance Indexes for Fast Lookups & Sorting
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_oncall_order ON oncall(sort_order);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ═══════════════════════════════════════════════════════════════
-- Initial Seed Data (Pure SQL INSERT Statements)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO users (id, name, email, picture, role, is_admin) VALUES
('admin_1', 'Ankit Dev', 'ankit@example.com', NULL, 'admin', 1),
('admin_2', 'Beacon Admin', 'admin@beacon.app', NULL, 'admin', 1),
('usr_seed_2', 'Priya Mehta', 'priya@beacon.app', NULL, 'member', 0),
('usr_seed_3', 'Marcus Webb', 'marcus@beacon.app', NULL, 'member', 0),
('usr_seed_4', 'Yuna Park', 'yuna@beacon.app', NULL, 'member', 0),
('usr_seed_5', 'Sam Okafor', 'sam@beacon.app', NULL, 'member', 0);

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
