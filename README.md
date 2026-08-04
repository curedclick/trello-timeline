# Cured Click delivery chart

A single-page timeline view of the Cured Click Trello board: due dates on a date
axis, a weekly load trace, a today line and a quarter goal line.

No build step, no framework, no dependencies. Two files do the work:

| File | Job |
| --- | --- |
| `public/index.html` | The whole UI, plus a baked-in snapshot of the board so the page renders before credentials are wired up |
| `netlify/functions/board.mjs` | Server-side proxy that calls Trello with your key and token and returns a normalised card list |
| `netlify/functions/card.mjs` | The only endpoint that writes: pushes staged due-date changes back to Trello |

The layout matters. `public/` is the publish directory and `netlify/functions/`
sits outside it, so the function is bundled as a function instead of being
served as a static file. Keep `netlify.toml` at the repository root.

```
repo-root/
├── netlify.toml
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── snapshot.json
└── netlify/
    └── functions/
        └── board.mjs
```

## Why the function exists

Trello's REST API needs an API key and a personal token. That token can read and
write everything your Trello account can see. If the page called Trello directly
from the browser, the token would be in the page source and anyone who found the
Netlify URL could act as you.

The function keeps both values in Netlify environment variables. The browser only
ever receives card names, lists, labels and dates.

## Deploy

1. Push this folder to a Git repo.
2. In Netlify, **Add new site → Import an existing project**, pick the repo.
   Leave the build command empty. `netlify.toml` sets the publish directory.
3. **Site configuration → Environment variables**, add three:

   | Key | Value |
   | --- | --- |
   | `TRELLO_KEY` | Your API key |
   | `TRELLO_TOKEN` | Your API token |
   | `TRELLO_BOARD_ID` | `AXZ7BiTv` |
   | `CC_WRITE_KEY` | *Optional.* A passphrase required for saving date changes |

   Get the key and token from <https://trello.com/power-ups/admin> — create a
   Power-Up, open the **API key** tab, copy the key, then use the *Token* link
   beside it to generate a token.
4. Deploy. The status pill top-right should read **live from Trello**.

The token needs **write** scope for drag-to-reschedule; read-only tokens will
save nothing and report a 401 in the pending bar.

## Rescheduling cards

Drag a diamond along its row to move a due date, or focus it and use the arrow
keys (Shift for a week at a time). Nothing reaches Trello until you press
**Save to Trello** in the bar at the bottom, so a mis-drag costs nothing —
**Discard** puts everything back. While an edit is staged the row is amber, a
dashed ghost diamond marks where Trello still has the card, and rows hold their
position so nothing jumps around under the cursor. Only the calendar day
changes; each card keeps its original time of day.

If a save partially fails, the cards that saved are committed and the ones that
failed stay pending with the error shown — press Save again to retry just those.

**`CC_WRITE_KEY` matters here.** Leave it unset and anyone who can reach
`/.netlify/functions/card` can rewrite your board's due dates with no login.
Set it and the browser asks once for the passphrase, then remembers it. Reads
are unaffected either way. See *Lock the site down* below — that advice now
covers writes, not just card names.

## Lock the site down

The chart exposes card names and your delivery dates, so do not leave it on a
public URL. Either option is on the free tier:

- **Netlify Identity** with invite-only registration, plus this in `netlify.toml`:

  ```toml
  [[headers]]
    for = "/*"
    [headers.values]
      x-robots-tag = "noindex"
  ```

- Or leave the site as a **Deploy Preview only** and never publish to production.

Password protection on a whole site is a paid feature, so Identity is the free
route.

## Configure

Near the top of the `<script>` block in `public/index.html`:

```js
const CONFIG = {
  goalDate:     "2026-09-30",  // the quarter goal line
  goalName:     "Q3 goal",
  quarterStart: "2026-07-01",  // the "Quarter" window
  quarterEnd:   "2026-09-30",
  pxPerDay:     15             // raise for a wider, more spread-out chart
};
```

The goal date is also editable in the page for a quick what-if. Editing `CONFIG`
makes it the default.

## Refreshing the snapshot

The baked-in snapshot is only a fallback for when the function is unreachable.
To refresh it, replace the JSON inside
`<script type="application/json" id="snapshot">` with the output of
`/.netlify/functions/board`.

## One thing to fix in Trello

A card only appears on the chart if it has a **due date**. Cards without one are
listed under the chart so they are not silently lost.

Nothing on the board currently has a **start date**, so every card renders as a
single diamond at its deadline rather than a bar showing duration. If you want
true Gantt bars, add start dates in Trello — the chart already draws a bar
whenever a start date is present, so no code change is needed.
