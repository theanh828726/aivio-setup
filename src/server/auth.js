/**
 * Admin login for the Setup UI.
 *
 * The Setup UI can install plugins, restart services and edit files on the machine, so it must
 * never answer an unauthenticated request that came from the network. Rules:
 *
 *   - A password is stored as an scrypt hash in ~/.aivio-setup/auth.json (0600). Set it with
 *     `create-aivio-bot --set-password` (or AIVIO_ADMIN_PASSWORD at startup).
 *   - Once a password exists, every request needs a valid session cookie.
 *   - Without a password, only plain loopback requests are served. Anything that looks proxied
 *     (Forwarded / X-Forwarded-* / X-Real-IP) or arrives on a non-loopback socket or Host header
 *     is refused, so putting Nginx in front of an install that forgot to set a password fails
 *     closed instead of exposing the machine.
 *   - Sessions are stateless HMAC-signed cookies bound to the password version: changing the
 *     password signs every device out.
 *   - Failed logins are rate limited per client IP.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SESSION_COOKIE = 'aivio_session';
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 10;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

export function authFilePath() {
  const dir = process.env.AIVIO_SETUP_HOME || path.join(os.homedir(), '.aivio-setup');
  return path.join(dir, 'auth.json');
}

let cache = null;
let cacheMtime = 0;

/** Current auth record, re-read when the file changes (e.g. password set from another shell). */
export function loadAuth() {
  const file = authFilePath();
  try {
    const st = fs.statSync(file);
    if (cache && st.mtimeMs === cacheMtime) return cache;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || !data.hash || !data.salt || !data.secret) return null;
    cache = data;
    cacheMtime = st.mtimeMs;
    return cache;
  } catch {
    cache = null;
    cacheMtime = 0;
    return null;
  }
}

export function isPasswordConfigured() {
  return !!loadAuth();
}

function scrypt(password, salt) {
  return crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, maxmem: 64 * 1024 * 1024,
  });
}

export function validatePasswordStrength(password) {
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (/^(.)\1+$/.test(pw)) return 'Mật khẩu không được lặp một ký tự.';
  return '';
}

/** Hash and store a new password. Bumps the version so existing sessions stop working. */
export function setPassword(password) {
  const problem = validatePasswordStrength(password);
  if (problem) throw new Error(problem);
  const prev = loadAuth();
  const salt = crypto.randomBytes(16).toString('base64');
  const record = {
    algo: 'scrypt',
    params: SCRYPT_PARAMS,
    salt,
    hash: scrypt(password, salt).toString('base64'),
    secret: crypto.randomBytes(32).toString('base64'),
    version: (prev?.version || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const file = authFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
  cache = null;
  return record;
}

export function verifyPassword(password) {
  const auth = loadAuth();
  if (!auth) return false;
  const expected = Buffer.from(auth.hash, 'base64');
  const actual = scrypt(password, auth.salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', Buffer.from(secret, 'base64')).update(payload).digest('base64url');
}

export function issueSessionToken() {
  const auth = loadAuth();
  if (!auth) throw new Error('No password configured');
  const payload = Buffer.from(JSON.stringify({
    v: auth.version,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    n: crypto.randomBytes(8).toString('base64url'),
  })).toString('base64url');
  return `${payload}.${sign(payload, auth.secret)}`;
}

export function verifySessionToken(token) {
  const auth = loadAuth();
  if (!auth || !token || typeof token !== 'string') return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return false;
  const expected = Buffer.from(sign(payload, auth.secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.v === auth.version && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const LOOPBACK_RE = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/** True when the request came through a reverse proxy or from another machine. */
export function isRemoteRequest(req) {
  const h = req.headers;
  if (h.forwarded || h['x-forwarded-for'] || h['x-forwarded-host'] || h['x-forwarded-proto'] || h['x-real-ip']) return true;
  if (!LOOPBACK_RE.test(String(req.socket?.remoteAddress || ''))) return true;
  const host = String(h.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return !!host && !['localhost', '127.0.0.1', '::1'].includes(host) && !host.endsWith('.localhost');
}

/** HTTPS as seen by the browser (directly or via the proxy's X-Forwarded-Proto). */
export function isSecureRequest(req) {
  if (req.socket?.encrypted) return true;
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
}

export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '') || String(req.socket?.remoteAddress || 'unknown');
}

/**
 * auth decision for one request:
 *   { ok: true }                       serve it
 *   { ok: false, reason: 'login' }     needs a session (redirect page / 401 API)
 *   { ok: false, reason: 'no-password' } remote request but no password configured
 */
export function checkRequest(req) {
  const configured = isPasswordConfigured();
  if (!configured) {
    return isRemoteRequest(req) ? { ok: false, reason: 'no-password' } : { ok: true, open: true };
  }
  const token = parseCookies(req)[SESSION_COOKIE];
  return verifySessionToken(token) ? { ok: true } : { ok: false, reason: 'login' };
}

/**
 * Cross-site request guard for state-changing calls. SameSite=Strict already keeps the cookie off
 * cross-site requests; this also refuses a foreign Origin outright.
 */
export function originAllowed(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl) carry no Origin and no cookie of ours by default
  try {
    const o = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return o.host === host;
  } catch {
    return false;
  }
}

export function sessionCookie(req, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SEC}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(req) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

const failures = new Map();

/** ms until this IP may try again (0 = allowed). */
export function loginBlockedFor(ip) {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  failures.set(ip, list);
  if (list.length < LOGIN_MAX_FAILURES) return 0;
  return LOGIN_WINDOW_MS - (now - list[0]);
}

export function recordLoginFailure(ip) {
  const list = failures.get(ip) || [];
  list.push(Date.now());
  failures.set(ip, list);
}

export function clearLoginFailures(ip) {
  failures.delete(ip);
}
