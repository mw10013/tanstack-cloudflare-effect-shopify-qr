# Public QR Scan Auth Research

## Scope

Question: why does `src/routes/qrcodes.$id.scan.tsx` build Effect layers manually instead of using `shopifyServerFnMiddleware`?

This note focuses on:

- TanStack loader vs server function execution
- embedded `/app` admin auth vs public QR scan auth
- Shopify session token vs offline session
- why `scanQrCode` is a server function but still should not use the existing middleware as-is
- cleaner implementation options

Primary files:

- `src/routes/qrcodes.$id.scan.tsx`
- `src/lib/ShopifyServerFnMiddleware.ts`
- `src/routes/app.tsx`
- `src/lib/Shopify.ts`
- `src/lib/QrService.ts`

## Short Answer

`scanQrCode` is a server function, yes.

The reason it does not use `shopifyServerFnMiddleware` is not because it is a route loader. It is because `shopifyServerFnMiddleware` authenticates an embedded Shopify admin request by requiring a valid admin/browser session token flow.

The scan URL is designed for customers scanning a QR code:

```txt
/qrcodes/$id/scan?shop=$shop
```

That request is not an embedded Shopify admin request. It does not come from the Shopify admin iframe. It does not have an App Bridge session token. It should not redirect the customer through Shopify OAuth/admin auth.

So the QR scan route needs a different auth model:

1. Trust the public QR handle as the lookup key.
2. Read `shop` from the URL.
3. Load the app's stored offline Shopify session for that shop.
4. Use that offline session to call Admin GraphQL server-side.
5. Increment scan count and redirect the browser to the public product/cart URL.

That is why the current implementation builds a `CurrentSession -> ShopifyAdmin -> QrRepository -> QrService` layer manually from `shopify.unauthenticatedAdmin(shop)`.

## What Public Means Here

Public means the request is not an authenticated embedded admin route under `/app`.

This project's authenticated embedded app subtree is `/app`. `src/routes/app.tsx` protects that subtree with `beforeLoad`:

```ts
export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    return authenticateAppRoute({
      data: {
        searchStr: location.searchStr,
        pathname: location.pathname,
      },
    });
  },
  component: AppLayout,
});
```

That route uses `Shopify.authenticateAdmin` semantics. It is for merchants/admin users opening the embedded app.

The QR scan route is not under `/app`:

```ts
export const Route = createFileRoute("/qrcodes/$id/scan")({
```

The tutorial's QR image points scanners to this public path. In `QrService.getScanUrl`:

```ts
const url = new URL(`/qrcodes/${handle}/scan`, appUrl);
url.searchParams.set("shop", shop);
```

The expected user is a customer with a phone camera, not a merchant in Shopify admin. That is the practical meaning of public.

## Loader vs Server Function

You are right: `scanQrCode` is a server function called from a loader.

Current route:

```ts
const scanQrCode = createServerFn({ method: "GET" })
  .inputValidator(Schema.toStandardSchemaV1(ScanInput))
  .handler(({ data, context: { runEffect } }) =>
    runEffect(...),
  );

export const Route = createFileRoute("/qrcodes/$id/scan")({
  loader: ({ params, location }) =>
    scanQrCode({
      data: {
        id: params.id,
        shop: new URLSearchParams(location.searchStr).get("shop") ?? "",
      },
    }),
  component: () => null,
});
```

Important distinction:

- Loader is the route data hook. It can run during SSR and can refetch during client navigation.
- `createServerFn` always executes its handler on the server. If invoked from the client, the client makes an RPC request to the server function endpoint.

So yes, the loader is isomorphic. But the dangerous/admin work is still inside `scanQrCode.handler`, which runs server-side.

The complexity is the request context differs depending how the loader is reached:

- Direct browser request to `/qrcodes/foo/scan?shop=x.myshopify.com`: SSR loader invokes server function during document request.
- Client-side navigation inside the app to `/qrcodes/foo/scan?shop=x.myshopify.com`: client invokes server function RPC.
- Direct fetch/crawler: SSR server request.

All of these should avoid embedded admin auth. They should all use offline shop access.

## Existing Middleware Contract

`shopifyServerFnMiddleware` is intentionally admin/embedded-app middleware.

It starts with:

```ts
const session = yield* shopify.authenticateAdmin(request);
```

