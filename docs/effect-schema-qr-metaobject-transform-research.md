# Effect Schema QR Metaobject Transform Research

This doc describes the original problem with `QrRepository`'s adapter code, the v4 idioms used to replace it, and the implementation as it actually shipped — including the gotchas that bit during integration.

## Original Problem

`src/lib/QrRepository.ts` decoded Shopify GraphQL into a transport schema, manually reshaped that result with `toDomainInput`, then validated the reshaped object with `Domain.QrCode`:

```ts
return yield* Effect.all(result.metaobjects.nodes.map((node) => decodeQrCode(toDomainInput(node))));
```

`toDomainInput` did several low-level jobs at once:

```ts
const getString = (value: unknown) => (typeof value === "string" ? value : "");
const getNumber = (value: unknown) => (typeof value === "number" ? value : 0);

const toDomainInput = (metaobject: typeof QrMetaobject.Type) => {
  const product = metaobject.product?.reference ?? null;
  const variant = metaobject.productVariant?.reference ?? null;
  const image = product?.media.nodes[0]?.preview.image ?? null;
  const productId = getString(metaobject.product?.jsonValue);
  return {
    id: metaobject.id,
    handle: metaobject.handle,
    title: getString(metaobject.title?.jsonValue),
    productId,
    productVariantId: variant?.id ?? "",
    productHandle: product?.handle ?? null,
    productVariantLegacyId: variant?.legacyResourceId ?? null,
    destination: getString(metaobject.destination?.jsonValue),
    scans: getNumber(metaobject.scans?.jsonValue),
    createdAt: metaobject.updatedAt,
    productDeleted: productId !== "" && product === null,
    productTitle: product?.title ?? null,
    productImage: image?.url ?? null,
    productAlt: image?.altText ?? null,
  };
};
```

Smells:

- `field?.jsonValue` ladder repeated for every scalar.
- Malformed values silently coerce to `""` / `0` via `getString` / `getNumber`.
- `productVariant.reference.id` falls back to `""` for deleted/missing variants instead of failing visibly.
- `updatedAt` → `createdAt` rename hidden in adapter code.
- Deleted-product detection mixes raw `jsonValue` and unresolved `reference` — easy to break.
- Transport schema leaves `jsonValue` as `Schema.Unknown`, so the type system is no help.

## Approach

Compose field-level transforms instead of relocating the imperative blob into a single struct-level transform. Three v4 features carry the load:

- **`Schema.decodeTo` at the field level** (`refs/effect4/packages/effect/SCHEMA.md:3081`–`3173`). Each field decodes itself to its domain scalar. The struct never sees `?.jsonValue` again.
- **Sub-schemas for cross-field rules** within `product` / `productVariant`. `productDeleted` depends only on the `product` field — the rule lives there.
- **`Schema.encodeKeys`** (`refs/effect4/packages/effect/SCHEMA.md:951`–`979`, source at `refs/effect4/packages/effect/src/Schema.ts:2566`). Canonical for the `updatedAt` ↔ `createdAt` rename.

Composed together, the final struct-level transform shrinks to a flat spread.

## Building Blocks (As Implemented)

### 1. `JsonValue<S>(inner)` and `NullableJsonValue<S>(inner, fallback)`

Shopify wraps every scalar in `{ jsonValue: T }`. Make that wrapping a schema, parameterised by the inner type, and use `decodeTo` to unwrap:

```ts
const JsonValue = <S extends Schema.Top>(inner: S) =>
  Schema.Struct({ jsonValue: inner }).pipe(
    Schema.decodeTo(
      inner,
      SchemaTransformation.transform({
        decode: (field: { readonly jsonValue: S["Type"] }) => field.jsonValue,
        encode: (value: S["Type"]) => ({ jsonValue: value }),
      }) as never,
    ),
  );

const NullableJsonValue = <S extends Schema.Top>(inner: S, fallback: S["Type"]) =>
  Schema.NullOr(Schema.Struct({ jsonValue: inner })).pipe(
    Schema.decodeTo(
      inner,
      SchemaTransformation.transform({
        decode: (field: { readonly jsonValue: S["Type"] } | null) =>
          field === null ? fallback : field.jsonValue,
        encode: (value: S["Type"]) => ({ jsonValue: value }),
      }) as never,
    ),
  );
```

What this buys:

