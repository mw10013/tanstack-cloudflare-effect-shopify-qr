# Shopify session domain boundary research

Question: should app code use `ShopifyApi.Session` directly, or should we wrap/convert it because fields like `shop` are plain Shopify strings instead of app domain types?

## Current Shape

`Domain.Session` is the persisted app/domain model. It brands `id` and `shop`:

```ts
export const Shop = Schema.NonEmptyString.pipe(
  Schema.brand("Shop"),
);
export type Shop = typeof Shop.Type;

export const Session = Schema.Struct({
  id: SessionId,
  shop: Shop,
```

Ref: `src/lib/Domain.ts:3`, `src/lib/Domain.ts:78`

`Shopify.storeSession` is the main conversion point from Shopify runtime object to app row:

```ts
const storeSession = Effect.fn("Shopify.storeSession")(function* (
  session: ShopifyApi.Session,
) {
  const associatedUser = session.onlineAccessInfo?.associated_user;
  yield* Schema.decodeUnknownEffect(Domain.Session)({
    id: session.id,
    shop: session.shop,
```

Ref: `src/lib/Shopify.ts:126`

`Shopify.loadSession` converts back from persisted `Domain.Session` row to `ShopifyApi.Session` for Shopify API calls:

```ts
return yield* tryShopify(() =>
  ShopifyApi.Session.fromPropertyArray(
    Object.entries(storedSession.value).filter(
      (entry): entry is [string, string | number] => entry[1] !== null,
    ),
    true,
  ),
)
```

Ref: `src/lib/Shopify.ts:208`

Authenticated server functions inject `CurrentShopifySession` as `ShopifyApi.Session`:

```ts
export class CurrentShopifySession extends Context.Service<CurrentShopifySession, ShopifyApi.Session>()(
  "CurrentShopifySession",
) {}
```

Ref: `src/lib/CurrentShopifySession.ts:4`

`ShopifyAdmin` only needs the session to call Shopify GraphQL:

```ts
const session = yield* CurrentShopifySession;
const graphql = Effect.fn("ShopifyAdmin.graphql")(
  (query: string, options?: { readonly variables?: Record<string, unknown> }) =>
    shopify.graphql(session, query, options),
);
```

Ref: `src/lib/ShopifyAdmin.ts:8`

## CurrentShopifySession Usage

`CurrentShopifySession` is created only in server-function auth middleware, after `Shopify.authenticateAdmin(request)` succeeds:

```ts
const session = yield* shopify.authenticateAdmin(request);

if (session instanceof Response) {
  const location = session.headers.get("Location") ?? session.headers.get("location");
  if (location) return yield* Effect.fail(redirect({ href: location }));
  return yield* Effect.fail(session);
}

const currentShopifySessionLayer = Layer.succeed(CurrentShopifySession, session);
```

Ref: `src/lib/ShopifyServerFnMiddleware.ts:52`

That layer is included in the per-authenticated-server-function layer graph:

```ts
const serverFnLayer = Layer.mergeAll(
  currentSessionLayer,
  shopifyAdminLayer,
  productRepositoryLayer,
  qrRepositoryLayer,
  qrServiceLayer,
);
```

Ref: `src/lib/ShopifyServerFnMiddleware.ts:65`

Direct `CurrentShopifySession` consumers are not limited to `ShopifyAdmin`.

Consumer 1: `ShopifyAdmin` uses it as the upstream session needed for authenticated GraphQL:

```ts
const session = yield* CurrentShopifySession;
const graphql = Effect.fn("ShopifyAdmin.graphql")(
  (query: string, options?: { readonly variables?: Record<string, unknown> }) =>
    shopify.graphql(session, query, options),
);
```

Ref: `src/lib/ShopifyAdmin.ts:8`

Consumer 2: `loadQrCode` in the QR form route uses it as an app/domain data source. It pulls `session.shop`, decodes it to `Domain.Shop`, then uses that branded shop for QR image/scan/destination URLs and returns it to the component:

```ts
const session = yield* CurrentShopifySession;
const repository = yield* QrRepository;
const service = yield* QrService;
const shop = yield* Schema.decodeUnknownEffect(Domain.Shop)(
  session.shop,
);
```

Ref: `src/routes/app.qrcodes.$id.tsx:53`

That `shop` then flows into QR service methods that require `Domain.Shop`:

