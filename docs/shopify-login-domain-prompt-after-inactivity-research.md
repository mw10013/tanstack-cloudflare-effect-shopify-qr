# Shopify Login "Domain Prompt" After Inactivity

## What Is Actually Happening

After some inactivity, clicking an in-app action like "Create QR code" can land the embedded app on `/auth/login`, which renders a form asking for a shop domain.

That symptom is real in the current codebase:

- The QR index CTA is `<s-button href="/app/qrcodes/new" ...>` in `src/routes/app.index.tsx:45,103`.
- The target route is `/app/qrcodes/$handle`, with the `new` case handled by `src/routes/app.qrcodes.$handle.tsx:45-149`.
- Auth is enforced at the `/app` layout boundary in `src/routes/app.tsx:31-79` and again in server functions via `src/lib/ShopifyServerFnMiddleware.ts:46-83`.
- `shopify.authenticateAdmin` redirects document requests with missing `shop` or `host` to `/auth/login` in `src/lib/Shopify.ts:464-470`.

So the domain prompt is not random. It is the app's real `/auth/login` route.

## Why `/auth/login` Asks For A Domain

The `/auth/login` route is intentionally a generic Shopify login fallback:

- `src/routes/auth.login.ts:45-80` calls `shopify.login(request)` on both GET and POST.
- `src/lib/Shopify.ts:561-595` mirrors Shopify's `loginFactory` behavior.
- On `GET /auth/login` with no `shop` query param, `shopify.login()` returns `{}` and the route renders the HTML form asking for `shop`.

That is upstream Shopify behavior too:

```ts
if (request.method === 'GET' && !shopParam) {
  return {};
}
```

`refs/shopify-app-js/packages/apps/shopify-app-remix/src/server/authenticate/login/login.ts:8-18`

And Shopify's docs describe `shopify.login` as the helper used to create a login page with a shop-domain form:

- `refs/shopify-app-js/packages/apps/shopify-app-remix/src/server/types.ts:420-470`

So the weird part is not the form itself. The weird part is why an already-embedded merchant flow ends up there.

## `idToken()` Is Probably A Red Herring

The earlier theory spent too much time on App Bridge `idToken()` hanging.

That does not match the reported symptom.

The reported symptom is:

1. Merchant clicks an in-app link like "Create QR code".
2. The app comes back with `/auth/login` asking for a shop domain.
3. A browser refresh on that login page gets the merchant back into the app.

That is not a "the app visibly froze and then the merchant hard-refreshed out of frustration" story.

Current working assumption: `idToken()` hanging is not the issue here.

## Why Navigation Usually Works Without `shop` In The URL

You generally do not see `shop` in the browser address bar during normal embedded app navigation, and that is not inherently a bug.

In this app, normal embedded navigation is expected to work without visible Shopify auth params in the URL because:

- The `/app` tree is rendered inside Shopify Admin with App Bridge loaded by `src/components/AppProvider.tsx:13-30`.
- App Bridge + the `shopify:navigate` bridge convert Shopify web component links into client-side navigation.
- Auth for server-function and loader-like requests is expected to come from embedded request context, not from visible `shop`/`host` params on every URL.

So this is the important distinction:

- Normal in-app SPA navigation: visible `shop` param often not needed.
- Full document request to `/app/...`: `shopify.authenticateAdmin` may require `shop` and `host` and will redirect to `/auth/login` if they are missing.

That is exactly what `src/lib/Shopify.ts:464-470` does.

The current server log confirms this normal behavior directly.

In healthy navigation to `Create QR code`, the log shows:

- `pathname: /app/qrcodes/new`
- `hasAuthorizationHeader: true`
- `hasShop: false`
- `hasHost: false`
- `isDocumentRequest: false`
- followed by `event: return-existing-session`

See `logs/server.log:321-339`.

The child route server function also behaves the same way:

- `pathname: /_serverFn/...loadQrCode...`
- `hasAuthorizationHeader: true`
- `hasShop: false`
- `hasHost: false`
- `isDocumentRequest: false`

See `logs/server.log:349-365`.

So the normal steady-state path is now confirmed, not just inferred:

