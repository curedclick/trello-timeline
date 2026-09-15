# Cured Click delivery chart

A single-page timeline view of the Cured Click Trello board: due dates on a date
axis, a weekly load trace, a today line and a quarter goal line.

No build step, no framework, no dependencies. Two files do the work:

| File | Job |
| --- | --- |
| `public/index.html` | The whole UI, plus a baked-in snapshot of the board so the page renders before credentials are wired up |
| `public/login.html` | The sign-in page — the one page reachable without a session |
| `netlify/functions/board.mjs` | Server-side proxy that calls Trello with your key and token and returns a normalised card list |
| `netlify/functions/card.mjs` | The only endpoint that writes: pushes staged due-date changes back to Trello |
| `netlify/functions/auth.mjs` | Verifies a Google sign-in and issues a session cookie — see *Sign-in* below |
| `netlify/functions/logout.mjs` | Clears the session cookie |
| `netlify/functions/me.mjs` | Tells the page who's signed in, for the masthead display |
| `netlify/lib/auth.mjs` | Session + Google token verification, shared by the functions above and the edge gate |
| `netlify/edge-functions/gate.mjs` | Runs in front of every request and redirects to `/login.html` without a valid session |

The layout matters. `public/` is the publish directory and `netlify/functions/`
sits outside it, so the function is bundled as a function instead of being
served as a static file. Keep `netlify.toml` at the repository root.

```
repo-root/
├── netlify.toml
├── public/
│   ├── index.html
│   ├── login.html
│   └── favicon.ico
└── netlify/
    ├── functions/
    │   ├── board.mjs
    │   ├── card.mjs
    │   ├── auth.mjs
    │   ├── logout.mjs
    │   └── me.mjs
    ├── lib/
    │   └── auth.mjs
    └── edge-functions/
        └── gate.mjs
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
3. **Site configuration → Environment variables**, add:

   | Key | Value |
   | --- | --- |
   | `TRELLO_KEY` | Your API key |
   | `TRELLO_TOKEN` | Your API token |
   | `TRELLO_BOARD_ID` | `AXZ7BiTv` |
   | `CC_WRITE_KEY` | *Optional.* A passphrase required for saving date changes, on top of sign-in |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth client ID — see *Sign-in* below |
   | `SESSION_SECRET` | A long random string — see *Sign-in* below |

   Get the key and token from <https://trello.com/power-ups/admin> — create a
   Power-Up, open the **API key** tab, copy the key, then use the *Token* link
   beside it to generate a token.

   **`GOOGLE_CLIENT_ID` and `SESSION_SECRET` need their scope to include
   Functions** (Netlify's env var editor lets you pick scopes per variable) —
   edge functions only see variables scoped that way, and the sign-in gate is
   an edge function.
4. Deploy. The status pill top-right should read **live from Trello**.

The token needs **write** scope for drag-to-reschedule; read-only tokens will
save nothing and report a 401 in the pending bar.

Both functions send `cache-control: no-store`, so **Refresh** always hits Trello
and never reads an edge-cached copy.

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

**`CC_WRITE_KEY` is optional, on top of sign-in** (see *Sign-in* below, which
is what actually keeps the board off-limits to anyone outside
`@curedclick.com`). Set it and the browser asks once for the extra
passphrase, then remembers it — a second factor for anyone who'd rather not
rely on the Google gate alone for writes specifically.

## Sign-in

The chart exposes card names and delivery dates, so it's gated end to end:
sign in with a Google account, and only `@curedclick.com` addresses are let
in. Nothing about this depends on Netlify Identity (deprecated for new sites)
— it's a small amount of first-party code, all in this repo:

1. **Every request is intercepted at the edge** by
   `netlify/edge-functions/gate.mjs`, which runs before Netlify serves
   anything — including `index.html` itself. Without a valid session cookie
   it redirects to `/login.html`. This matters because `index.html` bakes a
   snapshot of the board straight into its HTML for the instant-render
   fallback; a check inside the page's own JavaScript couldn't stop someone
   from just reading that snapshot out of the page source, so the gate has to
   sit in front of the file, not inside it.
2. **`login.html`** is the one page reachable without a session. It renders a
   Sign In With Google button (Google Identity Services, loaded from
   `accounts.google.com`) and posts the resulting credential to
   `/.netlify/functions/auth`.
3. **`auth.mjs`** verifies that credential is a genuine, unexpired Google ID
   token (checking its signature against Google's public keys, issuer and
   audience) and that the account's own email is a verified
   `@curedclick.com` address — not just an email typed into a form. It then
   issues its own signed session cookie, good for 30 days.
4. **`board.mjs` and `card.mjs`** check that same session before doing
   anything, as a second layer independent of the edge gate.

### Set it up

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
   - **Authorized JavaScript origins:** your site's URL, e.g.
     `https://cured-click-chart.netlify.app` (and `http://localhost:8888` too
     if you test with `netlify dev`).
   - No redirect URI is needed — this is a token flow, not a redirect flow.
2. Copy the client ID (ends in `.apps.googleusercontent.com`) into **two**
   places — they must match exactly:
   - `GOOGLE_CLIENT_ID` in Netlify's site environment variables (scoped to
     include Functions, per the table above).
   - The `GOOGLE_CLIENT_ID` constant near the top of the `<script>` block in
     `public/login.html`.
3. Set `SESSION_SECRET` in Netlify's environment variables to a long random
   string (e.g. `openssl rand -hex 32`), scoped to include Functions. This
   signs the session cookie — anyone who has it could forge a session, so
   treat it like a password and never commit it.
4. Deploy, then open the site in a private window. It should redirect to
   `/login.html`; signing in with a `@curedclick.com` Google account should
   land you back on the chart, and any other Google account should be
   rejected with an error on the login page.

Google Sign In needs neither a client secret nor a server-side OAuth dance —
the ID-token flow only ever needs the client ID, which is not a secret and is
safe to have in `login.html`'s source.

## Goals live on the board, not in the code

Make a list called **Goals** on the Trello board. Every card in it with a due
date becomes a vertical line on the chart: the card's **name** labels the line,
its **due date** places it. Goal cards are held back from the chart rows and
from the vitals counts, so they never read as outstanding work.

- The **next goal still ahead** drives the countdown in the masthead, and its
  date is editable there — that edit stages like any other and saves with the
  same button.
- Give a goal card a **start date** as well and that start→due span becomes the
  **Quarter** view's window. Handy for a quarter that does not line up with the
  calendar. If several goals carry spans, the narrowest one containing today
  wins.
- With **no Goals list at all** the chart still works: it derives the end of the
  calendar quarter containing today, labels it *Quarter end*, and says `auto` in
  place of the date editor.

The list is matched loosely — `Goals`, `🎯 Goals`, `Milestones` all work.

## Configure

One value, near the top of the `<script>` block in `public/index.html`:

```js
const CONFIG = { pxPerDay: 15 };  // raise for a wider, more spread-out chart
```

Everything else that used to live here — goal date, goal name, quarter start and
end — now comes from the board or is derived from today's date.

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