- `JsonValue(Domain.QrCodeDestination)` decodes `{ jsonValue: "product" | "cart" }` → `"product" | "cart"`. The literal-union check runs at the field, so a bad destination fails at `["destination", "jsonValue"]`, not at the final composition.
- `NullableJsonValue(Schema.Number, 0)` decodes `{ jsonValue: number } | null` → `number`, with `0` as the fallback for missing fields (e.g. fresh metaobjects with no scans yet).
- Wrong-type `jsonValue` (e.g. a number where a string is expected) fails at the field, not silently as `""`.

**Gotcha — the `as never` cast on the transformation.** `Schema.Struct({ jsonValue: inner })` has its `Type` computed via a conditional (`Type_<{...}, S extends optional ? "jsonValue" : never, S extends mutable ? "jsonValue" : never>`). When `S` is generic, TypeScript can't reduce that conditional to `{ jsonValue: S["Type"] }`, so it can't type-check the transformation against `decodeTo`'s expected shape. Annotating the `decode` / `encode` parameters keeps the function bodies type-safe; the `as never` only widens the wrapper to satisfy the unreducible conditional. Calls with concrete inner schemas (`JsonValue(Schema.String)`, `JsonValue(Domain.QrCodeDestination)`) still produce correctly-typed schemas — the cast is only at the helper boundary.

GraphQL aliases (`title: field(key: "title") { jsonValue }`) always include the alias key when requested, so `Schema.NullOr` is enough — no `Schema.optional` needed.

### 2. `ProductBlock` and `VariantBlock`

`product` is the only field with cross-field rules: `productId` from `jsonValue`, the rest from `reference`, plus `productDeleted` if `jsonValue` is set but `reference` resolved to `null`. Group those rules inside one schema that decodes the whole field to the flat block the domain wants:

```ts
const ProductFlat = Schema.Struct({
  productId: Schema.String,
  productHandle: Schema.NullOr(Schema.String),
  productTitle: Schema.NullOr(Schema.String),
  productImage: Schema.NullOr(Schema.String),
  productAlt: Schema.NullOr(Schema.String),
  productDeleted: Schema.Boolean,
});

const ProductFieldShape = Schema.NullOr(
  Schema.Struct({
    jsonValue: Schema.String,
    reference: Schema.NullOr(ProductReference),
  }),
);

const ProductBlock = ProductFieldShape.pipe(
  Schema.decodeTo(
    ProductFlat,
    SchemaTransformation.transform<typeof ProductFlat.Type, typeof ProductFieldShape.Type>({
      decode: (field) => {
        const productId = field?.jsonValue ?? "";
        const reference = field?.reference ?? null;
        const image = reference?.media.nodes[0]?.preview.image ?? null;
        return {
          productId,
          productHandle: reference?.handle ?? null,
          productTitle: reference?.title ?? null,
          productImage: image?.url ?? null,
          productAlt: image?.altText ?? null,
          productDeleted: productId !== "" && reference === null,
        };
      },
      encode: () => null,
    }),
  ),
);
```

Why a sub-schema instead of a top-level transform:

- `productDeleted` and image-flattening live next to the data they read.
- The block returns the same key names the domain uses (`productHandle`, `productImage`, …) so the final struct-level merge is a spread.
- If Shopify changes the product field shape, only this block needs to change.

`encode: () => null` is degenerate-but-valid: the source's encoded form is `… | null`, so returning `null` satisfies the type. Encode for this codec is never called in practice.

`VariantBlock` follows the same pattern with smaller scope (`productVariantId`, `productVariantLegacyId`).

### 3. `QrMetaobject` — the transport schema

Field-level transforms have already cleaned the scalars, the blocks have already flattened their references. The struct just stitches them and renames `updatedAt`:

```ts
const QrMetaobject = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
  createdAt: Schema.String,
  title: NullableJsonValue(Schema.String, ""),
  destination: JsonValue(Domain.QrCodeDestination),
  scans: NullableJsonValue(Schema.Number, 0),
  product: ProductBlock,
  productVariant: VariantBlock,
}).pipe(Schema.encodeKeys({ createdAt: "updatedAt" }));
```

`Schema.encodeKeys({ createdAt: "updatedAt" })` makes the *encoded* form (the GraphQL wire shape) use `updatedAt` while the decoded type uses `createdAt`. This is the rename the adapter used to do by hand.

`id` and `handle` stay as `Schema.String` — domain branding is applied at the final composition step, not here, so the metaobject schema can be reused for read-only paths if needed.

