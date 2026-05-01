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

I do not think we need more server-side diagnostics before the next reproduction.

If these logs still leave ambiguity after a real failure trace, the next increment would be client-side click/navigation telemetry. But that is not necessary yet.

## Bottom Line

The domain prompt is Shopify's standard `/auth/login` fallback form. That part is expected.

What is not expected is getting sent there from an already-embedded merchant click.

The important facts now are:

- `idToken()` is probably unrelated.
- Not seeing `shop` in the address bar during normal navigation is normal.
- Shopify's own reference apps also use bare internal links.
- The failure we need to observe is a specific request-shape failure: normal client-side app navigation versus full document request/auth fallback.