Then it handles redirects and invalid session responses:

```ts
if (session instanceof Response) {
  const location = session.headers.get("Location") ?? session.headers.get("location");
  if (location) return yield* Effect.fail(redirect({ href: location }));
  return yield* Effect.fail(session);
}
```

Then it builds a service graph from the authenticated admin session:

```ts
const currentSessionLayer = Layer.succeed(CurrentSession, session);
const shopifyAdminLayer = Layer.provide(ShopifyAdmin.layer, currentSessionLayer);
const productRepositoryLayer = Layer.provide(ProductRepository.layer, shopifyAdminLayer);
const qrRepositoryLayer = Layer.provide(QrRepository.layer, shopifyAdminLayer);
const qrServiceLayer = Layer.provide(QrService.layer, qrRepositoryLayer);
```

That is perfect for `/app` server functions because App Bridge patches browser fetches with a session token, and document routes under `/app` go through the Shopify admin auth redirect/token exchange flow.

It is wrong for a customer QR scan because a customer scan request has none of that admin context.

If `scanQrCode` used this middleware as-is, likely outcomes are:

- Direct customer scan redirects to Shopify admin OAuth/install/login instead of product/cart.
- Server function RPC might return Shopify's invalid session response because no `Authorization: Bearer <session_token>` exists.
- Customer-facing redirects could be polluted with embedded-app auth behavior.

## Shopify Session Types In This App

There are two relevant session sources.

### Embedded Admin Session Token

Used by `/app` routes and app server functions.

Source:

- App Bridge in browser
- Shopify admin iframe
- `Authorization: Bearer <session_token>` on fetch/RPC requests
- OAuth/token exchange when needed

Project boundary:

```ts
shopify.authenticateAdmin(request)
```

Best for:

- merchant app pages
- create/edit/list QR codes in admin
- product generation demo
- anything requiring current merchant/admin request authorization

### Offline Shop Session

Used for background/public server-side work after the app has been installed.

Source:

- persisted offline Shopify session in D1
- loaded by shop domain
- no current browser admin session required

Project boundary:

```ts
shopify.unauthenticatedAdmin(shop)
```

Relevant implementation in `src/lib/Shopify.ts`:

```ts
const unauthenticatedAdmin = Effect.fn("Shopify.unauthenticatedAdmin")(
  function* (shop: Domain.Shop) {
    const session = yield* Effect.fromOption(
      yield* ensureValidOfflineSession(shop),
    ).pipe(
```

Best for:

- public QR scan route
- webhooks
- cron/background jobs
- queues/workflows
- server-side work scoped to a shop but not triggered by an embedded admin browser session

The QR scan route belongs in this second category.

## Why The Manual Layers Exist

`QrService.recordScanAndGetDestination` needs `QrRepository`:

```ts
const qrCode = yield* repository.findByHandle(handle);
if (Option.isNone(qrCode)) return Option.none();
yield* repository.incrementScans(qrCode.value.id, qrCode.value.scans);
return yield* getDestinationUrl(qrCode.value, shop).pipe(Effect.map(Option.some));
```

`QrRepository` needs `ShopifyAdmin`, and `ShopifyAdmin` needs `CurrentSession`.

For `/app` server functions, `shopifyServerFnMiddleware` provides that graph from `authenticateAdmin(request)`.

For scan, the route has to provide the graph from `unauthenticatedAdmin(shop)`:

```ts
const session = yield* shopify.unauthenticatedAdmin(shop);
const currentSessionLayer = Layer.succeed(CurrentSession, session);
const shopifyAdminLayer = Layer.provide(ShopifyAdmin.layer, currentSessionLayer);
const qrRepositoryLayer = Layer.provide(QrRepository.layer, shopifyAdminLayer);
const qrServiceLayer = Layer.provide(QrService.layer, qrRepositoryLayer);
```

So the manual layer code is not about route vs server function. It is about session source.

## Isomorphic Loader Concern

The loader being isomorphic matters for two reasons.

First, direct document requests to `/qrcodes/$id/scan` should redirect during SSR without hydrating a page. That is good.

Second, client-side navigation could call the server function via RPC. That still executes on the server, but the response must preserve redirect behavior correctly.

The current server function fails with TanStack `redirect({ href })` inside `runEffect`:

```ts
return yield* Effect.fail(redirect({ href: destination.value }));
```

`src/worker.ts` intentionally preserves redirect/notFound control flow:

```ts
if (squashed instanceof Response || isRedirect(squashed) || isNotFound(squashed)) throw squashed;
```

So the pattern is aligned with the app's existing control-flow strategy.

Residual concern: if a QR scan happens from client-side navigation instead of direct document load, verify TanStack handles server-function-thrown redirects exactly as desired. For real QR scans, direct document load is the primary path.

## Should Existing Middleware Be Reused?

Not directly.

`shopifyServerFnMiddleware` has this implicit contract:

- caller is an embedded/admin app request
- request may include App Bridge session token
- Shopify auth redirects/401 retry are acceptable
- resulting `CurrentSession` comes from `authenticateAdmin`

`scanQrCode` needs this contract:

- caller is any browser/customer request
- no App Bridge session token expected
- no Shopify admin auth redirect should happen
- resulting `CurrentSession` comes from stored offline session for `shop`

Those contracts are different enough that reusing the existing middleware would be misleading.

## Better Abstractions

The current route-local layer build works but is not ideal. Better options:

### Option A: Helper Function

Create a helper like:

```ts
const provideQrForOfflineShop = (shop: Domain.Shop) => <A, E>(effect: Effect.Effect<A, E, QrService>) =>
  Effect.gen(function* () {
    const shopify = yield* Shopify;
    const session = yield* shopify.unauthenticatedAdmin(shop);
    const currentSessionLayer = Layer.succeed(CurrentSession, session);
    const shopifyAdminLayer = Layer.provide(ShopifyAdmin.layer, currentSessionLayer);
    const qrRepositoryLayer = Layer.provide(QrRepository.layer, shopifyAdminLayer);
    const qrServiceLayer = Layer.provide(QrService.layer, qrRepositoryLayer);
    return yield* effect.pipe(Effect.provide(qrServiceLayer));
  });
```

Then scan route becomes easier to read.

### Option B: Public Offline Shopify Middleware

Create a second middleware, for example `offlineShopifyServerFnMiddleware`, that:

- validates/reads `shop` from server function input
- loads `shopify.unauthenticatedAdmin(shop)`
- provides `CurrentSession`, `ShopifyAdmin`, `QrRepository`, `QrService`
- does not call `authenticateAdmin(request)`

This keeps server functions symmetric:

- `/app` server functions use `shopifyServerFnMiddleware`
- public/background shop-scoped functions use `offlineShopifyServerFnMiddleware`

Challenge: TanStack middleware needs a convention for where `shop` lives in `data`. That is solvable but should be designed deliberately.

### Option C: Repository/Service Method That Accepts Session

Change `QrService` or `QrRepository` to accept an explicit session/admin client instead of requiring `CurrentSession` in context.

This is less idiomatic for this repo because existing services use Effect context/layers.

## Recommended Next Refactor

Create a small helper first, not full middleware.

Reason:

- only one public QR scan route currently needs it
- helper removes noisy manual layer code from the route
- avoids designing generic server function middleware before there are more use cases

Suggested file:

```txt
src/lib/OfflineShopifyAdmin.ts
```

Suggested API:

```ts
export const provideQrForOfflineShop = (shop: Domain.Shop) => <A, E>(
  effect: Effect.Effect<A, E, QrService>,
) => Effect.Effect<A, E | ShopifyError, Shopify>;
```

Then `qrcodes.$id.scan.tsx` can express intent directly:

```ts
const destination = yield* Effect.gen(function* () {
  const service = yield* QrService;
  return yield* service.recordScanAndGetDestination(handle, shop);
}).pipe(provideQrForOfflineShop(shop));
```

## Current Mental Model

Use this split:

- `/app/*`: merchant/admin embedded app. Use `authenticateAdmin` and `shopifyServerFnMiddleware`.
- `/qrcodes/*/scan`: customer/public redirect endpoint. Use offline shop session, not admin browser auth.
- `/webhooks/*`: Shopify-origin server requests. Use webhook auth, not admin browser auth.
- background jobs/queues: use offline shop session, not admin browser auth.

The confusing part is that all of these can use server functions or server-side Effect code. The deciding factor is not server function vs route. The deciding factor is where the Shopify session comes from.