```ts
const image = yield* service
  .getQrCodeImage(qrCode.handle, shop)
const scanUrl = yield* service.getScanUrl(qrCode.handle, shop);
const destinationUrl = yield* service
  .getDestinationUrl(qrCode, shop)
```

Ref: `src/routes/app.qrcodes.$id.tsx:83`

The QR service API is domain-shaped:

```ts
const getScanUrl = Effect.fn("QrService.getScanUrl")((handle: Domain.QrCodeHandle, shop: Domain.Shop) => {
```

Ref: `src/lib/QrService.ts:45`

Consumer 3: the public QR scan route does not use `shopifyServerFnMiddleware`, but it manually creates a `CurrentShopifySession` layer from `shopify.unauthenticatedAdmin(shop)` so `QrRepository` can use `ShopifyAdmin` to increment scans:

```ts
const shop = yield* Schema.decodeUnknownEffect(Domain.Shop)(data.shop);
const shopify = yield* Shopify;
const session = yield* shopify.unauthenticatedAdmin(shop);
const currentShopifySessionLayer = Layer.succeed(CurrentShopifySession, session);
const shopifyAdminLayer = Layer.provide(ShopifyAdmin.layer, currentSessionLayer);
```

Ref: `src/routes/qrcodes.$id.scan.tsx:34`

This path already has `Domain.Shop` before it creates `CurrentShopifySession`; the awkwardness is only that `CurrentShopifySession` itself cannot carry that fact.

There is also an adjacent non-`CurrentShopifySession` leakage in the `/app` layout boundary. `authenticateAppRoute` calls `authenticateAdmin` and returns the raw session shop into route context:

```ts
return {
  apiKey: Redacted.value(shopify.config.apiKey),
  shop: session.shop,
} as const;
```

Ref: `src/routes/app.tsx:87`

So the real usage picture is:

- `ShopifyAdmin` needs the upstream `ShopifyApi.Session` for GraphQL.
- `loadQrCode` needs authenticated `Domain.Shop` for app URLs.
- Public scan already starts from `Domain.Shop`, then creates a raw `CurrentShopifySession` only to satisfy `ShopifyAdmin`/`QrRepository`.
- `/app` route context currently exposes `shop` as `string`, not `Domain.Shop`.

## Do We Have Domain.Session There?

At the exact point `CurrentShopifySession` is created, no `Domain.Session` value is available in scope. The middleware has only the return value from `authenticateAdmin`, which is `ShopifyApi.Session | Response`:

```ts
const session = yield* shopify.authenticateAdmin(request);
```

Ref: `src/lib/ShopifyServerFnMiddleware.ts:52`

Inside `authenticateAdmin`, there are two successful paths:

1. Existing stored session path:

```ts
const existingSession = yield* loadSession(sessionId);

if (
  Option.isSome(existingSession) &&
  existingSession.value.isActive(undefined, WITHIN_MILLISECONDS_OF_EXPIRY)
) {
  return existingSession.value;
}
```

Ref: `src/lib/Shopify.ts:520`

`loadSession` does fetch a `Domain.Session` row first:

```ts
const storedSession = yield* repository.findSessionById(id);
if (Option.isNone(storedSession)) return Option.none();
return yield* tryShopify(() =>
  ShopifyApi.Session.fromPropertyArray(
    Object.entries(storedSession.value).filter(
```

Ref: `src/lib/Shopify.ts:208`

But that domain row is local to `loadSession`; it is immediately converted to `ShopifyApi.Session` and not returned.

2. Token exchange path:

```ts
yield* storeSession(exchanged.session);
return exchanged.session;
```

Ref: `src/lib/Shopify.ts:557`

`storeSession` decodes a `Domain.Session` before persistence:

```ts
yield* Schema.decodeUnknownEffect(Domain.Session)({
  id: session.id,
  shop: session.shop,
```

Ref: `src/lib/Shopify.ts:130`

But that decoded `Domain.Session` is passed to `repository.upsertSession` inside the effect chain and not returned.

So the precise answer: yes, a `Domain.Session` often exists transiently inside `Shopify.loadSession` or `Shopify.storeSession`; no, it is not available where `CurrentShopifySession` is created. Carrying it there would require changing the auth return shape or re-decoding `session.shop` at the middleware boundary.

## Can AuthenticateAdmin Return Both?

Yes. `authenticateAdmin` can be refactored to return both the upstream Shopify session and domain session data.

There are two practical shapes:

```ts
interface AuthenticatedAdminSession {
  readonly session: ShopifyApi.Session;
  readonly domainSession: Domain.Session;
}
```

or, smaller:

```ts
interface AuthenticatedAdminSession {
  readonly session: ShopifyApi.Session;
  readonly shop: Domain.Shop;
}
```

The full `domainSession` shape is feasible because both success paths can produce it:

- Existing session path: `loadSession` currently reads a `Domain.Session` row and throws it away after converting to `ShopifyApi.Session`. It could return both.
- Token exchange path: `storeSession` currently decodes a `Domain.Session` and writes it. It could return the decoded value.

Existing session path today:

```ts
const storedSession = yield* repository.findSessionById(id);
if (Option.isNone(storedSession)) return Option.none();
return yield* tryShopify(() =>
  ShopifyApi.Session.fromPropertyArray(
    Object.entries(storedSession.value).filter(
```

Ref: `src/lib/Shopify.ts:208`

Refactor direction:

```ts
const loadSession = Effect.fn("Shopify.loadSession")(function* (id: Domain.Session["id"]) {
  const storedSession = yield* repository.findSessionById(id);
  if (Option.isNone(storedSession)) return Option.none();
  const session = yield* tryShopify(() => ShopifyApi.Session.fromPropertyArray(...));
  return Option.some({ session, domainSession: storedSession.value } as const);
});
```

Token exchange path today:

```ts
yield* storeSession(exchanged.session);
return exchanged.session;
```

Ref: `src/lib/Shopify.ts:557`

Refactor direction:

```ts
const domainSession = yield* storeSession(exchanged.session);
return { session: exchanged.session, domainSession } as const;
```

That requires `storeSession` to return the decoded `Domain.Session` after `repository.upsertSession` succeeds.

The smaller `{ session, shop }` shape is even easier. `authenticateAdmin` already decodes `sessionShop` before it loads or exchanges the offline session:

```ts
const sessionShop = yield* Schema.decodeUnknownEffect(Domain.Shop)(
  new URL(decoded.dest).hostname,
)
const sessionId = yield* offlineSessionId(sessionShop);
```

Ref: `src/lib/Shopify.ts:516`

So the existing-session path can return `{ session: existingSession.value, shop: sessionShop }`, and the token-exchange path can return `{ session: exchanged.session, shop: sessionShop }`, without changing `loadSession`/`storeSession` return values.

That smaller shape probably fits actual usage better:

- `ShopifyAdmin` needs `session`.
- `loadQrCode` needs `shop`.
- `/app` route context needs `shop`.
- No current caller needs the full persisted session row fields like `firstName`, `accountOwner`, or `refreshTokenExpires`.

If the app later needs persisted session metadata, switch from `{ session, shop }` to `{ session, domainSession }` then.

## Upstream Session Shape

Shopify's `Session` class is intentionally a Shopify API transport object:

```ts
export class Session {
  readonly id: string;
  public shop: string;
  public state: string;
  public isOnline: boolean;
  public scope?: string;
  public expires?: Date;
  public accessToken?: string;
```

Ref: `node_modules/.pnpm/@shopify+shopify-api@13.0.0/node_modules/@shopify/shopify-api/lib/session/session.ts:24`

It provides behavior that would be annoying to duplicate correctly:

```ts
public isActive(
  scopes: AuthScopes | string | string[] | undefined,
  withinMillisecondsOfExpiry = 500,
): boolean {
  const hasAccessToken = Boolean(this.accessToken);
  const isTokenNotExpired = !this.isExpired(withinMillisecondsOfExpiry);
  const isScopeChanged = this.isScopeChanged(scopes);
  return !isScopeChanged && hasAccessToken && isTokenNotExpired;
}
```

Ref: `node_modules/.pnpm/@shopify+shopify-api@13.0.0/node_modules/@shopify/shopify-api/lib/session/session.ts:198`

It also knows how to flatten and rebuild sessions, including online user fields:

```ts
public toPropertyArray(
  returnUserData = false,
): [string, string | number | boolean][] {
```

Ref: `node_modules/.pnpm/@shopify+shopify-api@13.0.0/node_modules/@shopify/shopify-api/lib/session/session.ts:300`

## Friction

The awkward bit is real: `session.shop` is `string`, not `Domain.Shop`. Anywhere app code extracts `shop` from a `ShopifyApi.Session`, it either loses the brand or must decode.

