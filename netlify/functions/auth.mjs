// Exchanges a Google ID token (from the Sign In With Google button on
// login.html) for our own session cookie, after checking the account is a
// verified @curedclick.com address. This is the one endpoint the edge gate
// (netlify/edge-functions/gate.mjs) lets through unauthenticated — it's the
// front door.
import { verifyGoogleIdToken, signSession, sessionCookieHeader } from "../lib/auth.mjs";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default async (req) => {
  const { GOOGLE_CLIENT_ID, SESSION_SECRET } = process.env;

  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!GOOGLE_CLIENT_ID || !SESSION_SECRET) {
    return json({ error: "Missing GOOGLE_CLIENT_ID or SESSION_SECRET in the site environment variables." }, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
  if (!body?.credential) return json({ error: "Missing credential." }, 400);

  let user;
  try {
    user = await verifyGoogleIdToken(body.credential, GOOGLE_CLIENT_ID);
  } catch (err) {
    return json({ error: err.message }, 403);
  }

  const token = signSession(user.email, SESSION_SECRET);
  return new Response(JSON.stringify({ email: user.email }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": sessionCookieHeader(token, SESSION_MAX_AGE)
    }
  });
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
