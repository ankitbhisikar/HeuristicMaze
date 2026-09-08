// ── data.js ────────────────────────────────────────────────────
// Dashboard data — incidents, on-call roster, stats, services.
// In a real app these would come from a database / REST API.

const BEACON_DATA = {

  stats: {
    openIncidents:   3,
    avgAckTime:      '47s',
    servicesHealthy: '98.2%',
    healthyCount:    214,
    totalServices:   218,
    onCallCount:     4,
    nextRotation:    '6h',
  },

  incidents: [
    { id: '#4824', service: 'checkout-api',    title: 'Latency p99 > 2.4s',    severity: 'critical',  status: 'open',         owner: '@priya',  age: '4m ago'  },
    { id: '#4823', service: 'auth-service',    title: 'Error rate spike 3.2%', severity: 'high',      status: 'acknowledged', owner: '@marcus', age: '18m ago' },
    { id: '#4822', service: 'search-indexer',  title: 'Queue depth > 50k',     severity: 'high',      status: 'acknowledged', owner: '@yuna',   age: '31m ago' },
    { id: '#4821', service: 'notification-svc',title: 'Delivery delay',         severity: 'low',       status: 'resolved',     owner: '@sam',    age: '12m ago' },
    { id: '#4820', service: 'billing-api',     title: 'Cert expiry warning',    severity: 'low',       status: 'resolved',     owner: '@priya',  age: '1h ago'  },
  ],

  oncall: [
    { name: 'Priya Mehta', role: 'Platform · primary',   initials: 'P', color: 'violet', shift: 'until 23:00' },
    { name: 'Marcus Webb', role: 'Auth · primary',        initials: 'M', color: 'green',  shift: 'until 23:00' },
    { name: 'Yuna Park',   role: 'Search · primary',      initials: 'Y', color: 'amber',  shift: 'until 23:00' },
    { name: 'Sam Okafor',  role: 'Infra · secondary',     initials: 'S', color: 'red',    shift: 'backup'      },
  ],

  services: [
    { name: 'checkout-api',    status: 'degraded', uptime: '99.1%',  latency: '842ms' },
    { name: 'auth-service',    status: 'degraded', uptime: '98.4%',  latency: '310ms' },
    { name: 'search-indexer',  status: 'degraded', uptime: '99.6%',  latency: '120ms' },
    { name: 'payment-gateway', status: 'healthy',  uptime: '99.99%', latency: '56ms'  },
    { name: 'notification-svc',status: 'healthy',  uptime: '99.8%',  latency: '78ms'  },
    { name: 'billing-api',     status: 'healthy',  uptime: '99.95%', latency: '91ms'  },
  ],

};