Current examples:

- `storeSession` decodes `session.shop` into `Domain.Session.shop` before persistence. Good boundary.
- `authenticateAdmin` decodes session-token `dest` into `Domain.Shop` before computing the offline id. Good boundary.
- `authenticateWebhook` decodes Shopify's validated domain into `Domain.Shop`. Good boundary.
- `CurrentShopifySession` exposes a raw Shopify session to app server-function code. This is the only likely leakage point.

## Options

### 1. Keep `ShopifyApi.Session` as the runtime session

Pros:

- Minimal code.
- Compatible with `shopify.clients.Graphql({ session })` without adapters.
- Keeps upstream lifecycle behavior: `isActive`, `isExpired`, scope checks, token refresh fields, `fromPropertyArray`.
- Current repository boundary already validates persisted domain shape.

Cons:

- App code that needs `shop` must remember to decode `session.shop`.
- `CurrentShopifySession` can become a soft escape hatch for unbranded values.

### 2. Return only `Domain.Session` from auth/load

Pros:

- Domain code always sees branded fields.
- Repository model and request context become consistent.

Cons:

- Shopify API calls still need `ShopifyApi.Session`, so every Admin call needs a conversion back.
- Would either duplicate upstream session behavior or shuttle both shapes around anyway.
- Higher risk around expiry/scope semantics because Shopify's class owns that logic.

### 3. Introduce a small domain-facing authenticated context

Shape would be something like:

```ts
interface AuthenticatedShopifySession {
  readonly shop: Domain.Shop;
  readonly session: ShopifyApi.Session;
}
```

Pros:

- Keeps upstream `Session` for Shopify clients and token lifecycle.
- Gives app code a branded `shop` without repeated decoding.
- Limits raw `session.shop` usage to `src/lib/Shopify.ts` and `ShopifyAdmin` internals.

Cons:

- Adds another name/type/layer to maintain.
- Requires touching middleware, `ShopifyAdmin`, `loadQrCode`, public scan route, and `/app` auth route context.

## Recommendation

Refactor to option 3, but keep it small: authenticated context should carry `{ session: ShopifyApi.Session; shop: Domain.Shop }`, not the full `Domain.Session` yet.

The current architecture is close, but the current `CurrentShopifySession` type is too raw for app/domain use:

- Use `ShopifyApi.Session` at Shopify integration boundaries and for Admin clients.
- Use `Domain.Session` for persistence.
- Decode Shopify strings into `Domain.Shop` at ingress points before app/domain behavior.

I would not replace `ShopifyApi.Session` with a domain type. The upstream class is not just data; it carries Shopify lifecycle behavior (`isActive`, `isExpired`, scope checks, serialization helpers). Wrapping too early adds ceremony and risk.

But this has already become awkward in real app code: `loadQrCode` decodes `session.shop` from `CurrentShopifySession`, and `/app` returns `session.shop` unbranded. The smallest useful change beyond the rename is to add a separate domain-facing current shop context or change the authenticated context from raw `ShopifyApi.Session` to `{ shop, session }`. That gives domain code the branded shop while preserving the exact Shopify object for API calls.

Concrete implementation direction:

- Add an interface/type near `CurrentShopifySession`, e.g. `AuthenticatedSession` with `readonly session: ShopifyApi.Session` and `readonly shop: Domain.Shop`.
- Change `CurrentShopifySession` to provide that object, or add a separate `CurrentShop` service.
- Change `ShopifyAdmin` to call `shopify.graphql(current.session, ...)`.
- Change `shopifyServerFnMiddleware` to build `Layer.succeed(CurrentShopifySession, authenticated.session)` plus a `CurrentShop` layer, or to build `Layer.succeed(CurrentShopifySession, authenticated)` if the service shape changes.
- Change `authenticateAdmin` return success shape to `{ session, shop } | Response`.
- Change `/app` auth route to return `shop: authenticated.shop`.
- Change `loadQrCode` to use `CurrentShop`, or `(yield* CurrentShopifySession).shop` directly if the service shape changes.
- Change public scan route to provide `CurrentShop` too, or create `CurrentShopifySession` as `{ session, shop }` if the service shape changes.

I would not return full `Domain.Session` from `authenticateAdmin` yet. It is possible, but current callers only need branded `shop`; returning full `Domain.Session` would force `loadSession`/`storeSession` API churn without a real consumer.