### 4. `QrCodeFromMetaobject` — the second stage

This is the trickiest piece and the one that took longest to get right.

```ts
const QrCodeFromMetaobject = Schema.toType(QrMetaobject).pipe(
  Schema.decodeTo(
    Domain.QrCode,
    SchemaTransformation.transform<typeof Domain.QrCode.Encoded, typeof QrMetaobject.Type>({
      decode: (m) => ({
        id: m.id,
        handle: m.handle,
        createdAt: m.createdAt,
        title: m.title,
        destination: m.destination,
        scans: m.scans,
        ...m.product,
        ...m.productVariant,
      }),
      encode: (q) => ({
        id: q.id,
        handle: q.handle,
        createdAt: q.createdAt,
        title: q.title,
        destination: q.destination,
        scans: q.scans,
        product: { productId: q.productId, productHandle: q.productHandle, productTitle: q.productTitle, productImage: q.productImage, productAlt: q.productAlt, productDeleted: q.productDeleted },
        productVariant: { productVariantId: q.productVariantId, productVariantLegacyId: q.productVariantLegacyId },
      }),
    }),
  ),
);
```

**Why `Schema.toType(QrMetaobject)` is load-bearing.** The decoding pipeline is two-stage on purpose:

1. `ShopifyAdmin.graphqlDecode(GetQrCodeResponse | ListQrCodesResponse, ...)` runs `QrMetaobject` against the raw GraphQL JSON. That stage does the Shopify-specific work — rename, unwrap, flatten — and produces `QrMetaobject.Type`.
2. `decodeQrCode` takes that `QrMetaobject.Type` and runs `QrCodeFromMetaobject` to produce `Domain.QrCode.Type`.

A naive `QrCodeFromMetaobject = QrMetaobject.pipe(Schema.decodeTo(Domain.QrCode, …))` makes the second stage's `Encoded` equal to `QrMetaobject.Encoded` — which is the *GraphQL wire shape* (with `updatedAt` and `{ jsonValue }` wrappers). Feeding it `QrMetaobject.Type` (with `createdAt` and unwrapped scalars) fails immediately:

```
SchemaError(Missing key at ["updatedAt"])
```

`Schema.toType(QrMetaobject)` (`refs/effect4/packages/effect/src/Schema.ts:1716`) returns a schema whose `Encoded === Type === QrMetaobject.Type`. The second stage now accepts what stage 1 actually produced.

This is the kind of bug that wouldn't show up in unit tests of the schema in isolation — it only surfaces when both stages run end-to-end against real GraphQL data. Worth noting in the JSDoc on `QrCodeFromMetaobject` (and we did).

**Why two stages rather than one.** A single `QrCodeFromMetaobject` used directly by `graphqlDecode` would work. We kept two stages so that error labels can be specific: a wire-shape failure surfaces as `ShopifyError("Admin GraphQL response validation failed", …)` from `graphqlDecode`, while a metaobject → domain failure (e.g. invalid brand on `productId`) surfaces as `QrRepositoryError("Invalid QR code metaobject: …", …)` from the repository. Different errors point at different layers being wrong.

**Why encode is implemented symmetrically rather than left undefined.** `SchemaTransformation.transform` requires both `decode` and `encode`. Encode for `QrCodeFromMetaobject` is a clean reverse-spread (split the flat shape back into product/variant blocks) — type-checks cleanly, no casts. The app never calls `Schema.encode` on `Domain.QrCode` (saving uses `Domain.QrCodeUpsert` and a separate mutation), so encode is dead code. We could return `{} as never` instead, but the symmetric implementation is honest and costs nothing.

### 5. Repository call site

```ts
const decodeQrCode = (input: unknown) =>
  Schema.decodeUnknownEffect(QrCodeFromMetaobject)(input).pipe(
    Effect.tapError((cause) =>
      Effect.sync(() => {
        console.error("[QrRepository] Invalid QR code metaobject", { cause: String(cause), input });
      }),
    ),
    Effect.mapError(
      (cause) => new QrRepositoryError({ message: `Invalid QR code metaobject: ${String(cause)}`, cause }),
    ),
  );
```

`toDomainInput`, `getString`, `getNumber` are deleted.

