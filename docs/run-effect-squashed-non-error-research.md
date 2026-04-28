# `runEffect` Squashed Non-Error Research

Question: in `src/worker.ts`, `makeRunEffect` clearly preserves `Response`, redirect, and notFound control-flow values. If `Cause.squash(exit.cause)` is not one of those and not an `Error`, what can it be, does it happen, and should `runEffect` preserve more than a formatted message?

## Current Code

`src/worker.ts:81-85`:

```ts
const squashed = Cause.squash(exit.cause);
if (squashed instanceof Response || isRedirect(squashed) || isNotFound(squashed)) throw squashed;
const message = Cause.prettyErrors(exit.cause).map(formatErrorMessage).join("\n");
throw new Error(message);
```

Important detail: after control-flow detection, `squashed` is intentionally ignored. The thrown value is always a fresh `Error(message)`.

## What Can `squashed` Be?

Effect documents `Cause.squash` as returning `unknown`, not `Error`.

`refs/effect4/packages/effect/src/Cause.ts:696-707`:

```ts
/**
 * Collapses a {@link Cause} into a single `unknown` value, picking the "most
 * important" failure in this order:
 *
 * 1. First {@link Fail} error (the `E` value)
 * 2. First {@link Die} defect
 * 3. A generic `Error("All fibers interrupted without error")` for interrupt-only causes
 * 4. A generic `Error("Empty cause")` for {@link empty}
 *
 * This is the function used by `Effect.runPromise` and `Effect.runSync` to
 * decide what to throw. It is lossy — use {@link prettyErrors} or iterate
 * `cause.reasons` when you need all failures.
 */
export const squash: <E>(self: Cause<E>) => unknown = effect.causeSquash
```

Implementation confirms there is no `Error` wrapping for `Fail` or `Die` values.

`refs/effect4/packages/effect/src/internal/effect.ts:299-308`:

```ts
export const causeSquash = <E>(self: Cause.Cause<E>): unknown => {
  const partitioned = causePartition(self)
  if (partitioned.Fail.length > 0) {
    return partitioned.Fail[0].error
  } else if (partitioned.Die.length > 0) {
    return partitioned.Die[0].defect
  } else if (partitioned.Interrupt.length > 0) {
    return new globalThis.Error("All fibers interrupted without error")
  }
  return new globalThis.Error("Empty cause")
}
```

So `squashed` can be:

- A `Response`, redirect object, or notFound object when app code fails with those control-flow values.
- Any typed failure `E`: `Error`, `string`, `number`, `boolean`, `null`, `undefined`, plain object, array, branded object, Effect `TaggedError`, Shopify GraphQL result object, etc.
- Any defect from `Effect.die(...)` or thrown/rejected untyped code if it enters the cause as a `Die`.
- Synthetic `Error`s for interrupt-only or empty causes.

Non-`Error` is therefore possible. It is not only theoretical. `Effect.fail("bad")`, `Effect.fail({ reason: "bad" })`, `Effect.die("defect")`, or a catch function returning a plain object all produce non-`Error` squashed values.

## What Happens To Non-Error Values Today?

Even though `runEffect` ignores `squashed`, `Cause.prettyErrors(exit.cause)` still formats non-`Error` failures.

`refs/effect4/packages/effect/src/internal/effect.ts:348-376`:

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
    if (typeof original.name === "string") {
      error.name = original.name
    }
```

`refs/effect4/packages/effect/src/internal/effect.ts:367-376`:

```ts
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        ;(error as any)[key] = (original as any)[key]
      }
    }
  } else {
    error = new globalThis.Error(
      !original ? `Unknown error: ${original}` : kind === "string" ? original as any : formatJson(original)
    )
  }
```

`refs/effect4/packages/effect/src/internal/effect.ts:380-394`:

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
      // something's off, rollback to json
    }
  }
  return formatJson(u)
}
```

Implications:

- `string` failures become `Error("that string")`.
- `null`, `undefined`, `false`, `0`, and other falsy primitives become `Error("Unknown error: value")`.
- Non-string primitives generally become JSON-formatted messages.
- Plain objects use `.message` if present, custom `.toString()` if useful, otherwise JSON formatting.
- Object `.cause` chains are recursively normalized.
- Object `name` is copied onto the normalized `Error`.
- Enumerable custom properties are copied onto the normalized `Error`, but current `formatErrorMessage` only reads `.name`, `.message`, and `.cause`.

So non-`Error` values are handled for message production. They are not preserved as thrown values.

