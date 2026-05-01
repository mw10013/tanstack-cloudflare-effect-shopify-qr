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

### Proposal: Replace The Domain Form With An exitIframe Hard Reset (Uncertain)

**Status: Proposed. Not implemented. Uncertain whether this is correct.**

The existing `renderExitIframePage` helper (`src/lib/Shopify.ts:110-119`) does:

```html
<script data-api-key="..." src="${APP_BRIDGE_URL}"></script>
<script>window.open(destination, "_top")</script>
```

This loads App Bridge fresh in the iframe and uses `window.open(url, "_top")` to navigate the **top Shopify Admin window** (not the iframe). Shopify Admin would then re-open the app with fresh `shop`/`host`/`id_token` params — effectively a hard reset.

The proposal is: at `auth.login.ts:58-61`, the `GET` path with no `shop` currently renders the domain form. Instead it could return:

```ts
renderExitIframePage(Redacted.value(shopify.config.apiKey), null, shopify.config.appUrl)
```

The POST path (merchant explicitly submits a shop domain) would stay as-is — that path is for OAuth from outside the embedded flow.

**Edge cases that make this uncertain:**

- If the page is visited directly in a browser (not inside Shopify Admin), App Bridge has no parent frame to communicate with. `window.open(appUrl, "_top")` would just navigate the tab to the app root, which is probably still better than the domain form.
- It's not certain that App Bridge will successfully initialize and reach Shopify Admin from within a stale or partially-failed iframe state. The mixed UI observed (login form + stale chrome) suggests the Admin shell may be in an inconsistent state when this page is reached.
- The `renderExitIframePage` call is currently only used by `src/lib/Shopify.ts:452-457` when both `shop` and `host` are known. Calling it with `shop: null` is untested.

### Confirmed Alternative: "Your session expired" Message

A safe minimum: replace the domain form with a plain message like "Your session has expired. Return to Shopify to reopen the app." with a link to the app URL. This at least gives a clear action instead of a confusing domain input. It does not attempt any automatic recovery.

## Bottom Line

The domain prompt is Shopify's standard `/auth/login` fallback form. That part is expected.

What is not expected is getting sent there from an already-embedded merchant click.

The important facts now are:

- `idToken()` is probably unrelated.
- Not seeing `shop` in the address bar during normal navigation is normal.
- Shopify's own reference apps also use bare internal links.
- The failure we need to observe is a specific request-shape failure: normal client-side app navigation versus full document request/auth fallback.
- The morning restart log did not capture that failure path; it only captured a clean recovery into `/app`.
- The mixed login-form-plus-stale-chrome state is now evidence that the embedded shell can look partially stale after the fallback, which means the visible UI alone may not tell us which route document is actually loaded.