- the app does work without visible `shop` / `host`
- `/app/qrcodes/new` is normally authenticated via `Authorization`
- the observed bug is not simply "bare links do not carry `shop`"

## The Reference Apps Also Use Bare Internal Links

Yes. Both reference apps use bare internal links without carrying `shop` in the href.

### `refs/shopify-app-qr`

The QR reference uses the same kind of bare internal links:

- `<s-button href="/app/qrcodes/new">` in `refs/shopify-app-qr/app/routes/app._index.jsx:41-43`
- `<s-clickable href={`/app/qrcodes/${qrCode.handle}`}>` in `refs/shopify-app-qr/app/routes/app._index.jsx:84-98`
- `<s-link href={`/app/qrcodes/${qrCode.handle}`}>` in `refs/shopify-app-qr/app/routes/app._index.jsx:99-101`
- `<s-link slot="secondary-actions" href="/app/qrcodes/new">` in `refs/shopify-app-qr/app/routes/app._index.jsx:127-129`
- `<s-link href="/app">` in `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:187`

### `refs/shopify-app-template`

The template also uses bare internal links:

- `<s-link href="/app">Home</s-link>` in `refs/shopify-app-template/app/routes/app.tsx:21`
- `<s-link href="/app/additional">Additional page</s-link>` in `refs/shopify-app-template/app/routes/app.tsx:22`
- `<s-link href="/app/additional">` in `refs/shopify-app-template/app/routes/app._index.tsx:119`

So "bare internal link" by itself is not the bug. Shopify's own reference apps do it too.

## What "Fallback To A Document Navigation" Means

The phrase "link degrades" was too vague.

What I mean exactly is this:

- Intended behavior: clicking `<s-button href="/app/qrcodes/new">` is intercepted by the embedded app shell and handled as an in-app client-side route change.
- Failure behavior: the browser performs a normal full-page `GET /app/qrcodes/new` document request instead.

That is not a metaphor. It is a concrete difference in request shape.

Why it matters:

- For a client-side transition, the embedded app machinery can keep navigation inside the already-running app shell.
- For a full document request, `shopify.authenticateAdmin` runs its document-request path, and that path redirects to `/auth/login` when `shop` or `host` is missing.

The relevant branch is:

```ts
const isDocumentRequest = !headerSessionToken;

if (isDocumentRequest) {
  if (!shop || !host) {
    return Response.redirect(new URL("/auth/login", request.url).toString());
  }
}
```

`src/lib/Shopify.ts:464-470`

So the concrete question is not "did the link degrade?" in an abstract sense.

The concrete question is:

- Did this click become a full document request to `/app/qrcodes/new`?
- Or did some server-function request lose auth context and get rerouted?

## Current Best Hypothesis

Current best hypothesis:

1. Merchant is in the embedded app after inactivity.
2. Merchant clicks `Create QR code`.
3. Instead of staying in the normal client-side navigation path, the app winds up on a request path that `authenticateAdmin` treats as a document request.
4. That request lacks usable `shop` / `host`.
5. `authenticateAdmin` redirects to `/auth/login`.
6. `/auth/login` renders the generic shop-domain form because it has no `shop` query param.
7. Refresh reloads Shopify Admin and re-embeds the app, so the merchant gets back in.

What is still unproven is step 3: which exact request shape is failing.

## Confirmed Redirect Path To `/auth/login`

The confirmed redirect path is simple.

### Document Request Missing `shop` / `host`

`src/lib/Shopify.ts:464-470` redirects any document request with missing `shop` or `host` to `/auth/login`.

This matches upstream Shopify behavior too. Their tests expect missing `shop` / `host` on document requests to redirect to the login path:

- `refs/shopify-app-js/packages/apps/shopify-app-remix/src/server/authenticate/admin/__tests__/doc-request-path.test.ts:16-36`

### Redirect Responses Become Router Redirects

Both auth entry points convert redirect `Response`s into TanStack router redirects:

- `/app` layout `beforeLoad`: `src/routes/app.tsx:47-53`
- Server function middleware: `src/lib/ShopifyServerFnMiddleware.ts:52-58`

So once auth decides on `/auth/login`, the app can end up there immediately.

## Observability Now In Place

The auth-boundary diagnostics are now instrumented in code.

