// Shared by both the Node functions (netlify/functions/) and the Deno edge
// gate (netlify/edge-functions/) — kept outside either directory so Netlify
// doesn't try to register it as a function of its own. Uses only node:crypto,
// which both runtimes support, so one implementation serves both.
import { createHmac, createPublicKey, verify as cryptoVerify, timingSafeEqual } from "node:crypto";

export const ALLOWED_DOMAIN = "curedclick.com";
export const SESSION_COOKIE = "cc_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, in seconds

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function bufToB64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let jwksCache = { keys: [], fetchedAt: 0 };
async function googleKey(kid) {
  if (!jwksCache.keys.length || Date.now() - jwksCache.fetchedAt > 60 * 60 * 1000) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!r.ok) throw new Error(`Could not fetch Google signing keys: ${r.status}`);
    jwksCache = { keys: (await r.json()).keys, fetchedAt: Date.now() };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  if (!jwk) throw new Error("Unknown Google signing key");
  return jwk;
}

// Verifies a Google-issued OIDC ID token end to end — signature, issuer,
// audience, expiry — and that the account is a verified @curedclick.com
// address. Throws on any failure; callers turn that into a 403.
export async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token.");
  const [h, p, s] = parts;
  const header = JSON.parse(b64urlToBuf(h));
  const payload = JSON.parse(b64urlToBuf(p));

  const jwk = await googleKey(header.kid);
  const key = createPublicKey({ key: jwk, format: "jwk" });
  if (!cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, b64urlToBuf(s))) {
    throw new Error("Bad token signature.");
  }
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new Error("Bad token issuer.");
  }
  if (payload.aud !== clientId) throw new Error("Token was not issued for this site.");
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("Token expired.");
  if (!payload.email_verified) throw new Error("Google email is not verified.");

  const email = String(payload.email || "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(`Only @${ALLOWED_DOMAIN} accounts may sign in.`);
  }
  return { email };
}

// Our own short-lived HS256 session, independent of Google — once issued,
// staying signed in never re-touches Google until it expires.
export function signSession(email, secret) {
  const header = bufToB64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bufToB64url(Buffer.from(JSON.stringify({
    email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL
  })));
  const sig = bufToB64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function verifySessionToken(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = bufToB64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(s), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlToBuf(p)); } catch { return null; }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  const email = String(payload.email || "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
  return { email };
}

export function readCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  return [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`].join("; ");
}
export const clearedSessionCookieHeader =
  `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// The email of the request's signed-in @curedclick.com user, or null.
export function sessionEmail(req, secret) {
  const session = verifySessionToken(readCookie(req, SESSION_COOKIE), secret);
  return session ? session.email : null;
}
