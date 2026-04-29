# QR Form Field Error Messages Research

## Problem

`QrCodeUpsert` uses `Schema.NonEmptyString` and branded types. Default Effect v4 Schema error messages are technical:

- `title` empty → `"Expected a value with a length of at least 1, got \"\""`
- `productId` empty → same (branded type, same underlying check)
- `productVariantId` empty → same

## How Effect v4 Schema Formats Filter Errors

The Standard Schema formatter (used by `Schema.toStandardSchemaV1`) calls `defaultCheckHook` for `Filter` issues:

```typescript
// SchemaIssue.ts
export const defaultCheckHook: CheckHook = (issue): string | undefined => {
  return findMessage(issue.issue) ?? findMessage(issue)
}

function findMessage(issue: Issue): string | undefined {
  switch (issue._tag) {
    case "Filter":
      return getMessageAnnotation(issue.filter.annotations) // <-- filter's annotations
    case "InvalidValue":
      return getMessageAnnotation(issue.annotations)        // <-- InvalidValue's annotations
    ...
  }
}
```

Fallback when no message found on a `Filter` wrapping `InvalidValue`:
```typescript
message: getExpectedMessage(formatCheck(issue.filter), format(issue.actual))
// → "Expected a value with a length of at least 1, got \"\""
```

## Key Insight: Where to Set the Message

`Schema.annotate({ message })` sets annotations on the **schema's AST node**, not on the filter. For `Filter` issues, `findMessage` reads `issue.filter.annotations.message` (the `AST.Check`'s annotations). So `Schema.annotate` does **not** override filter messages.

The two effective ways:

### Option A: Pass `message` to the check function

Filter check functions like `isNonEmpty`, `isMinLength`, etc. accept `Annotations.Filter`:

```typescript
// Annotations.Filter interface
export interface Filter extends Augment {
  readonly message?: string | undefined
  ...
}

Schema.String.check(Schema.isNonEmpty({ message: "Title is required" }))
```

The `message` lands on `filter.annotations.message`, which `findMessage` reads.

### Option B: Return a string from `Schema.filter`

```typescript
Schema.String.pipe(
  Schema.filter((v) => v.length > 0 ? undefined : "Title is required")
)
```

Returning a string from a filter creates an `InvalidValue` with `annotations: { message: "..." }`. Then `findMessage(issue.issue)` returns it.

## Current Schema

```typescript
// Domain.ts
export const QrCodeUpsert = Schema.Struct({
  title: Schema.NonEmptyString,               // → bad message
  productId: ProductId,                        // NonEmptyString + brand → bad message
  productVariantId: VariantId,                 // NonEmptyString + brand → bad message
  destination: QrCodeDestination,              // Literals, can't be empty in normal use
});
```

## Implementation Options

### Option 1: Modify `QrCodeUpsert` in `Domain.ts`

Add annotated checks directly. These are domain-level constraints (title required, product required), so this is reasonable.

```typescript
export const QrCodeUpsert = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty({ message: "Title is required" })),
  productId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("ProductId")),
  productVariantId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("VariantId")),
  destination: QrCodeDestination,
});
```

Note: both `productId` and `productVariantId` get the same message because in the form they render a single combined error via `fieldError([...productIdField.state.meta.errors, ...productVariantIdField.state.meta.errors])`, and `fieldError` dedupes by message.

**Pros**: Simple, one place to change.
**Cons**: UI-specific text leaks into domain schema.

### Option 2: Form-specific schema in the route

Keep `Domain.QrCodeUpsert` clean; override fields in the route file.

```typescript
// app.qrcodes.$id.tsx
const QrFormInput = Schema.Struct({
  ...Domain.QrCodeUpsert.fields,
  title: Schema.String.check(Schema.isNonEmpty({ message: "Title is required" })),
  productId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("ProductId")),
  productVariantId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("VariantId")),
});
```

The spread-then-override creates a new Struct with the overridden fields.

`SaveQrCodeInput` would still use `QrFormInput.fields`:
```typescript
const SaveQrCodeInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  ...QrFormInput.fields,
});
```

**Pros**: Domain stays clean. UI messages colocated with form code.
**Cons**: More code in the route; field definitions duplicated.

## Recommendation

**Option 1** (modify `Domain.QrCodeUpsert`) for minimal change. The messages ("Title is required", "Please select a product") reflect domain constraints, not just UI presentation. The types remain the same since the brands ("ProductId", "VariantId") are preserved.

If the project later adds other consumers of `QrCodeUpsert` that shouldn't show these messages (e.g., API validation with different error format), revisit Option 2.
