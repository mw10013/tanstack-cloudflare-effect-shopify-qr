# TCES FieldError Research

## Source

`FieldError` lives in `refs/tces/src/components/ui/field.tsx`:

```tsx
function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}
```

## Purpose

`FieldError` is a small display component for field-level validation messages.

It accepts normal `<div>` props plus an optional `errors` array shaped like TanStack Form / Standard Schema validation issues:

```ts
errors?: Array<{ message?: string } | undefined>
```

The component renders nothing when there is no displayable error content. When there is content, it renders a destructive-text `<div role="alert">`.

## Render Priority

`children` wins over `errors`:

```tsx
if (children) {
  return children
}
```

This allows callers to override the default error rendering:

```tsx
<FieldError>Custom validation message</FieldError>
```

If no `children` are passed, it falls back to `errors`:

```tsx
if (!errors?.length) {
  return null
}
```

No `errors`, empty `errors`, or missing `children` means `content` becomes `null`, then the component returns `null`:

```tsx
if (!content) {
  return null
}
```

## Deduplication

Errors are deduplicated by `message`:

```tsx
const uniqueErrors = [
  ...new Map(errors.map((error) => [error?.message, error])).values(),
]
```

This uses a `Map` where the key is `error?.message`. Duplicate messages overwrite earlier entries, so only one error per message remains.

Example:

```ts
[
  { message: "Required" },
  { message: "Required" },
  { message: "Must be a URL" },
]
```

becomes:

```ts
[
  { message: "Required" },
  { message: "Must be a URL" },
]
```

Important edge case: `undefined` errors and errors without `message` share the same `undefined` key.

The key expression is:

```ts
error?.message
```

That means these both produce the same key value, `undefined`:

```ts
const missingError = undefined
missingError?.message
// undefined

const errorWithoutMessage = {}
errorWithoutMessage?.message
// undefined
```

So this input:

```ts
const errors = [
  undefined,
  {},
  { message: undefined },
  { message: "Required" },
]
```

becomes these map entries conceptually:

```ts
new Map([
  [undefined, undefined],
  [undefined, {}],
  [undefined, { message: undefined }],
  ["Required", { message: "Required" }],
])
```

`Map` only keeps one value per key. Later entries with the same key overwrite earlier entries. After construction, the map is effectively:

```ts
new Map([
  [undefined, { message: undefined }],
  ["Required", { message: "Required" }],
])
```

Then `.values()` produces:

```ts
const uniqueErrors = [
  { message: undefined },
  { message: "Required" },
]
```

If there are multiple unique entries, list rendering uses this condition:

```tsx
error?.message && <li key={index}>{error.message}</li>
```

For `{ message: undefined }`, `error?.message` is `undefined`, which is falsy. React receives no `<li>` for that entry. For `{ message: "Required" }`, the condition is truthy, so it renders:

```tsx
<li>Required</li>
```

So missing-message errors can remain inside `uniqueErrors`, but they do not render a list item.

There is one awkward case. If the only unique error has no message:

```ts
const errors = [undefined, {}, { message: undefined }]
```

then `uniqueErrors` becomes:

```ts
[{ message: undefined }]
```

The single-error branch returns:

```ts
uniqueErrors[0]?.message
// undefined
```

So `content` is `undefined`, and the outer guard renders nothing:

```tsx
if (!content) {
  return null
}
```

## Single Vs Multiple Errors

One unique error returns the message directly:

```tsx
if (uniqueErrors?.length == 1) {
  return uniqueErrors[0]?.message
}
```

Multiple unique errors render as a bullet list:

```tsx
return (
  <ul className="ml-4 flex list-disc flex-col gap-1">
    {uniqueErrors.map(
      (error, index) =>
        error?.message && <li key={index}>{error.message}</li>
    )}
  </ul>
)
```

So the component chooses compact text for one error and scannable list formatting for many errors.

## Accessibility And Styling

The wrapper uses `role="alert"`:

```tsx
<div
  role="alert"
  data-slot="field-error"
  className={cn("text-sm font-normal text-destructive", className)}
  {...props}
>
```

`role="alert"` tells assistive technology that the content is important and should be announced when it appears.

`data-slot="field-error"` identifies the element for component-slot styling and selectors.

`cn("text-sm font-normal text-destructive", className)` applies the default error appearance while allowing callers to add or override classes.

`...props` forwards remaining `<div>` props, so callers can pass IDs, ARIA attributes, test attributes, etc.

## Why `useMemo`

The error content is computed inside `useMemo` with dependencies on `children` and `errors`:

```tsx
const content = useMemo(() => {
  ...
}, [children, errors])
```

This avoids rebuilding the deduped error list unless either `children` or the `errors` array reference changes. The work is small, so this is mostly consistency/defensiveness rather than a critical performance optimization.

## Typical Usage

In `refs/tces`, it is used with TanStack Form field metadata:

```tsx
{isInvalid && (
  <FieldError errors={field.state.meta.errors} />
)}
```

Source: `refs/tces/src/routes/login.tsx`.

This keeps field validation display local to the field. The form decides whether the field is invalid, and `FieldError` decides how to render the messages.

## Call Site Error Shape

Every `FieldError` call site in `refs/tces/src` passes TanStack Form field metadata directly:

```tsx
<FieldError errors={field.state.meta.errors} />
```

The call sites are:

| File | Field(s) |
| --- | --- |
| `refs/tces/src/routes/login.tsx` | `email` |
| `refs/tces/src/routes/app.$organizationId.invitations.tsx` | `emails`, `role` |
| `refs/tces/src/routes/admin.users.tsx` | `banReason` |

