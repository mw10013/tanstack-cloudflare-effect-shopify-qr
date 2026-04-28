# `runEffect` Error Cause Message Research

Question: `makeRunEffect` must throw values TanStack Start can serialize. TanStack's server-function error path only keeps `Error.message`, but our Effect errors often carry the useful detail in `.cause`. What should `runEffect` do so Effect and app failures stay useful?

## Problem Restated

There are two different cases that currently get conflated:

1. Effect-generated wrappers like `Cause.UnknownError`, especially from unannotated `Effect.tryPromise`, can add low-value text around the real failure.
2. App errors like `QrRepositoryError`, `ShopifyError`, `D1Error`, `QrServiceError`, and `RepositoryError` have meaningful outer messages, but also store root detail in `.cause`. If `runEffect` throws only the outer message, the cause is swallowed by TanStack serialization.

`src/worker.ts:85-89` currently solves only the first case and worsens/ignores the second:

```ts
if (Cause.isUnknownError(squashed) && squashed.cause instanceof Error) {
  squashed.message = squashed.cause.message;
} else if (!squashed.message) {
  squashed.message = Cause.pretty(exit.cause);
}
```

`src/lib/QrRepository.ts:298-303` manually works around this by stuffing cause into the outer message:

```ts
const decodeQrCode = (input: unknown) =>
  Schema.decodeUnknownEffect(QrCodeFromMetaobject)(input).pipe(
    Effect.mapError(
      (cause) => new QrRepositoryError({ message: `Invalid QR code metaobject: ${String(cause)}`, cause }),
    ),
  );
```

That workaround is useful because TanStack's built-in Error serialization preserves only `.message` for server-function errors. Other repo errors do not do this, so their `.cause` detail disappears at the error boundary.

Examples:

- `src/lib/QrService.ts:38`: `new QrServiceError({ message: "Invalid QR code handle", cause })` loses schema parse detail.
- `src/lib/ShopifyAdmin.ts:23`: `new ShopifyError({ message: "Admin GraphQL response validation failed", cause })` loses validation detail.
- `src/lib/Repository.ts:21`: `new RepositoryError({ message: "Invalid Session row", cause })` loses decode detail.
- `src/lib/QrRepository.ts:443`: `new ShopifyError({ message: "Save QR code returned no metaobject", cause: result })` loses the GraphQL result.

## TanStack Reference Findings

### Server functions really do keep only `Error.message`

`refs/tan-start/packages/router-core/src/ssr/serializer/ShallowErrorPlugin.ts:8-42`:

```ts
/**
 * this plugin serializes only the `message` part of an Error
 */
export const ShallowErrorPlugin = createPlugin<Error, ErrorNode>({
  parse: {
    sync(value, ctx) {
      return {
        message: ctx.parse(value.message),
      }
    },
  },
  serialize(node, ctx) {
    return 'new Error(' + ctx.serialize(node.message) + ')'
  },
  deserialize(node, ctx) {
    return new Error(ctx.deserialize(node.message))
  },
})
```

`refs/tan-start/packages/start-server-core/src/server-functions-handler.ts:348-364` sends thrown server-function errors through seroval:

```ts
const serializedError = JSON.stringify(
  await Promise.resolve(
    toCrossJSONAsync(error, {
      refs: new Map(),
      plugins: serovalPlugins,
    }),
  ),
)
return new Response(serializedError, {
  headers: {
    'Content-Type': 'application/json',
    [X_TSS_SERIALIZED]: 'true',
  },
})
```

`refs/tan-start/packages/start-client-core/src/client-rpc/serverFnFetcher.ts:245-248` then reconstructs and rethrows the serialized value:

```ts
const jsonPayload = await response.json()
result = fromCrossJSON(jsonPayload, { plugins: serovalPlugins! })
```

Implication: for `runEffect`-thrown server-function errors, `name`, `_tag`, `stack`, and all custom properties are lost unless their important parts are embedded into `.message`.

### Not every TanStack error path is identical

