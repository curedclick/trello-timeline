# Cured Click delivery chart

A single-page timeline view of the Cured Click Trello board: due dates on a date
axis, a weekly load trace, a today line and a quarter goal line.

No build step, no framework, no dependencies. Two files do the work:

| File | Job |
| --- | --- |
| `index.html` | The whole UI, plus a baked-in snapshot of the board so the page renders before credentials are wired up |
| `netlify/functions/board.mjs` | Server-side proxy that calls Trello with your key and token and returns a normalised card list |

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
   Leave the build command empty and the publish directory as `.`.
3. **Site configuration → Environment variables**, add three:

   | Key | Value |
   | --- | --- |
   | `TRELLO_KEY` | Your API key |
   | `TRELLO_TOKEN` | Your API token |
   | `TRELLO_BOARD_ID` | `AXZ7BiTv` |

   Get the key and token from <https://trello.com/power-ups/admin> — create a
   Power-Up, open the **API key** tab, copy the key, then use the *Token* link
   beside it to generate a token.
4. Deploy. The status pill top-right should read **live from Trello**.

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

Near the top of the `<script>` block in `index.html`:

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