**Why `Effect.tapError` with `console.error` and not just message-formatting.** The `Schema.decodeUnknownEffect` failure is a `SchemaError` that stringifies to a path-annotated reason (e.g. `Missing key at ["updatedAt"]`). Inlining `String(cause)` into the user-facing message makes the symptom visible at the route boundary. `tapError` additionally writes the full cause and the offending `input` to the server log, so even when the rendered error is truncated by an upstream framework (TanStack Start's "Warning: …" client output), the server log has the complete picture. This was the difference between "decoding broken somewhere" and a one-line root cause during the `updatedAt` regression.

`decodeSavedQrCode` mirrors the same logging pattern.

## Why This Is Better Than `toDomainInput`

| Concern                                     | Old `toDomainInput`                  | This approach                                 |
| ------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| `?.jsonValue` ladder                        | repeated 5 times                     | gone — `JsonValue` unwraps once               |
| Malformed `jsonValue` (wrong type)          | silently coerces to `""` / `0`       | fails at `[field, "jsonValue"]` with the path |
| `destination` literal validation            | runs at the very end on a `string`   | runs at the field on the unwrapped value      |
| `productDeleted` rule                       | top-level, mixes refs and raw values | local to `ProductBlock`                       |
| Image flattening                            | top-level, depth-5 optional chain    | local to `ProductBlock`                       |
| `updatedAt` ↔ `createdAt` rename            | hidden in adapter object literal     | `encodeKeys({ createdAt: "updatedAt" })`      |
| Adapter code                                | one ~25-line function                | one spread inside the final transform         |

## Trade-offs and Caveats

- **Two `as never` casts on `JsonValue` / `NullableJsonValue`.** Forced by TypeScript's inability to reduce the generic `Schema.Struct` `Type_` conditional. Runtime is correct; the cast acknowledges the inference gap. The non-generic blocks (`ProductBlock`, `VariantBlock`, final composition) are fully typed without casts.
- **Earlier draft used `transformOrFail` with `SchemaIssue.Forbidden` for encode.** Inference failed there too — `transformOrFail<T, E>` couldn't infer `T`/`E` without explicit annotations, and the obvious annotations triggered the same conditional-reduction problem. Switched to plain sync `transform` with reversible / degenerate encodes. The "explicit forbidden encode" framing is gone but encode is dead code anyway.
- **`Schema.toType` on the second-stage source is non-obvious.** Without it, the second decoder demands the wire shape from already-decoded input. The symptom (`Missing key at ["updatedAt"]`) only appears with the two-stage `graphqlDecode` → `decodeQrCode` wiring, not when decoding the schema in isolation.
- **Empty-string fallbacks for `productId` / `productVariantId` are preserved.** GraphQL never returns an empty product id when the metaobject has one, and `Domain.QrCode` brands them `NonEmptyString`, so an actual empty would fail at the final composition. Matches today's behaviour.
- **`Schema.optional` is dropped from field wrappers.** Aliased GraphQL fields always emit the key; `Schema.NullOr` alone is correct.
- **`Domain.QrCode` is unchanged.** No need to rename `createdAt` in the domain — `encodeKeys` handles it at the boundary.

## Verification Steps That Caught Bugs

- `pnpm typecheck` — caught the generic `Type_` reduction issue, the `transformOrFail` inference problem, and forced the design toward sync `transform` with annotated parameters.
- End-to-end decode against a real Shopify response — caught the `Schema.toType` issue. Schema-level unit tests would not have caught it because the schema itself round-trips fine; the bug was in the wiring between `graphqlDecode` and `decodeQrCode`.
- Verbose `console.error` of `cause` + `input` in `decodeQrCode` — pointed straight at `Missing key at ["updatedAt"]` once the page actually loaded.

Keep the verbose error logging. The pattern (`tapError` for full server-side context, `String(cause)` inlined into the user-facing message for at-the-boundary visibility) is cheap insurance for any decoder that crosses a system boundary.

## Out of Scope

- Encoding `Domain.QrCode` back to Shopify metaobject input. The `save` path uses `Domain.QrCodeUpsert` and a separate GraphQL mutation, not `Schema.encode` on `Domain.QrCode`.
- `mapFields` / `Struct.evolve` / `Struct.renameKeys`: not used. Useful when most fields keep the same shape and you want a derived struct, but here we cross transport ↔ domain so `decodeTo` is the right tool.
- Splitting into transport / normalised / domain layers: rejected. The two-step `QrMetaobject → Domain.QrCode` already gives one named normalised stop.