These forms use Effect Schema through the Standard Schema adapter:

```tsx
const form = useForm({
  defaultValues,
  validators: {
    onSubmit: Schema.toStandardSchemaV1(LoginInput),
  },
  onSubmit: ({ value }) => {
    console.log(`onSubmit: value: ${JSON.stringify(value)}`);
    void loginMutation.mutateAsync(value);
  },
});
```

Source: `refs/tces/src/routes/login.tsx`.

Another example:

```tsx
const inviteSchema = Schema.Struct({
  organizationId: Domain.Organization.fields.id,
  emails: Schema.String.pipe(
    Schema.decodeTo(
      Schema.Array(Schema.String.check(Schema.isPattern(emailPattern)))
        .check(Schema.isMinLength(1))
        .check(Schema.isMaxLength(10)),
      SchemaTransformation.transform({
        decode: (value): readonly string[] => splitEmails(value),
        encode: (emails: readonly string[]) => emails.join(", "),
      }),
    ),
  ),
  role: Schema.Literals(Domain.AssignableMemberRoleValues),
});

const form = useForm({
  defaultValues,
  validators: {
    onSubmit: Schema.toStandardSchemaV1(inviteSchema),
  },
  onSubmit: ({ value }) => {
    inviteMutation.mutate(value);
  },
});
```

Source: `refs/tces/src/routes/app.$organizationId.invitations.tsx`.

Effect's Standard Schema adapter returns Standard Schema issues. The implementation shows invalid results are formatted by `makeFormatterStandardSchemaV1`:

```ts
const parseOptions: AST.ParseOptions = { errors: "all", ...options?.parseOptions }
const formatter = Issue.makeFormatterStandardSchemaV1(options)
const validate: StandardSchemaV1<S["Encoded"], S["Type"]>["~standard"]["validate"] = (value: unknown) => {
  const scheduler = new Scheduler.MixedScheduler()
  const fiber = Effect.runFork(
    Effect.match(decodeUnknownEffect(value, parseOptions), {
      onFailure: formatter,
      onSuccess: (value): StandardSchemaV1.Result<S["Type"]> => ({ value })
    }),
    { scheduler }
  )
```

Source: `refs/effect4/packages/effect/src/Schema.ts`.

The formatter documents and types each issue as having a required `message: string`:

```ts
// A subtype of StandardSchemaV1.Issue
type DefaultIssue = {
  readonly message: string
  readonly path: ReadonlyArray<PropertyKey>
}
```

and returns:

```ts
export function makeFormatterStandardSchemaV1(options?: {
  readonly leafHook?: LeafHook | undefined
  readonly checkHook?: CheckHook | undefined
}): Formatter<StandardSchemaV1.FailureResult> {
  return (issue) => ({
    issues: toDefaultIssues(issue, [], options?.leafHook ?? defaultLeafHook, options?.checkHook ?? defaultCheckHook)
  })
}
```

Source: `refs/effect4/packages/effect/src/SchemaIssue.ts`.

Effect's tests also assert the runtime shape as objects with `message` and `path`:

```ts
expectSyncFailure(standardSchema, { tags: ["a", ""] }, [{
  message: `Expected a value with a length of at least 1, got ""`,
  path: ["tags", 1]
}, {
  message: `Expected a value with a length of at least 3, got ["a",""]`,
  path: ["tags"]
}])
```

Source: `refs/effect4/packages/effect/test/schema/toStandardSchemaV1.test.ts`.

So for the actual `refs/tces` form-validation path, `field.state.meta.errors` should be a list of issue-like values with a real `message: string`. The `undefined` and missing-message edge cases are not expected from `Schema.toStandardSchemaV1(...)`; they are supported because `FieldError` is typed as a reusable UI component accepting a looser shape:

```ts
errors?: Array<{ message?: string } | undefined>
```

That loose prop type allows callers other than Effect/TanStack Form to pass partial errors, `undefined` entries, or custom arrays without crashing the component.

## Is Deduping Needed For TCES Forms?

Deduping is probably not needed to guard against missing messages in the Effect Schema path. Effect's Standard Schema formatter emits `message: string`.

Deduping can still be useful for display quality. Effect uses `errors: "all"` by default:

```ts
const parseOptions: AST.ParseOptions = { errors: "all", ...options?.parseOptions }
```

That means one submit can produce multiple issues. Usually they are distinct, for example array element validation plus array length validation:

```ts
[
  { message: `Expected a value with a length of at least 1, got ""`, path: ["tags", 1] },
  { message: `Expected a value with a length of at least 3, got ["a",""]`, path: ["tags"] },
]
```

But duplicate messages are still possible if several checks fail with the same custom message, or if repeated invalid values produce identical issue messages. `FieldError` dedupes only by message, not by path, because the UI displays messages only and does not show paths.

Conclusion: for current `refs/tces` call sites, the robust optional-message handling is defensive. The deduping is not required for type safety, but it remains useful to avoid repeated identical text in field-level UI.

## Behavior Summary

| Input | Output |
| --- | --- |
| `children` | Render `children` inside alert wrapper |
| no `children`, no errors | Render nothing |
| one unique error message | Render plain text message inside alert wrapper |
| multiple unique messages | Render bullet list inside alert wrapper |
| duplicate messages | Render only one instance per message |
| errors without messages | Ignored in list rendering; can produce no content |
