// Server-side proxy for writing card due dates back to Trello.
// Reads live in board.mjs; this file is the only place that mutates anything.
//
// Set CC_WRITE_KEY in the site environment to require a shared passphrase on
// every write. Leave it unset and writes are open to anyone who can reach the
// endpoint — acceptable only while the site itself is not publicly reachable.

const MAX_EDITS = 60;
const ID_RE = /^[0-9a-f]{24}$/i;

export default async (req) => {
  const { TRELLO_KEY, TRELLO_TOKEN, CC_WRITE_KEY } = process.env;

  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  if (!TRELLO_KEY || !TRELLO_TOKEN) {
    return json({ error: "Missing TRELLO_KEY or TRELLO_TOKEN in the site environment variables." }, 500);
  }

  if (CC_WRITE_KEY && req.headers.get("x-cc-key") !== CC_WRITE_KEY) {
    return json({ error: "Wrong or missing write passphrase." }, 403);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON." }, 400); }

  const edits = Array.isArray(body?.edits) ? body.edits : [];
  if (!edits.length) return json({ error: "No edits supplied." }, 400);
  if (edits.length > MAX_EDITS) return json({ error: `Too many edits (max ${MAX_EDITS}).` }, 400);

  for (const e of edits) {
    if (!ID_RE.test(e?.id || "")) return json({ error: `Not a Trello card id: ${e?.id}` }, 400);
    // null clears the due date; anything else must be a real timestamp.
    if (e.due !== null && Number.isNaN(Date.parse(e?.due))) {
      return json({ error: `Not a valid date: ${e?.due}` }, 400);
    }
  }

  const auth = `key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`;
  const results = [];

  // Sequential on purpose: a handful of edits, and Trello rate-limits bursts
  // (100 requests per 10s per token). Order also makes failures easier to read.
  for (const e of edits) {
    const due = e.due === null ? "" : new Date(e.due).toISOString();
    const url = `https://api.trello.com/1/cards/${encodeURIComponent(e.id)}?due=${encodeURIComponent(due)}&${auth}`;
    try {
      const r = await fetch(url, { method: "PUT", headers: { accept: "application/json" } });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 200);
        results.push({ id: e.id, ok: false, error: `Trello responded ${r.status}: ${detail}` });
        continue;
      }
      const card = await r.json();
      results.push({ id: e.id, ok: true, due: card.due ?? null });
    } catch (err) {
      results.push({ id: e.id, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  return json({ saved: results.length - failed.length, failed: failed.length, results },
              failed.length ? 207 : 200);
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
