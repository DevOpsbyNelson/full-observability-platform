// Generates mixed traffic against the service so Grafana has logs, traces and
// metrics to show. The /demo routes need DEMO_ROUTES=true in .env.
//
// Usage: node scripts/traffic.mjs [baseUrl] [seconds] [requestsPerSecond]
//   node scripts/traffic.mjs                          # http://localhost:3001, 60 s, 5 rps
//   node scripts/traffic.mjs http://localhost:3001 300 10

const [baseUrl = 'http://localhost:3001', seconds = '60', rps = '5'] = process.argv.slice(2);

// [path, weight]: mostly healthy traffic with some 404s, slow requests and 500s.
const routes = [
  ['/', 45],
  ['/demo/work', 30],
  ['/not-found', 10],
  ['/demo/error', 10],
  ['/demo/slow?ms=2500', 5],
];
const totalWeight = routes.reduce((sum, [, weight]) => sum + weight, 0);

const pick = () => {
  let roll = Math.random() * totalWeight;
  for (const [path, weight] of routes) {
    roll -= weight;
    if (roll < 0) return path;
  }
  return routes[0][0];
};

const stats = new Map();
const errorTraces = [];
const slowTraces = [];

const hit = async () => {
  const path = pick();
  const key = path.split('?')[0];
  try {
    const res = await fetch(baseUrl + path);
    await res.arrayBuffer();
    const traceId = res.headers.get('x-trace-id');
    const entry = stats.get(key) ?? {};
    entry[res.status] = (entry[res.status] ?? 0) + 1;
    stats.set(key, entry);
    if (res.status >= 500 && errorTraces.length < 3) errorTraces.push(traceId);
    if (key === '/demo/slow' && slowTraces.length < 3) slowTraces.push(traceId);
  } catch (err) {
    const entry = stats.get(key) ?? {};
    entry.failed = (entry.failed ?? 0) + 1;
    stats.set(key, entry);
  }
};

console.log(`Sending ~${rps} req/s to ${baseUrl} for ${seconds}s…`);
const inFlight = new Set();
const timer = setInterval(() => {
  const request = hit().finally(() => inFlight.delete(request));
  inFlight.add(request);
}, 1000 / Number(rps));

setTimeout(async () => {
  clearInterval(timer);
  await Promise.all(inFlight);
  console.log('\nResponses by route and status:');
  for (const [route, counts] of stats) console.log(`  ${route.padEnd(14)} ${JSON.stringify(counts)}`);
  if (errorTraces.length) console.log(`\nSample 500 trace IDs (search them in Tempo):\n  ${errorTraces.join('\n  ')}`);
  if (slowTraces.length) console.log(`\nSample slow trace IDs:\n  ${slowTraces.join('\n  ')}`);
}, Number(seconds) * 1000);