`refs/tan-start/packages/router-core/src/router.ts:839-850`:

```ts
export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as any).stack = err.stack
    }
```

Implication: deferred-data / router serialization is not exactly the same as the server-function `ShallowErrorPlugin` path. The central `runEffect` problem still exists, but the transport story is narrower than "TanStack always keeps only `.message`".

## Effect Reference Findings

### `Cause.squash` is the wrong primitive for diagnostics

`refs/effect4/packages/effect/src/internal/effect.ts:300-308`:

```ts
const partitioned = causePartition(self)
if (partitioned.Fail.length > 0) {
  return partitioned.Fail[0].error
} else if (partitioned.Die.length > 0) {
  return partitioned.Die[0].defect
} else if (partitioned.Interrupt.length > 0) {
  return new globalThis.Error("All fibers interrupted without error")
}
return new globalThis.Error("Empty cause")
```

`refs/effect4/packages/effect/src/Cause.ts:700-707` documents it as lossy:

```ts
 * 1. First {@link Fail} error (the `E` value)
 * 2. First {@link Die} defect
 * 3. A generic `Error("All fibers interrupted without error")` for interrupt-only causes
 * 4. A generic `Error("Empty cause")` for {@link empty}
 *
 * This is the function used by `Effect.runPromise` and `Effect.runSync` to
 * decide what to throw. It is lossy — use {@link prettyErrors} or iterate
 * `cause.reasons` when you need all failures.
```

Implication: `squash` is fine for selecting control-flow values (`Response`, redirect, notFound), but not enough for producing the one serialized diagnostic string.

### `UnknownError` really is a generic wrapper

`refs/effect4/packages/effect/src/internal/effect.ts:978-987`:

```ts
export const tryPromise = <A, E = Cause.UnknownError>(
  options: {
    readonly try: (signal: AbortSignal) => PromiseLike<A>
    readonly catch: (error: unknown) => E
  } | ((signal: AbortSignal) => PromiseLike<A>)
): Effect.Effect<A, E> => {
  const f = typeof options === "function" ? options : options.try
  const catcher = typeof options === "function"
    ? ((cause: unknown) => new UnknownError(cause, "An error occurred in Effect.tryPromise"))
    : options.catch
```

`refs/effect4/packages/effect/src/internal/effect.ts:5871-5878`:

```ts
export class UnknownError extends TaggedError("UnknownError")<{
  cause: unknown
  message?: string | undefined
}> {
  readonly [UnknownErrorTypeId] = UnknownErrorTypeId
  constructor(cause: unknown, message?: string) {
    super({ message, cause } as any)
  }
}
```

Implication: for `UnknownError`, the cause normally matters more than the wrapper. Showing only `UnknownError` or `An error occurred in Effect.tryPromise` is bad.

### Effect error classes already wire `Error.cause`

`refs/effect4/packages/effect/src/internal/core.ts:597-605`:

```ts
export const Error: new<A extends Record<string, any> = {}>(
  args: Types.VoidIfEmpty<{ readonly [P in keyof A]: A[P] }>
) => Cause.YieldableError & Readonly<A> = (function() {
  const plainArgsSymbol = Symbol.for("effect/Data/Error/plainArgs")
  return class Base extends YieldableError {
    constructor(args: any) {
      super(args?.message, args?.cause ? { cause: args.cause } : undefined)
      if (args) {
        Object.assign(this, args)
```

`refs/effect4/packages/effect/src/internal/core.ts:619-628`:

```ts
export const TaggedError = <Tag extends string>(
  tag: Tag
): new<A extends Record<string, any> = {}>(
  args: Types.VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>
) => Cause.YieldableError & { readonly _tag: Tag } & Readonly<A> => {
  class Base extends Error<{}> {
    readonly _tag = tag
  }
  ;(Base.prototype as any).name = tag
  return Base as any
}
```

Implication: our `Schema.TaggedErrorClass` errors already have real `Error.cause` chains. The issue is transport serialization, not error construction.

