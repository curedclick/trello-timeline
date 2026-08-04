// Server-side proxy for the Trello REST API.
// The key and token stay in Netlify environment variables and are never sent
// to the browser. The browser only ever sees the normalised card list below.

// cardRole must be requested explicitly or the separator filter below is a no-op.
const FIELDS = "name,url,due,start,idList,dueComplete,closed,labels,cardRole";

export default async () => {
  const { TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

  if (!TRELLO_KEY || !TRELLO_TOKEN || !TRELLO_BOARD_ID) {
    return json(
      { error: "Missing TRELLO_KEY, TRELLO_TOKEN or TRELLO_BOARD_ID in the site environment variables." },
      500
    );
  }

  const auth = `key=${encodeURIComponent(TRELLO_KEY)}&token=${encodeURIComponent(TRELLO_TOKEN)}`;
  const base = `https://api.trello.com/1/boards/${encodeURIComponent(TRELLO_BOARD_ID)}`;

  try {
    const [lists, cards] = await Promise.all([
      get(`${base}/lists?fields=name&${auth}`),
      get(`${base}/cards?fields=${FIELDS}&${auth}`)
    ]);

    const listName = new Map(lists.map(l => [l.id, l.name]));

    // Cards in a "Goals" list are markers, not work: they become vertical lines
    // on the chart and must not show up as rows or count towards open cards.
    const goalListIds = new Set(
      lists.filter(l => isGoalList(l.name)).map(l => l.id)
    );

    const live = cards.filter(c => !c.closed && c.cardRole !== "separator");
    const shape = c => ({
      id: c.id,
      name: c.name,
      url: c.url,
      list: listName.get(c.idList) || "Other",
      due: c.due || null,
      start: c.start || null,
      dueComplete: !!c.dueComplete,
      labels: (c.labels || []).map(l => ({ name: l.name, color: l.color }))
    });

    const payload = {
      board: "Cured Click",
      boardUrl: `https://trello.com/b/${TRELLO_BOARD_ID}`,
      capturedAt: new Date().toISOString().slice(0, 10),
      cards: live.filter(c => !goalListIds.has(c.idList)).map(shape),
      milestones: live
        .filter(c => goalListIds.has(c.idList) && c.due)
        .map(shape)
        .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    };

    // Never cached. Refresh must always show the board as it is right now, and
    // an edge-cached copy would also let a just-saved edit read back stale.
    return json(payload, 200, { "cache-control": "no-store" });
  } catch (err) {
    return json({ error: `Could not reach Trello: ${err.message}` }, 502);
  }
};

// Tolerant of emoji and casing, the same way the browser folds list names.
function isGoalList(name) {
  const flat = String(name || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ");
  return /\b(goal|goals|milestone|milestones)\b/.test(flat);
}

async function get(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Trello responded ${r.status}`);
  return r.json();
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra }
  });
}
