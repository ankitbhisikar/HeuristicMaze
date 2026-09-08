// ── query-db.js ───────────────────────────────────────────────────
// Command-line tool to inspect and query the SQLite database (`beacon.db`)
// Usage:
//   node query-db.js                         (Displays summary & all tables)
//   node query-db.js "SELECT * FROM oncall"  (Executes any custom SQL query)
// ──────────────────────────────────────────────────────────────────

const db = require('./database.js');

const queryArg = process.argv[2];

function printHeader(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

try {
  db.initDatabase();

  if (queryArg) {
    printHeader(`EXECUTING CUSTOM SQL QUERY: ${queryArg}`);
    const results = db.executeRawQuery(queryArg);
    if (!results || results.length === 0) {
      console.log('Query returned 0 rows or executed successfully.');
    } else {
      console.table(results);
      console.log(`\nTotal rows: ${results.length}`);
    }
    process.exit(0);
  }

  // Default view: show summary and all tables
  printHeader('BEACON SQL DATABASE INSPECTOR (beacon.db)');

  console.log('\n📊 1. LIVE INCIDENTS TABLE (incidents):');
  const incidents = db.getAllIncidents();
  if (incidents.length > 0) {
    console.table(incidents.map(i => ({
      ID: i.display_id,
      Service: i.service,
      Title: i.title,
      Severity: i.severity,
      Status: i.status,
      Owner: i.owner,
      Created: i.created_at
    })));
  } else {
    console.log('  (No incidents found)');
  }

  console.log('\n👥 2. ON-CALL ROSTER TABLE (oncall):');
  const oncall = db.getOncallRoster();
  console.table(oncall.map(o => ({
    Order: o.sort_order,
    Name: o.name,
    Role: o.role,
    Shift: o.shift
  })));

  console.log('\n⚡ 3. MONITORED SERVICES TABLE (services):');
  const services = db.getServices();
  console.table(services.map(s => ({
    Name: s.name,
    Status: s.status,
    Uptime: s.uptime,
    Latency: s.latency
  })));

  console.log('\n📈 4. COMPUTED SQL AGGREGATE STATS:');
  const stats = db.getStats();
  console.log(JSON.stringify(stats, null, 2));

  printHeader('HOW TO RUN RAW SQL QUERIES');
  console.log('Run any SQL statement from terminal:');
  console.log('  node query-db.js "SELECT * FROM incidents WHERE status = \'open\';"');
  console.log('  node query-db.js "SELECT service, count(*) as count FROM incidents GROUP BY service;"');
  console.log('  node query-db.js "SELECT * FROM services WHERE status = \'healthy\';"');
  console.log('='.repeat(60) + '\n');

} catch (err) {
  console.error('❌ SQL Error:', err.message);
  process.exit(1);
}