### `Cause.prettyErrors` is the right primitive for compact transport formatting

`refs/effect4/packages/effect/src/internal/effect.ts:312-377`:

```ts
export const causePrettyErrors = <E>(self: Cause.Cause<E>): Array<Error> => {
  const errors: Array<Error> = []
  for (const failure of self.reasons) {
    errors.push(
      causePrettyError(
        failure._tag === "Die" ? failure.defect : failure.error as any,
        failure.annotations
      )
    )
  }
  return errors
}

export const causePrettyError = (
  original: Record<string, unknown> | Error,
  annotations?: ReadonlyMap<string, unknown>
): Error => {
  const kind = typeof original
  let error: Error
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause as any) : undefined
    })
    if (typeof original.name === "string") {
      error.name = original.name
    }
  }
```

`refs/effect4/packages/effect/src/Cause.ts:1022-1028`:

```ts
 * @see {@link pretty} — renders the cause as a single string
 * @see {@link squash} — lossy collapse to a single thrown value
 */
export const prettyErrors: <E>(self: Cause<E>) => Array<Error> = effect.causePrettyErrors
```

Implication: `Cause.prettyErrors(exit.cause)` is the best source for a transport-safe summary. It is non-lossy across `cause.reasons`, preserves `name`, recursively rebuilds `Error.cause`, and formats non-`Error` values using Effect's own logic. That is a better substrate than walking `Cause.squash(exit.cause)` ourselves.

### `Cause.pretty` already renders nested causes

`refs/effect4/packages/effect/src/internal/effect.ts:348-357`:

```ts
export const causePrettyError = (
  original: Record<string, unknown> | Error,
  annotations?: ReadonlyMap<string, unknown>
): Error => {
  const kind = typeof original
  let error: Error
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause as any) : undefined
    })
```

`refs/effect4/packages/effect/src/internal/effect.ts:380-395`:

```ts
const causePrettyMessage = (u: Record<string, unknown> | Error): string => {
  if (typeof u.message === "string") {
    return u.message
  } else if (
    typeof u.toString === "function"
    && u.toString !== Object.prototype.toString
    && u.toString !== Array.prototype.toString
  ) {
    try {
      return u.toString()
    } catch {
    }
  }
  return formatJson(u)
}
```

`refs/effect4/packages/effect/src/internal/effect.ts:461-465`:

```ts
export const causePretty = <E>(cause: Cause.Cause<E>): string =>
  causePrettyErrors<E>(cause).map((e) =>
    e.cause ? `${e.stack} {\n${renderErrorCause(e.cause as Error, "  ")}\n}` : e.stack
  )
    .join("\n")
```

`refs/effect4/packages/effect/src/Cause.ts:1031-1045` documents the cause chain output:

```ts
 * Renders a {@link Cause} as a human-readable string for logging or
 * debugging.
 *
 * Delegates to {@link prettyErrors} to convert each reason to an `Error`,
 * then joins their stack traces with newlines. Nested `Error.cause` chains
 * are rendered inline with indentation:
 *
 * ```text
 * ErrorName: message
 *     at ...
 *     at ... {
 *   [cause]: NestedError: message
 *       at ...
 * }