## Error Subclasses And Custom Properties

An `Error` subclass with additional properties is also normalized by `prettyErrors`, but `runEffect` ultimately throws `new Error(message)`, so subclass identity and custom properties are discarded.

This is mostly aligned with the TanStack Start server-function transport.

`refs/tan-start/packages/router-core/src/ssr/serializer/ShallowErrorPlugin.ts:8-18`:

```ts
/**
 * this plugin serializes only the `message` part of an Error
 * this helps with serializing e.g. a ZodError which has functions attached that cannot be serialized
 */
export const ShallowErrorPlugin = /* @__PURE__ */ createPlugin<
  Error,
  ErrorNode
>({
  tag: '$TSR/Error',
  test(value) {
    return value instanceof Error
```

`refs/tan-start/packages/router-core/src/ssr/serializer/ShallowErrorPlugin.ts:20-42`:

```ts
parse: {
  sync(value, ctx) {
    return {
      message: ctx.parse(value.message),
    }
  },
  async async(value, ctx) {
    return {
      message: await ctx.parse(value.message),
    }
  },
  stream(value, ctx) {
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
}
```

That means if `runEffect` threw the original subclass, Start would still serialize it to `new Error(message)` for server-function calls. `.name`, `.cause`, `.stack`, `_tag`, `status`, `code`, `issues`, `extensions`, and other custom properties would not survive that boundary.

Preserving subclass identity by throwing `squashed` would only matter for code that catches the thrown value on the server before TanStack serializes it. At the current `runEffect` boundary, there does not appear to be such a catch layer. `runEffect` is the adapter from Effect failures into request/server-function throwing behavior.

## Do We Care At Completion Time?

At the moment `runEffect` completes with failure, there are two different concerns:

- Control flow: preserve values TanStack expects to catch specially. Current code does this for `Response`, redirect, and notFound.
- Diagnostics: make the eventual serialized/client-visible error useful. Current code does this by formatting all `Cause.prettyErrors(exit.cause)` into the new `Error.message`.

For this boundary, details such as original object identity, subclass prototype, and custom properties are usually less important than a stable diagnostic message because TanStack's default `Error` transport discards those details anyway.

The important exception is HTTP/control-flow values. Those must not be normalized to `Error`, because their identity is their behavior.

## Assessment Of Current Behavior

Current behavior is defensible:

- It treats `Cause.squash` as a selector for known control-flow values only.
- It does not pretend `squashed` is always an `Error`.
- It relies on `Cause.prettyErrors` to normalize arbitrary typed failures and defects.
- It converts the result to a plain `Error(message)`, matching what the Start boundary can actually preserve.

Current behavior is intentionally lossy:

- Original non-control-flow thrown value is not preserved.
- Error subclass identity is not preserved.
- Custom properties are not preserved except insofar as `prettyErrors` includes them in JSON-derived messages or nested cause messages.
- If two consumers need different surfaces, for example user-facing message plus developer detail, one `.message` string is the wrong transport.

## Recommended Rule

Keep the current high-level policy unless a concrete server-side catcher or custom client error transport is added.

Rule:

1. Use `Cause.squash(exit.cause)` only to detect control-flow values that must be thrown as-is.
2. For all other failures, treat `Cause.prettyErrors(exit.cause)` as the diagnostic source of truth.
3. Throw a fresh `Error(message)` for Start compatibility.
4. Do not special-case `Error` subclasses unless there is a known catch site before TanStack serialization that depends on subclass identity or custom properties.

If we later need structured details, the better design is not throwing the original subclass. It is a deliberate transport shape, for example `{ message, detail, code }`, plus verified TanStack serialization/error-boundary support. Without that, preserving extra properties in `runEffect` gives a false sense of fidelity because Start's `ShallowErrorPlugin` still drops them.

## Possible Follow-Up Tests

1. `Effect.fail("plain failure")` produces an `Error` whose message contains `plain failure`.
2. `Effect.fail({ message: "object failure", code: "X" })` produces an `Error` whose message contains `object failure`.
3. `Effect.fail({ code: "X" })` produces an `Error` whose message contains JSON-formatted object detail.
4. `Effect.die("plain defect")` produces an `Error` whose message contains `plain defect`.
5. `Effect.fail(new CustomError(...))` preserves the custom error's name/message in the final message, but does not preserve custom properties on the thrown value.
6. `Effect.fail(new Response(...))`, redirect, and notFound are still thrown as-is.
