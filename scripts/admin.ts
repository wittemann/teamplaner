// Calls the Admin API with the token (and Vercel bypass) from the env file, so no secret ever
// appears on a command line. Used by Claude (skill teamplaner-admin).
//
//   node scripts/admin.ts GET /teams                 local (.env, http://localhost:4321)
//   node scripts/admin.ts --neon GET /events?team=…  production (.env.neon)
//   node scripts/admin.ts --neon POST /coaches '{"name":"…"}'
const args = process.argv.slice(2);
const neon = args[0] === '--neon';
if (neon) args.shift();
const [method, path, body] = args;
if (!method || !path?.startsWith('/')) {
  console.error('Usage: node scripts/admin.ts [--neon] METHOD /path [json-body]');
  process.exit(1);
}

process.loadEnvFile(neon ? '.env.neon' : '.env');
const base = neon
  ? (process.env.ADMIN_BASE_URL ?? 'https://teamplaner-kappa.vercel.app')
  : 'http://localhost:4321';
const headers: Record<string, string> = {
  authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
  'content-type': 'application/json',
};
if (neon && process.env.VERCEL_BYPASS) {
  headers['x-vercel-protection-bypass'] = process.env.VERCEL_BYPASS;
}

const response = await fetch(`${base}/api/admin${path}`, { method, headers, body });
const text = await response.text();
console.log(response.ok ? text : `HTTP ${response.status}\n${text.slice(0, 2000)}`);
if (!response.ok) process.exit(1);