```

Implication: if the boundary wants full diagnostic fidelity, `Cause.pretty(exit.cause)` is the Effect-native answer. It includes outer app message plus nested cause detail, but it also bakes stack frames into the one serialized string.

## Effective Approaches

### Approach 1: Boundary Diagnostic Message

In `runEffect`, after preserving `Response` / redirect / notFound, throw an `Error` whose `.message` is derived from `Cause.pretty(exit.cause)` for every non-control-flow failure.

Shape:

```ts
const message = Cause.pretty(exit.cause);
if (squashed instanceof Error) {
  squashed.message = message;
  throw squashed;
}
throw new Error(message);
```

Pros:

- Central fix. No need to manually stuff `String(cause)` into every custom error message.
- Handles `UnknownError` correctly because `Cause.pretty` renders its cause chain.
- Handles app errors correctly because `Cause.pretty` renders `ShopifyError: outer message { [cause]: ... }`.
- Uses Effect's documented diagnostic renderer instead of custom recursive formatting.

Cons:

- Browser-facing message becomes verbose and stack-like.
- Existing `worker.ts` comment already notes V8 can duplicate message/stack in the client.
- Not ideal if the error boundary is user-facing instead of developer-facing.

Best when: error boundary is primarily a developer/debugging surface during this port.

### Approach 2: Boundary Summary from `Cause.prettyErrors`

Set `.message` to a compact recursive summary derived from `Cause.prettyErrors(exit.cause)`: outer message plus formatted cause chain, without stacks.

Example output:

```text
QrServiceError: Invalid QR code handle
caused by: ParseError: Expected QrCodeHandle, actual "..."
```

Shape:

```ts
const formatError = (error: Error): string => {
  const head = error.name !== "Error"
    ? error.message ? `${error.name}: ${error.message}` : error.name
    : error.message || "Error";
  return error.cause instanceof Error
    ? `${head}\ncaused by: ${formatError(error.cause)}`
    : head;
};

