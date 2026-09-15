// Runs in front of every request to this site. Without this, index.html
// (which bakes a snapshot of the board straight into its HTML as a fallback)
// would be readable by anyone who can reach the URL, login screen or not —
// a client-side check alone can't stop that. This is the actual access
// control; the per-function checks in board.mjs/card.mjs are a second layer.
import { sessionEmail } from "../lib/auth.mjs";

// login.html is the sign-in surface, and /.netlify/functions/auth is what it
// posts the Google credential to — both have to stay reachable while signed
// out, or nobody could ever sign in.
const PUBLIC_PATHS = new Set(["/login.html", "/favicon.ico"]);
const PUBLIC_PREFIXES = ["/.netlify/functions/auth"];

export default async (request, context) => {
  const url = new URL(request.url);

  if (PUBLIC_PATHS.has(url.pathname) || PUBLIC_PREFIXES.some(p => url.pathname.startsWith(p))) {
    return context.next();
  }

  const secret = Netlify.env.get("SESSION_SECRET");
  const email = secret ? sessionEmail(request, secret) : null;
  if (email) return context.next();

  if (url.pathname.startsWith("/.netlify/functions/")) {
    return new Response(JSON.stringify({ error: "Sign in with a curedclick.com Google account first." }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }

  return Response.redirect(new URL("/login.html", url), 302);
};

export const config = { path: "/*" };
