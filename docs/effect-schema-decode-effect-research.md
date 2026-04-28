# Effect Schema Decode Effect Research

## Problem

`src/lib/ShopifyAdmin.ts` currently decodes Admin GraphQL response data with the sync decoder inside `Effect.try`:

```ts
return yield* Effect.try({
  try: () => Schema.decodeUnknownSync(schema)(data),
  catch: (cause) => new ShopifyError({ message: "Admin GraphQL response validation failed", cause }),
});
```

This is off because `graphqlDecode` is already in `Effect.gen`. We do not need to leave the Effect model, call a throwing sync API, then re-enter Effect with `Effect.try`.

## Effect v4 Docs

The v4 migration table identifies the Effect-returning decoder as the canonical replacement for old `decodeUnknown`:

```md
| `decodeUnknown` | `decodeUnknownEffect` | rename |
| `decode`        | `decodeEffect`        | rename |
```

Source: `refs/effect4/migration/schema.md:33`-`34`.

The same migration doc shows sync decoding only in a `try`/`catch` example for formatting parse errors:

```ts
const decode = Schema.decodeUnknownSync(Person)

try {
  decode({})
} catch (error) {
  if (error instanceof Error) {
    console.error("Decoding failed:")
    if (SchemaIssue.isIssue(error.cause)) {
      console.error(SchemaIssue.makeFormatterStandardSchemaV1()(error.cause).issues)
    }
  }
}
```

Source: `refs/effect4/migration/schema.md:235`-`245`.

The Effect v4 schema guide demonstrates decoding unknown data directly as an Effect and mapping the `SchemaError` through `Effect.mapError`:

```ts
Schema.decodeUnknownEffect(schema)({ b: "" }, { errors: "all" })
  .pipe(
    Effect.mapError((error) => SchemaIssue.makeFormatterStandardSchemaV1()(error.issue)),
    Effect.runPromise
  )
```

Source: `refs/effect4/packages/effect/SCHEMA.md:6206`-`6217`.

The guide also shows the typed shape of `decodeEffect` for schemas/codecs with possible service requirements:

```ts
//     ┌─── Effect<{ readonly id: string; readonly name: string; }, Schema.SchemaError, UserDatabase>
//     ▼
const decoding = Schema.decodeEffect(User)("user-123")
```

Source: `refs/effect4/packages/effect/SCHEMA.md:6782`-`6784`.

## Local Context

`ShopifyError` is already an Effect v4 tagged schema error class:

```ts
export class ShopifyError extends Schema.TaggedErrorClass<ShopifyError>()(
  "ShopifyError",
  {
    message: Schema.String,
    cause: Schema.Defect,
  },
) {}
```

Source: `src/lib/Shopify.ts:14`-`20`.

So the local shape can stay the same: use schema decoding as an Effect, then map the `Schema.SchemaError` into `ShopifyError`.

## Recommended Change

Replace the `Effect.try` + `Schema.decodeUnknownSync` block with `Schema.decodeUnknownEffect(...).pipe(Effect.mapError(...))`:

```ts
return yield* Schema.decodeUnknownEffect(schema)(data).pipe(
  Effect.mapError((cause) =>
    new ShopifyError({ message: "Admin GraphQL response validation failed", cause }),
  ),
);
```

This keeps the whole branch inside Effect:

- No throwing sync decoder.
- No manual `try` wrapper.
- Decode failure remains typed in the error channel.
- Existing `ShopifyError` mapping remains explicit and local.

## Optional Formatting

If callers need user-facing validation details instead of carrying the raw `Schema.SchemaError`, Effect v4 docs show formatting via `SchemaIssue.makeFormatterStandardSchemaV1()(error.issue)`.

That would require importing `SchemaIssue` and deciding whether `ShopifyError.cause` should contain the raw `SchemaError`, the formatted issue object, or both. For the current code, the smallest idiomatic change is to preserve the raw cause and only swap to `decodeUnknownEffect`.