const message = Cause.prettyErrors(exit.cause).map(formatError).join("\n\n");
```

No special `UnknownError` branch is required. If the wrapper is present in the error chain, it will appear in the compact summary along with its nested cause.

Pros:

- Central fix.
- More readable than `Cause.pretty`.
- Preserves app wrapper context and nested details.
- Uses Effect's own non-lossy cause-to-`Error` conversion instead of rebuilding unknown values ourselves.
- Handles parallel / multi-reason causes because it starts from `prettyErrors`, not `squash`.

Cons:

- We still own the final string formatting policy.
- Generic wrappers like `UnknownError: An error occurred in Effect.tryPromise` may still appear in the chain.
- If that wrapper later proves too noisy, we can collapse it with a narrow display-only rule, but that is optional rather than foundational.

Best when: UI needs cleaner messages than `Cause.pretty`, but we still want Effect to do the hard work of normalizing causes.

### Approach 3: Error Classes Own Their Public Message

Keep `runEffect` mostly as-is, and require every app error constructor site to include cause detail in `message` when it matters.

Current good example:

```ts
new QrRepositoryError({ message: `Invalid QR code metaobject: ${String(cause)}`, cause })
```

Would need applying to many sites:

- `QrServiceError({ message: "Invalid QR code handle", cause })`
- `ShopifyError({ message: "Admin GraphQL response validation failed", cause })`
- `RepositoryError({ message: "Invalid Session row", cause })`
- `ShopifyError({ message: "Save QR code returned no metaobject", cause: result })`

Pros:

- Most control over user-facing wording per domain.
- Keeps `runEffect` simple.

Cons:

- Repetitive and easy to forget.
- Creates inconsistent diagnostics across the repo.
- `String(cause)` is often poor for plain objects (`[object Object]`) unless each call site formats carefully.
- Does not help unanticipated errors or defects.

Best when: errors are intentionally user-facing and every call site has domain-specific phrasing.

### Approach 4: Two-Field Transport Error, If TanStack Path Allows It

Throw/serialize a custom error payload with both a concise public message and diagnostic detail.

Example desired shape:

```ts
{
  message: "Admin GraphQL response validation failed",
  detail: Cause.pretty(exit.cause)
}
```

Pros:

- Best product shape: concise display plus expandable diagnostics.
- Avoids overloading `.message` with stack/detail.

Cons:

- Current premise is TanStack's `ShallowErrorPlugin` keeps only `.message` for `Error` objects.
- Would require routing errors through a non-`Error` serialized value or custom serialization/error-boundary handling.
- Risky unless we prove Start preserves the payload in every server function and SSR dehydration path.

Best when: we invest in a custom error transport/UI instead of relying on thrown `Error` serialization.

## Recommendation

Use a compact variant of Approach 2, but derive it from `Cause.prettyErrors(exit.cause)`, not from `Cause.squash(exit.cause)`. Approach 1 (`Cause.pretty`) is centralized and Effect-native, but bakes server-side stack frames into the single `.message` string the client receives — and after `ShallowErrorPlugin` reconstructs `new Error(message)`, V8 prepends another `name: message` line and appends another client-side stack. `prettyErrors` is the better midpoint: Effect still performs the hard part (non-lossy cause traversal, `name` preservation, recursive `Error.cause` reconstruction, object formatting), while `runEffect` owns only the final compact string.

### Concrete `runEffect` Rule

1. Use `Cause.squash(exit.cause)` only to detect and rethrow `Response`, redirect, and notFound.
2. For every other failure, derive normalized `Error` values from `Cause.prettyErrors(exit.cause)` and compact them into one transport message:

   ```ts
   const formatError = (error: Error): string => {
     const head = error.name !== "Error"
       ? error.message ? `${error.name}: ${error.message}` : error.name
       : error.message || "Error";
     return error.cause instanceof Error
       ? `${head}\n  caused by: ${formatError(error.cause)}`
       : head;
   };

   const message = Cause.prettyErrors(exit.cause).map(formatError).join("\n\n");
   ```

3. If `squashed instanceof Error`, assign `squashed.message = message` and throw it (preserves identity for server-side logging before `ShallowErrorPlugin` strips it).
4. Otherwise throw `new Error(message)`.

### Why this over Approach 1

- **Recovers error names without relying on `_tag`.** `prettyErrors` copies `name` from the original failure, and embedding it into the message survives the round-trip: `QrServiceError: Invalid QR code handle\n  caused by: ParseError: Expected QrCodeHandle...`.
- **No stack frames in `.message`.** Avoids V8's client-side stack reconstruction duplicating the server stack.
- **Centralized.** Removes pressure to stuff `String(cause)` into every app error constructor (`QrServiceError`, `ShopifyError`, `RepositoryError`, etc.).
- **Handles non-`Error` causes through Effect's own formatter.** `metaobjectUpsert: null`-style structured causes are already normalized by `causePrettyError`.
- **Handles multi-reason causes.** `prettyErrors` preserves all reasons; a `squash`-walker cannot.

### Why not special-case `UnknownError`

- **Not required for correctness.** Once the chain is preserved, the real nested failure is visible even if an `UnknownError` wrapper stays in the summary.
- **Simpler policy.** `runEffect` can format every normalized `Error` the same way instead of baking Effect-specific wrapper knowledge into transport code.
- **Lower risk of hiding useful wrappers.** `UnknownError` is generic today, but a display-only skip rule is easy to add later if its presence proves noisy in real boundaries.

Server-side, deep diagnostics still flow through `Effect.log` / `Cause.pretty` — that channel isn't bottlenecked by `ShallowErrorPlugin`. The transport message only needs to be useful, not exhaustive. Approach 4 (two-field payload) remains the right long-term shape if we ever invest in a custom error transport.

## Tests To Add If Implemented

1. `Effect.fail(new QrRepositoryError({ message: "Invalid QR code metaobject", cause: new Error("schema detail") }))` throws a message containing both `QrRepositoryError`, `Invalid QR code metaobject`, and `schema detail`.
2. `Effect.fail(new ShopifyError({ message: "Save QR code returned no metaobject", cause: { metaobjectUpsert: null } }))` throws a message containing the outer message and JSON-serialized object detail.
3. `Effect.tryPromise(() => Promise.reject(new Error("network detail")))` throws a message containing `network detail`; whether `UnknownError` also appears is a formatting-policy choice, not a correctness requirement.
4. `Effect.fail(new Response(...))`, redirect, and notFound remain unchanged.
5. `Effect.die(...)` / defect paths produce a useful message via the same chain walker.
6. A multi-reason cause (for example parallel failures) produces a message containing both top-level reasons, proving `runEffect` formats `Cause.prettyErrors(...)` rather than `Cause.squash(...)`.
