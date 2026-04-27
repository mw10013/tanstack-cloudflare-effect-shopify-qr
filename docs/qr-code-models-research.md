# QR Code Models Research

## Scope

Focus: model/domain/service split for porting the QR code tutorial. Excludes config, GUI, React, forms, routes, and dependency setup.

Primary references:

- `docs/qr-code-tutorial.md`
- `refs/shopify-app-qr/app/models/QRCode.server.js`
- `src/lib/Domain.ts`
- `src/lib/ProductRepository.ts`
- `src/lib/ShopifyAdmin.ts`

## Reference Model Shape

The tutorial describes the model as one file that can "get, save, delete, and validate QR codes" in `docs/qr-code-tutorial.md:252-256`.

The reference implementation puts all of these concerns into `refs/shopify-app-qr/app/models/QRCode.server.js`:

```js
export async function getQRCode(handle, graphql, shop) {
export async function getQRCodes(graphql, shop) {
export async function getQRCodeImage(handle, shop) {
export function getDestinationUrl(qrCode, shop) {
export async function saveQRCode(handle, data, graphql) {
export async function deleteQRCode(id, graphql) {
export async function incrementQRCodeScans(id, currentScans, graphql) {
export function generateHandle(title) {
export function validateQRCode(data) {
```

This is convenient for a tutorial, but too mixed for this codebase. It combines:

- persistence: `getQRCode`, `getQRCodes`, `saveQRCode`, `deleteQRCode`, `incrementQRCodeScans`
- Shopify Admin GraphQL DTO mapping: `transformMetaobject`
- domain behavior: `getDestinationUrl`, `generateHandle`
- validation: `validateQRCode`
- presentation/support output: `getQRCodeImage`

## Current Project Patterns

`src/lib/Domain.ts` already owns branded IDs and decoded domain structures:

```ts
export const ProductId = Schema.NonEmptyString.pipe(Schema.brand("ProductId"));
export const VariantId = Schema.NonEmptyString.pipe(Schema.brand("VariantId"));
export const Product = Schema.Struct({
```

`src/lib/ProductRepository.ts` is the closest service shape for Shopify-backed repositories:

```ts
export class ProductRepository extends Context.Service<ProductRepository>()(
  "ProductRepository",
  {
    make: Effect.gen(function* () {
      const admin = yield* ShopifyAdmin;
```

It keeps GraphQL calls behind methods and decodes responses with `ShopifyAdmin.graphqlDecode`:

```ts
const result = yield* admin.graphqlDecode(
  ProductCreateResponse,
  `#graphql