### `shopify.authenticateAdmin`

`src/lib/Shopify.ts:465-599` now logs:

- `event: start`
- request pathname and full URL
- whether `authorization` header exists
- whether `shop` exists
- whether `host` exists
- whether `id_token` exists
- computed `isDocumentRequest`
- redirect outcomes like `redirect-login-missing-shop-host`, `redirect-embedded-app-url`, `redirect-session-token-bounce`
- invalid-session outcomes after decode or token exchange
- successful session outcomes like `return-existing-session` and `store-exchanged-session`

This is the main signal we need.

### Call-Site Source Logs

We also now log which higher-level auth entry point reached `authenticateAdmin`:

- `src/routes/app.tsx:47-84` logs `source: app-beforeLoad-serverfn`
- `src/lib/ShopifyServerFnMiddleware.ts:52-84` logs `source: serverfn-middleware`

That matters because the same `/auth/login` redirect could be triggered from:

- the `/app` layout auth path
- or a child route server function

With the current logs, we should be able to tell those apart.

## Diagnostics Check

For the next reproduction, the current server-side diagnostics should be enough to answer the first-order question.

If the bug reappears, we should be able to tell:

- whether the failing auth call came from `app-beforeLoad-serverfn` or `serverfn-middleware`
- whether the failing request had `Authorization`
- whether it was treated as `isDocumentRequest: true`
- whether it redirected via `redirect-login-missing-shop-host`
- whether it instead bounced through `/auth/session-token` or failed as 401

That is enough to distinguish:

- full document-request fallback to `/auth/login`
- versus embedded auth/session failure on a server-function path

The one caveat is process lifetime.

- These logs are only useful if the failure happens before the dev server is restarted.
- After a restart, `logs/server.log` only shows post-restart requests, so an overnight transition that happened earlier is no longer observable from this file.

So for the next overnight/inactivity reproduction, the most important operational detail is: do not restart the dev server before checking the log.

If these logs still leave ambiguity after a real failure trace, the next increment would be client-side click/navigation telemetry. But that is not necessary yet.

## Morning Restart Observation

There is now one more real-world observation to account for.

After the local dev server was restarted in the morning, the already-open browser window was showing the shop-domain login form. It is unknown whether that transition happened:

- before the restart, during overnight inactivity
- or only after the restart

The visible UI was also mixed in a way that matters:

- the login domain form was visible
- stale app chrome was still visible too
- clicking the apparent `Create QR code` action repeatedly did nothing
- clicking the breadcrumb back to the home page recovered the app

That behavior does not cleanly match a fresh, ordinary `/auth/login` render.

## What The Restart-Era Log Actually Shows

The restarted log is short and only captures one post-start navigation/auth sequence:

- `logs/server.log:29-60` shows `/app` auth through `app-beforeLoad-serverfn`
- `logs/server.log:61-89` shows `/app` auth through `serverfn-middleware`

The important details from that sequence are:

- pathname is `/app`, not `/auth/login`
- `hasAuthorizationHeader: false`
- `hasShop: true`
- `hasHost: true`
- `hasIdToken: true`
- `isDocumentRequest: true`
- auth succeeds via `store-exchanged-session`, then `return-existing-session`

Just as important is what is not present anywhere in the restarted log:

- no `/auth/login` request
- no `/app/qrcodes/new` request
- no `redirect-login-missing-shop-host`
- no 401 or invalid-session outcome

So the restart-era log does not show the failure. It only shows a successful document request back into `/app` with valid Shopify auth parameters.

## What The Mixed UI Probably Means

The mixed UI is a useful clue.

The real `/auth/login` route is a standalone server response:

- `src/routes/auth.login.ts:18-43` returns raw HTML for the login page
- `src/routes/auth.login.ts:45-82` handles it entirely as a server route
- unlike the `/app` tree, it does not render `AppProvider`
- `src/components/AppProvider.tsx:13-30` is where the embedded App Bridge script and `shopify:navigate` wiring are installed

That means the login page itself is not the normal embedded app shell.

So if the login form was visible at the same time as stale app-level chrome, the most plausible interpretation is:

- the iframe content had already fallen back to the raw `/auth/login` page
- but Shopify Admin or App Bridge-driven chrome from the previous embedded route was still visually hanging around

That would also fit the click behavior:

- stale action UI can remain visible without being meaningfully wired to the current page
- a later navigation that causes a fresh document request to `/app` can recover the session and get the merchant back into the app

This is still a hypothesis, but it explains the "login form plus stale actions" observation better than the earlier assumption that the login page itself was rendering those controls.

## Updated Read On This Morning's Event

What the current evidence supports is narrower than a full root cause.

The most likely read is:

1. The browser was already in a bad post-inactivity state before the successful morning `/app` request that appears in the restarted log.
2. Restarting the dev server erased the earlier failure trace, so the log cannot tell us when the transition to the login form originally happened.
3. The visible stale chrome suggests the browser may have been showing raw `/auth/login` content inside an embedded shell that had not fully reset its previous top-bar state.
4. Clicking the breadcrumb likely triggered the first fresh, fully parameterized document request back to `/app`.
5. That `/app` request succeeded immediately, which is exactly what the restarted log shows.

## The Domain Form Is Useless For Embedded Merchants

The domain form at `GET /auth/login` with no `shop` param asks the merchant to type their shop domain. A merchant who arrived there from an embedded app click has no idea what that means and no easy way to find it.

Two distinct questions:

1. Why does the merchant end up at `/auth/login` at all? (The open research question above.)
2. What should happen once they are there? (The UX question below.)

### Why `renderExitIframePage(apiKey, null, appUrl)` Does Not Work (rejected)

An earlier draft proposed replacing the GET-without-`shop` branch in `auth.login.ts:58-61` with `renderExitIframePage(apiKey, null, shopify.config.appUrl)` (`src/lib/Shopify.ts:110-119`). It does not work:

- `renderExitIframePage` emits `<script>window.open(destination, "_top")</script>`, which navigates the **top** browsing context to `destination`.
- `shopify.config.appUrl` is the Cloudflare Worker host, NOT `https://admin.shopify.com/...`. So `_top` would leave Shopify Admin entirely.
- Outside Admin there is no parent providing `shop`/`host`/`id_token`, so the Worker just redirects to `/auth/login` again, which renders the same exit-iframe page, which `_top`-navigates again — a loop with the user stuck outside Admin.
- Re-entering Admin requires `https://admin.shopify.com/store/<shop>/apps/<app-handle>`, but `shop` is precisely what we are missing here. That is the same reason upstream `/auth/login` falls back to the domain form.

So this proposal is rejected. Recovery from `/auth/login` without `shop` cannot be automated from the server response alone. Fix the cause (iframe URL drift) instead, and degrade `/auth/login` UX as a safety net.

### Safe UX Fallback: "Your session expired" Message

A safe minimum, independent of any cause-side fix: replace the GET-without-`shop` branch in `auth.login.ts` with a plain message like "Your session has expired. Return to Shopify Admin to reopen the app." It does not attempt automatic recovery, but it stops asking merchants for information they cannot provide.

## How Embedded SPA Navigation Actually Works (Grounded)

The earlier sections kept asking "did this click degrade?" without spelling out the chain. Here is the chain, end to end, grounded in `docs/app-bridge-readable.js` and the Polaris-driven AppProvider pattern.

### Polaris is what dispatches `shopify:navigate` (verified from `polaris.js`)

App Bridge does NOT dispatch `shopify:navigate`. The string is absent from the App Bridge bundle:

```bash
grep -c 'shopify:navigate' docs/app-bridge-readable.js
# 0
```

The download of `https://cdn.shopify.com/shopifycloud/polaris.js` (saved as `docs/polaris.js`, beautified to `docs/polaris-readable.js`) contains exactly one occurrence, and the dispatch is a single document-level click handler at `docs/polaris-readable.js:21332-21354`:

```js
addEventListener("click", (e => {
    const t = e.target,
        i = 3 === t.nodeType ? t.parentNode : t,
        n = i?.closest("s-link[href], s-button[href], s-clickable[href], s-clickable-chip[href], a[href]");
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    if (!n || "a" === n.localName) return;
    if (new URL(n.getAttribute("href") || "", location.href).origin !== location.origin) return;
    const a = n.getAttribute("target");
    if (a && "_self" !== a && "auto" !== a) return;
    let r = !1;
    const s = n.getAttribute;
    n.getAttribute = function(e) {
        return "href" === e && (r = !0), s.call(this, e)
    };
    const o = new CustomEvent("shopify:navigate", {
            bubbles: !0,
            cancelable: !0,
            composed: !0
        }),
        l = n.dispatchEvent(o);
    n.getAttribute = s, r && e.preventDefault(), !1 === l && e.preventDefault()
}));
```

Important details that this code makes precise:

- The handler is registered globally (`addEventListener("click", ...)`), not on each web component instance. It runs once per polaris.js load and matches via `closest(...)`.
- The selector is `s-link[href], s-button[href], s-clickable[href], s-clickable-chip[href], a[href]` — but the very next line `if (!n || "a" === n.localName) return;` **explicitly excludes plain `<a>` elements**. Plain `<a href>` keeps native browser navigation (full document load).
- Cross-origin URLs are ignored.
- `target` other than `_self` / `auto` is ignored (so `target="_blank"` keeps native behavior).
- Modifier-key clicks (Ctrl/Shift/Alt/Meta) are ignored.
- The `getAttribute` swap is the trick that decides whether to `preventDefault`. It dispatches `shopify:navigate` with the matched element as target. If any listener queries `target.getAttribute("href")` while the event is dispatching, the trap flips `r = true`, and after dispatch polaris calls `e.preventDefault()`. If the event is cancelled (`!1 === l`) it also preventDefaults.
- AppProvider's listener (`src/components/AppProvider.tsx:18`) does exactly that: `(event.target as HTMLElement)?.getAttribute("href")`. So when AppProvider is mounted, polaris will `preventDefault` and AppProvider will SPA-navigate.

What this means for failure modes:

- If polaris.js has not loaded yet, no listener is attached → no `shopify:navigate` → for `<s-button>` / `<s-link>` / `<s-clickable>` the click default is a no-op (they are not anchors) → click does nothing, no document load.
- If polaris loaded but AppProvider's listener is not attached (component unmounted or never mounted), polaris dispatches `shopify:navigate`, but no listener queries `href`, so polaris does NOT `preventDefault` → for `<s-button>` etc., the click default is still a no-op → click does nothing, no document load.
- A plain `<a href="/app/foo">` click would always be a native document load. Search confirms this app does not use plain `<a>` for in-app links — only `<s-link>` / `<s-button>` / `<s-clickable>` (`src/routes/app.tsx:119-121`, `src/routes/app.index.tsx:50,87,108`, `src/routes/app.qrcodes.$handle.tsx:299`).

So the "click degraded into a `https:` document GET" framing is ruled out: polaris does not do that, and there are no `<a>` in-app links to fall back to.

Upstream test confirmation that AppProvider listens for this event:

- `refs/shopify-rr/packages/apps/shopify-app-remix/CHANGELOG.md:198`: "[AppProvider] - automatically handle the 'shopify:navigate' event for Remix apps using Polaris Web Components."
- `refs/shopify-rr/packages/apps/shopify-app-remix/src/react/components/AppProvider/__tests__/AppProvider.test.tsx:85` mounts a synthetic `new CustomEvent('shopify:navigate', { ... })` to drive the test.

### What App Bridge actually does to clicks (it does NOT route `https:` clicks)

`docs/app-bridge-readable.js:407` defines:

```js
const Ft=["shopify:","app:","extension:"]
const Ut=[...Ft,"https:","http:"]
const Nt=["a","s-link","s-button","s-clickable"]
```

The capture-phase click handler at `docs/app-bridge-readable.js:457-475`:

- walks up to find an `Nt` element with an `href`
- only calls `preventDefault()` for `Ft` protocols (`shopify:`, `app:`, `extension:`)
- for `https:` `_self` internal links, it does NOT preventDefault and does NOT dispatch any event

So `<s-button href="/app/qrcodes/new">` is not intercepted by App Bridge as a navigation. The Polaris web component itself is responsible for preventDefault + `shopify:navigate`.

