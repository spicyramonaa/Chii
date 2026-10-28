import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const dataFile = path.join(dataDir, 'complaints.json');
const port = Number(process.env.PORT || 3000);
const pin = process.env.ADMIN_PIN || '';
const secret = process.env.SESSION_SECRET || '';
const isProduction = process.env.NODE_ENV === 'production';
const sessions = new Map();
let loginAttempts = [];
let queue = Promise.resolve();

if (!/^\d{6}$/.test(pin) || !secret || secret.length < 32) {
  console.error('Set ADMIN_PIN to exactly 6 digits and SESSION_SECRET to at least 32 characters before starting.');
  process.exit(1);
}
await mkdir(dataDir, { recursive: true });
try { await readFile(dataFile); } catch { await writeFile(dataFile, '[]\n', { flag: 'wx' }).catch(() => {}); }

const digest = value => createHash('sha256').update(value).digest();
function secureEqual(a, b) { return timingSafeEqual(digest(a), digest(b)); }
function sessionCookie(token, maxAge = 60 * 60 * 8) {
  return `ops_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split(/=(.*)/s).slice(0, 2)).filter(x => x.length === 2));
}
function isAdmin(req) {
  const token = parseCookies(req).ops_session;
  const expires = sessions.get(token);
  if (!token || !expires) return false;
  if (expires < Date.now()) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return true;
}
async function body(req, limit = 20_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error('too_large');
  }
  return JSON.parse(raw || '{}');
}
async function readComplaints() { return JSON.parse(await readFile(dataFile, 'utf8')); }
function updateStore(fn) {
  queue = queue.then(async () => {
    const list = await readComplaints();
    const result = fn(list);
    const temp = `${dataFile}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, dataFile);
    return result;
  });
  return queue;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/complaints') {
      const input = await body(req);
      const category = ['Team & communication', 'Work environment', 'Supervisor', 'Workload & scheduling', 'Safety concern', 'Other'].includes(input.category) ? input.category : '';
      const details = typeof input.details === 'string' ? input.details.trim() : '';
      const impact = typeof input.impact === 'string' ? input.impact.trim().slice(0, 500) : '';
      if (!category || details.length < 20 || details.length > 5000) return send(res, 400, { error: 'Choose a category and write 20–5,000 characters.' });
      const item = { id: randomBytes(6).toString('hex').toUpperCase(), category, details, impact, createdAt: new Date().toISOString(), status: 'New' };
      await updateStore(list => list.unshift(item));
      return send(res, 201, { ok: true, receipt: item.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      loginAttempts = loginAttempts.filter(at => Date.now() - at < 15 * 60 * 1000);
      if (loginAttempts.length >= 10) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      const input = await body(req, 1000);
      if (typeof input.pin !== 'string' || !secureEqual(input.pin, pin)) {
        loginAttempts.push(Date.now());
        return send(res, 401, { error: 'That PIN did not match.' });
      }
      loginAttempts = [];
      const token = createHmac('sha256', secret).update(randomBytes(32)).digest('hex');
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = parseCookies(req).ops_session;
      sessions.delete(token);
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Please sign in.' });
      if (req.method === 'GET' && url.pathname === '/api/admin/complaints') return send(res, 200, { complaints: await readComplaints() });
      const match = url.pathname.match(/^\/api\/admin\/complaints\/([A-F0-9]+)$/);
      if (req.method === 'PATCH' && match) {
        const input = await body(req, 1000);
        if (!['New', 'Reviewing', 'Resolved'].includes(input.status)) return send(res, 400, { error: 'Invalid status.' });
        const found = await updateStore(list => { const item = list.find(x => x.id === match[1]); if (item) item.status = input.status; return Boolean(item); });
        return found ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found.' });
      }
      if (req.method === 'DELETE' && match) {
        const found = await updateStore(list => { const at = list.findIndex(x => x.id === match[1]); if (at < 0) return false; list.splice(at, 1); return true; });
        return found ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found.' });
      }
      return send(res, 404, { error: 'Not found.' });
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
      return res.end(await readFile(path.join(root, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
      return res.end(await readFile(path.join(root, 'app.js')));
    }
    send(res, 404, { error: 'Not found.' });
  } catch (error) {
    send(res, error.message === 'too_large' ? 413 : 400, { error: error.message === 'too_large' ? 'Request too large.' : 'Could not process that request.' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Complaint portal ready on port ${port}`));