```

`src/lib/ShopifyAdmin.ts` already provides the expected boundary:

```ts
const graphqlDecode = Effect.fn("ShopifyAdmin.graphqlDecode")(function* <A>(
  schema: Schema.Decoder<A>,
  query: string,
```

So QR code persistence should follow `ProductRepository.ts`, not the tutorial's plain async function style.

## Recommended Split

Use three model-level units:

- `src/lib/Domain.ts`: QR domain schemas, branded IDs, destination literals, input/output structures.
- `src/lib/QrRepository.ts`: Effect v4 service for Shopify metaobject CRUD and scan persistence.
- `src/lib/QrService.ts`: Effect v4 service for domain workflows that compose repository methods and pure QR behavior.

Pure helpers can either live in `Domain.ts` as exported functions if they are small and dependency-free, or in `QrService.ts` if they need app URL/config, QR image generation, or repository access.

## Domain.ts Additions

The tutorial metaobject has fields in `docs/qr-code-tutorial.md:56-63`:

```md
- `title`
- `product`
- `product_variant`
- `destination`
- `scans`
```

Recommended domain objects:

```ts
export const QrCodeId = Schema.NonEmptyString.pipe(Schema.brand("QrCodeId"));
export type QrCodeId = typeof QrCodeId.Type;

export const QrCodeHandle = Schema.NonEmptyString.pipe(Schema.brand("QrCodeHandle"));
export type QrCodeHandle = typeof QrCodeHandle.Type;

export const QrCodeDestination = Schema.Literals(["product", "cart"]);
export type QrCodeDestination = typeof QrCodeDestination.Type;

export const QrCode = Schema.Struct({
  id: QrCodeId,
  handle: QrCodeHandle,
  title: Schema.String,
  productId: ProductId,
  productVariantId: VariantId,
  productHandle: Schema.NullOr(Schema.String),
  productVariantLegacyId: Schema.NullOr(Schema.String),
  destination: QrCodeDestination,
  scans: Schema.Number,
  createdAt: Schema.String,
  productDeleted: Schema.Boolean,
  productTitle: Schema.NullOr(Schema.String),
  productImage: Schema.NullOr(Schema.String),
  productAlt: Schema.NullOr(Schema.String),
});
export type QrCode = typeof QrCode.Type;

export const QrCodeUpsert = Schema.Struct({
  title: Schema.String,
  productId: ProductId,
  productVariantId: VariantId,
  destination: QrCodeDestination,
});
export type QrCodeUpsert = typeof QrCodeUpsert.Type;
```

Naming note: the Shopify tutorial uses `destination` values `product` and `cart` in prose: "product page or cart" in `docs/qr-code-tutorial.md:60-62`. The reference `getDestinationUrl` checks `product`, otherwise builds `/cart/...` in `refs/shopify-app-qr/app/models/QRCode.server.js:148-156`. Use `"cart"` unless existing app/UI code chooses a different literal.

## QrRepository Responsibilities

`QrRepository.ts` should be boring persistence and mapping:

- `findByHandle(handle): Effect<Option.Option<Domain.QrCode>, ShopifyError>`
- `list(): Effect<readonly Domain.QrCode[], ShopifyError>`
- `save(handle, input): Effect<{ readonly id: Domain.QrCodeId; readonly handle: Domain.QrCodeHandle }, ShopifyError>`
- `delete(id): Effect<void, ShopifyError>`
- `incrementScans(id, currentScans): Effect<void, ShopifyError>`

Repository should own:

- GraphQL documents for `metaobjectByHandle`, `metaobjects`, `metaobjectUpsert`, `metaobjectDelete`, `metaobjectUpdate`.
- Response schemas for Admin API responses.
- Conversion from raw metaobject fields to `Domain.QrCode`.
- Shopify user error handling from mutations.

Repository should not own:

- form validation
- QR image data URL generation
- public scan redirect URL construction
- handle generation, unless the repository itself creates handles
- route-specific defaults for a new QR code

This matches the dependency direction in `ProductRepository.ts`: service methods call Admin GraphQL and return domain-shaped values, without UI or workflow logic.

## QrService Responsibilities

Add a separate `QrService.ts` for use cases that are not raw CRUD:

- `validate(input): Effect<void, QrValidationError>` or pure `validateQrCode(input)` returning errors.
- `generateHandle(title): Domain.QrCodeHandle`.
- `getDestinationUrl(qr, shop): string`.
- `getScanUrl(handle, shop): string`.
- `getQrCodeImage(handle, shop): Effect<string, QrCodeImageError>`.
- `recordScanAndGetDestination(handle, shop): Effect<Option.Option<string>, ShopifyError | QrCodeError>`.

Reasoning: validation and redirect generation are domain/use-case rules. They are not persistence. `recordScanAndGetDestination` composes `findByHandle`, `incrementScans`, and `getDestinationUrl`, so it belongs above the repository.

## Validation Placement

The reference validation is form-shaped:

```js
if (!data.title) errors.title = "Title is required";
if (!data.productId) errors.productId = "Product is required";
if (!data.destination) errors.destination = "Destination is required";
```

This should not be in `QrRepository.ts` because it does not query or persist anything. Two good options:

- Put schemas in `Domain.ts` and let `Schema.decodeUnknownEffect(Domain.QrCodeUpsert)` validate structural input.
- Put user-facing validation in `QrService.ts` if the route needs field-specific messages like the tutorial.

Recommended: `Domain.ts` owns structural schemas. `QrService.ts` owns user-facing validation messages.

## Scan Increment Placement

`incrementQRCodeScans` is persistence and can be in `QrRepository.ts` because it directly maps to `metaobjectUpdate`:

```js
fields: [{ key: "scans", value: String(currentScans + 1) }]
```

But "handle a scan" should not be in the repository. The workflow is:

1. Fetch QR by handle.
2. Increment `scans`.
3. Resolve destination URL.
4. Return redirect target.

That workflow belongs in `QrService.ts` because only step 2 is repository CRUD.

## Destination URL Placement

The reference destination logic is pure:

```js
if (qrCode.destination === "product") {
  return `https://${shop}/products/${qrCode.productHandle}?variant=${qrCode.productVariantLegacyId}`;
}
return `https://${shop}/cart/${qrCode.productVariantLegacyId}:1`;
```

This should not be in `QrRepository.ts`. It depends on domain fields, not storage. Prefer `QrService.getDestinationUrl` or a pure exported function near QR domain code.

One important domain edge: `productHandle` and `productVariantLegacyId` can be missing when the product/variant reference is deleted or incomplete. The reference throws only for missing variant ID in the cart branch via `invariant` in `refs/shopify-app-qr/app/models/QRCode.server.js:153`. In Effect code, prefer a typed error instead of throwing.

## Handle Generation Placement

The reference handle function is pure:

```js
return `${slugify(title)}-${Date.now().toString(36)}`;
```

Do not put this in `QrRepository.ts` unless `save` is responsible for creating handles. Better split:

- `QrService.generateHandle(title)` generates handles for create workflows.
- `QrRepository.save(handle, input)` persists exactly the handle it receives.

This keeps the repository deterministic and easier to test.

## Metaobject Mapping Notes

The reference uses `metaobjectByHandle` for one QR and `metaobjects(type: "$app:qrcode")` for lists:

```graphql
metaobjectByHandle(handle: $handle) { id handle updatedAt ... }
metaobjects(type: $type, first: 50, sortKey: "updated_at", reverse: true) { nodes { ... } }
```

The transformer maps Shopify fields into the app object:

```js
productDeleted: productId && !product,
productTitle: product?.title,
productImage: product?.media?.nodes[0]?.preview?.image?.url,
```

For this codebase, define decoded GraphQL response schemas inside `QrRepository.ts` and map to `Domain.QrCode`. Keep nullable fields explicit with `Schema.NullOr` so deleted product references are represented instead of throwing during decode.

## Proposed Files

`src/lib/Domain.ts`:

- add `QrCodeId`, `QrCodeHandle`, `QrCodeDestination`
- add `QrCode`, `QrCodeUpsert`
- optionally add `QrCodeValidationErrors` if errors are modeled as data

`src/lib/QrRepository.ts`:

- Effect `Context.Service` matching `ProductRepository.ts`
- Admin GraphQL queries/mutations
- raw metaobject response schemas
- raw-to-domain transform
- mutation user error conversion

`src/lib/QrService.ts`:

- Effect `Context.Service`
- depends on `QrRepository`
- validation, handle generation, QR image generation, destination URLs, scan workflow

## Design Recommendation

Implement `QrRepository.ts` as CRUD plus scan-field persistence only. Add `QrService.ts` for all behavior that answers "what should the app do with this QR code?" rather than "how is this QR code stored?"

This keeps the port aligned with existing Effect service style while avoiding the tutorial model's single-file mixing of persistence, validation, QR rendering, and redirect logic.