This means: **if Polaris web components have not upgraded yet (script not loaded, or the element is not yet defined when the user clicks), clicks on `<s-button>`/`<s-link>` simply do nothing.** They do NOT fall back to a document request, because `s-button` is not an `<a>` and has no native navigation.

That kills the earlier "click degraded into a document GET" framing for in-app clicks.

### What App Bridge does to `fetch` (this IS where `Authorization` gets attached)

`docs/app-bridge-readable.js:341-379` (the `It` module) patches `globalThis.fetch`:

```js
Ct(globalThis,"fetch",async function(r,a){
  const s=new Request(r instanceof Request?r.clone():r,a),
        ...
        l = (same protocol && (same hostname || hostname endsWith "."+location.hostname)) || appOrigins.includes(origin),
        ...
  // line 364:
  const m = l && !s.headers.has("Authorization");
  m && s.headers.set("Authorization","Bearer "+await t.idToken()),
  l && !s.headers.has("X-Requested-With") && s.headers.set("X-Requested-With","XMLHttpRequest"),
  ...
  // also handles 401 + X-Shopify-Retry-Invalid-Session-Request retry (line 370-372)
})
```

Important properties:

- only `globalThis.fetch` is patched — anything that bypasses `fetch` (full document loads, iframe `src` changes, `window.location =`, browser reload, BFCache restore) is NOT touched
- Authorization is added only when the URL matches `location.protocol`+hostname (or `appOrigins`)
- on `401 + X-Shopify-Retry-Invalid-Session-Request: 1`, App Bridge fetches a fresh `idToken()` and retries once

This is exactly the contract `src/lib/ShopifyServerFnMiddleware.ts:13-21` describes ("App Bridge patches global browser `fetch` and auto-attaches `Authorization: Bearer <session_token>`").

So:

- TanStack server function call → goes through `fetch` → patched → `Authorization` header added → server sees `headerSessionToken` → `isDocumentRequest = false` (`src/lib/Shopify.ts:464`).
- Browser-level document load → not `fetch` at all → no `Authorization` → server sees `isDocumentRequest = true`.

`isDocumentRequest` is purely the absence of an `Authorization` header. It is not "what kind of route" or "what TanStack thinks". It is literally whether App Bridge's fetch patch ran on this request.

### Why the request had no `Authorization`: it was not a `fetch` at all

Given the above:

- The fetch patch is not "breaking down" mid-session. If it ran, `Authorization` would be present.
- The Polaris click → `shopify:navigate` → `useNavigate()` path is SPA-only and does not produce a document request.
- The only way to land on `/app/qrcodes/new` as a document request is for the browser (or Shopify Admin parent) to load that URL into the iframe directly — outside the patched `fetch` lifecycle.

Plausible triggers for that document load:

