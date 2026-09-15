// Tells index.html who's signed in, for the "signed in as" display and the
// sign-out button. Not itself a gate — the edge function already guarantees
// nothing reaches this far without a valid session.
import { sessionEmail } from "../lib/auth.mjs";

export default async (req) => {
  const { SESSION_SECRET } = process.env;
  const email = SESSION_SECRET ? sessionEmail(req, SESSION_SECRET) : null;
  return new Response(JSON.stringify({ email }), {
    status: email ? 200 : 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
};
