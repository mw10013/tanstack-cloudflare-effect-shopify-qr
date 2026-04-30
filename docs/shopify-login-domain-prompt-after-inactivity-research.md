# Shopify Login "Domain Prompt" After Inactivity

## What You're Seeing

The page at `/auth/login` — an HTML form asking for "Shop domain" (`auth.login.ts:18-43`). It appears after a period of inactivity, then disappears after a full page refresh.

## App Bridge's Design: Ephemeral URL Params

App Bridge explicitly strips Shopify-specific params from URLs after the initial load (`docs/app-bridge.js`, line 152):

```js
const M = ["hmac","locale","protocol","session","id_token","shop","timestamp","host","embedded","appLoadId","link_source"];
function x(t) { const n=new URL(t); return M.forEach(t=>n.searchParams.delete(t)), n }
```

These params exist only on the initial document load. After that, App Bridge owns auth through other means — they're intentionally gone. **You never see `?shop&host` in the URL during navigation because App Bridge removes them by design.**

## Why Navigation Works Without shop/host

App Bridge patches `window.fetch` (line 348) and adds `Authorization: Bearer <token>` to all requests to the app's own domain:

```js
// l = true when request URL is app's own hostname
const l = u.protocol===location.protocol && (u.hostname===location.hostname || ...) || c.includes(u.origin);
const m = l && !s.headers.has("Authorization");
m && s.headers.set("Authorization", "Bearer " + await t.idToken());
```

TanStack server fn calls (`authenticateAppRoute`) go to the app's own domain → `l=true` → Authorization header added → server sets `isDocumentRequest=false` (Shopify.ts:464) → the `!shop || !host` check (Shopify.ts:467) is **never reached**.

App Bridge also handles 401 retry automatically (lines 370-372):

```js
if (b.headers.get("X-Shopify-Retry-Invalid-Session-Request") && m)
  w.headers.set("Authorization", "Bearer " + await t.idToken()); // fresh token
  b = await i(w); // retry
```

## How `idToken()` Works

`idToken()` communicates with the Shopify Admin parent frame (lines 382-388):

```js
t.idToken = async function() {
  const {idToken:t} = await e || {};
  return t ? await t() : new Promise(t => {
    n.subscribe("SessionToken.respond", ({sessionToken:n}) => {t(n)}, {once:true}),
    n.send("SessionToken.request")  // asks parent frame
  })
}
```

If the internal API isn't available, it sends `SessionToken.request` to the Shopify Admin parent frame and **waits indefinitely** for `SessionToken.respond`. There is no timeout.

## Why It Breaks After Inactivity

When the Shopify Admin parent frame session expires:

1. User navigates → TanStack calls `authenticateAppRoute` via fetch
2. App Bridge intercepts fetch → calls `await t.idToken()`
3. `idToken()` sends `SessionToken.request` to parent frame
4. Parent frame session has expired → **no response**
5. `idToken()` hangs forever — no timeout
6. The fetch never completes → `beforeLoad` is stuck → app is frozen
7. User hard-refreshes the page
8. That refresh is a **document request** (no Authorization header) to the current URL — which has no `?shop&host` because App Bridge stripped them
9. Server: `isDocumentRequest=true`, `!shop || !host` → `Response.redirect('/auth/login')` → login form

## Why Refresh Fixes It

The hard refresh reloads the full browser page including the Shopify Admin parent frame. The admin re-establishes its session, then re-embeds the app iframe with a freshly-constructed URL:

```
?shop=xxx.myshopify.com&host=xxx&embedded=1&id_token=xxx
```

That document request has all the params → server takes the full auth path → success.

## Auto-Redirect Does NOT Fire Here

App Bridge's auto-redirect only fires when the app is the top-level window (line 1863-1864):

```js
if (top===window && !E() && !b.config.disabledFeatures?.includes("auto-redirect") || T)
  return location.assign(a);
```

While embedded in Shopify Admin, `top !== window` — auto-redirect never triggers.

## Flow Summary

| Scenario | Authorization header | shop+host in URL | Result |
|---|---|---|---|
| Initial document load (Shopify Admin injects params) | No | Yes | Full auth path succeeds |
| Client-side nav (App Bridge patches fetch) | Yes (auto-injected) | No | XHR path, shop/host irrelevant |
| 401 / expired token during fetch | Yes → retry with fresh token | No | App Bridge retries transparently |
| Parent frame session expired → `idToken()` hangs → user hard-refreshes | No | No (stripped by App Bridge) | Login form |

## Effective Fixes

The root problem is that when the parent frame is unresponsive, `idToken()` hangs with no timeout, freezing the app until the user hard-refreshes to a URL with no shop/host.

**Option A — Client-side timeout + redirect (most correct)**
Wrap `shopify.idToken()` calls with a timeout on the client. If it doesn't resolve in N seconds, explicitly call `location.assign(shopify.config.host ? atob(shopify.config.host) : ...)` to navigate to the Shopify Admin — the same URL auto-redirect would use, but triggered by the app. This avoids the stuck state entirely.

**Option B — Preserve `shop` as a TanStack route search param**
Define `shop` in the `/app` route's `validateSearch`. TanStack Router preserves it across client-side navigations. On hard refresh, the URL still has `?shop=xxx` → server redirects to `/auth/login?shop=xxx` → `shopify.login()` auto-redirects to OAuth → Shopify Admin re-embeds with full params → no manual domain entry.

**Option C — Accept it**
The reference template has identical behavior. In production usage, Shopify Admin session expiry after long inactivity is rare. The login form is the designed fallback; the user enters or re-navigates and recovers.

## Relevant Code

- `docs/app-bridge.js:152` — `M` array: params App Bridge strips from URLs
- `docs/app-bridge.js:348-379` — fetch interceptor: Authorization injection and 401 retry
- `docs/app-bridge.js:382-388` — `idToken()`: hangs if parent frame unresponsive
- `docs/app-bridge.js:1863-1864` — auto-redirect: only when not in iframe
- `Shopify.ts:464` — `isDocumentRequest = !headerSessionToken`
- `Shopify.ts:466-470` — `!shop || !host` check, document requests only
- `app.tsx:60-93` — `authenticateAppRoute` server fn, called via App Bridge-patched fetch