- iframe gets reloaded (BFCache eviction after long inactivity, browser tab discard/restore, Admin re-navigates the iframe's `src`)
- App Bridge tells Admin to navigate via `Navigation.history.replace` (`docs/app-bridge-readable.js:535-558`) and Admin later re-uses that stored path as the iframe URL on a refresh

In all of those, the URL the iframe reloads is whatever was in `location.href` at the time. That brings up the actual mechanism.

### The iframe URL loses `shop`/`host` on SPA navigation

`AppProvider` does `navigate({ to: href })` (`src/components/AppProvider.tsx:20`) where `href` is whatever the link element exposes. TanStack's `navigate({ to })` does not preserve search params unless you ask for them.

In this repo:

- The `s-app-nav` links DO preserve search: `src/routes/app.tsx:119-121` use `` href={`/app${searchStr}`} ``.
- The CTA buttons do NOT: `src/routes/app.index.tsx:50,108` use `<s-button href="/app/qrcodes/new" ...>`.

So clicking "Create QR code" SPA-navigates to `/app/qrcodes/new` with no query string. App Bridge's `pushState` patch (`docs/app-bridge-readable.js:527-528, 535-538`) reports `pathname + search + hash` to Admin — and `search` is now empty.

If anything later reloads the iframe (overnight inactivity → BFCache eviction → browser reloads at the last URL; Admin re-navigates iframe `src` after suspension), the iframe loads `/app/qrcodes/new` with no `shop`, no `host`, and no `id_token`. That document request hits `src/lib/Shopify.ts:464-490`:

```ts
const isDocumentRequest = !headerSessionToken;
if (isDocumentRequest) {
  if (!shop || !host) {
    return Response.redirect(new URL("/auth/login", request.url).toString());
  }
}
```

Which is exactly the symptom — and explains why the morning restart log shows a clean `/app` document request with `hasShop: true, hasHost: true, hasIdToken: true`: that was the recovery click on the breadcrumb (which DOES preserve `searchStr` via `src/routes/app.tsx:119`). The earlier failing iframe URL (`/app/qrcodes/new` without params) was already gone when the dev server restarted.

### Does `refs/shopify-app-template` solve this?

No.

- The template's `app.tsx` (`refs/shopify-app-template/app/routes/app.tsx:21-22`) uses the same bare `<s-link href="/app">` / `<s-link href="/app/additional">` pattern with no search preservation.
- Its `AppProvider` (`refs/shopify-app-js/.../AppProvider.tsx:117-130`) does the same `navigate(href)` thing — React Router's `navigate(string)` also resets search.
- So the template's iframe URL loses `shop`/`host` on internal SPA nav too. It is structurally vulnerable to the same "iframe reload at a stripped URL → `/auth/login`" path.
- The template's `/auth/login` route does NOT do anything fancy. It is the upstream `shopify.login` that returns the standard shop-domain form.

So porting from the template did not import a working solution to this — it imported the same vulnerability.

### Diagnostics check (what the existing logs would prove on a recurrence)

The instrumentation in `src/lib/Shopify.ts:465-599` already captures everything needed to confirm the trigger on the next failure:

If the bug recurs and the dev server is NOT restarted, the failing log line would show:

- `pathname: /app/qrcodes/new`
- `requestUrl: <appUrl>/app/qrcodes/new` (no `?shop=...&host=...`)
- `hasAuthorizationHeader: false`
- `hasShop: false`
- `hasHost: false`
- `hasIdToken: false`
- `isDocumentRequest: true`
- `event: redirect-login-missing-shop-host`

That is enough to confirm "iframe document-loaded a stripped URL". No client-side telemetry needed for the first-order question.

What the current logs would NOT tell us:

- Whether the iframe reload was browser-initiated (BFCache, tab discard) vs Admin-initiated (`<iframe src=>` change). Both produce identical server-side fingerprints.
- The previous SPA URL state. If we wanted to prove the URL was already stripped before the reload, we would need a client-side `pageshow` / `unload` log (or just rely on the URL-strip mechanism above).

## How To Move Forward

No code changes yet. The plan is sequenced so we don't fix the wrong thing.

### Step 1 — Do not fix yet. Confirm the hypothesis on the next recurrence.

The "iframe-URL-drift + reload" theory is grounded but unproven from logs (the only restart-era log we have is a clean recovery). Server-side diagnostics in `src/lib/Shopify.ts:465-599` are already sufficient to confirm the trigger.

Operational rule: **do not restart the dev server before reading `logs/server.log` when the bug recurs.**

Confirming signature in the log:

- `pathname: /app/qrcodes/new` (or whatever route)
- `requestUrl` has no `?shop=...&host=...&embedded=1`
- `hasAuthorizationHeader: false`, `hasShop: false`, `hasHost: false`, `hasIdToken: false`
- `isDocumentRequest: true`
- `event: redirect-login-missing-shop-host`

Disconfirming signatures (theory is wrong, look elsewhere):

- `hasAuthorizationHeader: true` with a 401 outcome → server-fn token problem, not iframe drift.
- `event: redirect-session-token-bounce` → the bounce path is firing, not the missing-shop-host path.
- `hasShop: true, hasHost: true` but still ending up at `/auth/login` → some other failure mode.

### Step 2 — Drop the `renderExitIframePage` proposal.

Already shown above to be a dead end. Not worth more analysis.

### Step 3 — If confirmed: Option A (preserve search in `AppProvider`).

The cleanest fix is at the source — stop letting the iframe URL drift to a state that cannot be reloaded.

Option A (minimal, structural): preserve search in `AppProvider`'s `shopify:navigate` handler at `src/components/AppProvider.tsx:20`:

```ts
void navigate({ to: href, search: (prev) => prev });
```

This makes every Polaris-driven SPA navigation carry whatever Shopify auth params are currently in the URL. After an iframe reload the URL still contains `shop`/`host`/`embedded` and `authenticateAdmin` succeeds.

Refinement: drop `id_token` from the forwarded search before pushing to history (it is short-lived and does not need to live in pushState). Keeping `id_token` is also acceptable because a stale `id_token` falls into the existing `redirect-session-token-bounce` path (`src/lib/Shopify.ts:499-515`), which is recoverable — but cleaner to drop it.

Verify against TanStack Router's `search` callback shape before committing. If the typed shape diverges from what we want, fall back to Option B.

Option B (fallback if Option A is awkward): include `${searchStr}` on every internal `<s-button>`/`<s-link>`/`<s-clickable>` href the way `src/routes/app.tsx:119-121` already does. Per-link churn but does not depend on `useNavigate` defaults.

### Step 4 — Independently of Step 3: Option C ("session expired" message at `/auth/login`).

Even with the drift fix landed, the upstream domain-form fallback is hostile UX for any future failure mode that lands on `/auth/login` without `shop`. Replace `auth.login.ts`'s GET-without-`shop` branch with a plain "Your session has expired. Return to Shopify Admin to reopen the app." message. No automatic recovery, no embedding tricks, no loop risk. Independent of whether the drift theory is right.

### Step 5 — Only if Option A doesn't fix it: client-side telemetry.

If after Option A the bug still recurs, add a small client-side log on `pageshow` (with `event.persisted` to detect BFCache restore) and `unload`, plus the iframe URL at each. That distinguishes "browser restored stale state" from "Admin re-navigated `iframe.src`". Not worth doing pre-emptively — the server logs will tell us first whether the URL was stripped.

### Sequencing summary

1. Wait for next recurrence; capture log without restarting dev server.
2. Match log signature against Step 1.
3. If matched → Option A (one-line) + Option C (replace domain form). Done.
4. If not matched → re-investigate from the actual log evidence; do not pre-commit to either fix.
5. Skip the `renderExitIframePage` proposal entirely.

## Bottom Line

The domain prompt is Shopify's standard `/auth/login` fallback form. That part is expected.

What is not expected is getting sent there from an already-embedded merchant click. Updated read:

- The trigger is not "the click degraded mid-flight". `<s-button>` / `<s-link>` / `<s-clickable>` clicks cannot degrade into a `https:` document GET — Polaris's click handler skips plain `<a>` and otherwise dispatches `shopify:navigate` (`docs/polaris-readable.js:21332-21354`); App Bridge does not preventDefault `https:` clicks; web components have no native navigation default.
- `isDocumentRequest` is purely "no `Authorization` header" (`src/lib/Shopify.ts:464`). The header is added only when the request goes through patched `fetch` (`docs/app-bridge-readable.js:341-379`). Document-level loads (iframe reload, BFCache restore, Admin re-navigation of `iframe.src`) bypass `fetch` entirely and therefore always look like document requests.
- The fetch patch is not "breaking down". When it runs, it attaches the header.
- The most plausible cause of a document GET to `/app/qrcodes/new` with no `shop`/`host` is that the iframe's URL had already drifted to a search-stripped state during normal SPA navigation, then the iframe got reloaded after inactivity and re-fetched that stripped URL.
- `refs/shopify-app-template` is structurally vulnerable to the same drift (bare hrefs + `navigate(href)`).
- The previously drafted `renderExitIframePage` fix is rejected: with no `shop`, `_top`-navigating to the Worker URL un-embeds the app and loops.
- The promising minimal fix is Option A — preserve search inside `AppProvider`'s `shopify:navigate` handler — held in reserve until the diagnostic signature in Step 1 confirms iframe-URL drift on the next recurrence.
- The existing server-side diagnostics in `src/lib/Shopify.ts:465-599` and the call-site logs in `src/routes/app.tsx:47-84` and `src/lib/ShopifyServerFnMiddleware.ts:52-84` are sufficient to confirm the trigger on the next reproduction, provided the dev server is not restarted before the log is read.
