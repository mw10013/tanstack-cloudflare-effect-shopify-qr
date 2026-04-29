# QR Form Validation Research

## Question

`src/routes/app.qrcodes.$id.tsx` currently decodes the submitted QR payload, then runs a second ad hoc validator:

```ts
const input = yield* Schema.decodeUnknownEffect(Domain.QrCodeUpsert)({
  title: data.title,
  productId: data.productId,
  productVariantId: data.productVariantId,
  destination: data.destination,
});
const errors = service.validate(input);
if (Object.keys(errors).length > 0) return { ok: false, errors } as const;
```

This is suspicious because `QrFormInput` already rejects empty form fields before handler execution:

```ts
const QrFormInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  productId: Schema.NonEmptyString,
  productVariantId: Schema.NonEmptyString,
  destination: Domain.QrCodeDestination,
});

const saveQrCode = createServerFn({ method: "POST" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator(Schema.toStandardSchemaV1(QrFormInput))
```

Then the form also uses that same schema on submit:

```ts
const form = useForm({
  defaultValues,
  validators: { onSubmit: Schema.toStandardSchemaV1(QrFormInput) },
  onSubmit: ({ value }) => {
    saveMutation.mutate(value);
  },
});
```

## `refs/tces` Pattern

`refs/tces` generally makes the Effect schema the form contract and reuses it in two places.

Client-side submit validation:

```ts
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

Server fn input validation:

```ts
export const invite = createServerFn({ method: "POST" })
  .inputValidator(Schema.toStandardSchemaV1(inviteSchema))
  .handler(
    ({ data: { organizationId, emails, role }, context: { runEffect } }) =>
      runEffect(
        Effect.gen(function* () {
```

Source: `refs/tces/src/routes/app.$organizationId.invitations.tsx`.

The schema carries real validation and transformations, not a second service-level validator:

```ts
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
```

Other `tces` examples match the same shape:

```ts
const banUserSchema = Schema.Struct({
  userId: Domain.User.fields.id,
  banReason: Schema.String.check(Schema.isMaxLength(100)),
});

export const banUser = createServerFn({ method: "POST" })
  .inputValidator(Schema.toStandardSchemaV1(banUserSchema))
```

```ts
const form = useForm({
  defaultValues,
  validators: {
    onSubmit: Schema.toStandardSchemaV1(banUserSchema),
  },
  onSubmit: ({ value }) => {
    if (userId) banUserMutation.mutate(value);
  },
});
```

Source: `refs/tces/src/routes/admin.users.tsx`.

## Error Display Pattern

Form validation errors are field metadata, not a custom `{ ok: false, errors }` payload:

```tsx
<form.Field name="email">
  {(field) => {
    const isInvalid = field.state.meta.errors.length > 0;
    return (
      <Field data-invalid={isInvalid}>
        <FieldLabel htmlFor={field.name}>Email</FieldLabel>
        <Input
          id={field.name}
          name={field.name}
          type="email"
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          aria-invalid={isInvalid}
          disabled={!isHydrated}
        />
        {isInvalid && (
          <FieldError errors={field.state.meta.errors} />
        )}
      </Field>
    );
  }}
</form.Field>
```

Source: `refs/tces/src/routes/login.tsx`.

`FieldError` accepts Standard Schema/TanStack Form style errors with optional `message`, deduplicates them, and renders one message or a list:

```ts
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
```

Source: `refs/tces/src/components/ui/field.tsx`.

Mutation/server failures are global/exceptions, not field validation maps:

```tsx
{inviteMutation.error && (
  <Alert variant="destructive">
    <AlertCircle className="size-4" />
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>
      {inviteMutation.error.message}
    </AlertDescription>
  </Alert>
)}
```

Source: `refs/tces/src/routes/app.$organizationId.invitations.tsx`.

## Implication For QR Route

`QrService.validate` duplicates a weaker version of the schema:

```ts
const validate = (input: Partial<Domain.QrCodeUpsert>): QrValidationErrors => ({
  ...(input.title ? {} : { title: "Title is required" }),
  ...(input.productId ? {} : { productId: "Product is required" }),
  ...(input.productVariantId ? {} : { productVariantId: "Product variant is required" }),
  ...(input.destination ? {} : { destination: "Destination is required" }),
});
```

Source: `src/lib/QrService.ts`.

Given the current route, `service.validate(input)` should be unreachable for the listed missing-field cases because:

1. `saveQrCode.inputValidator(Schema.toStandardSchemaV1(QrFormInput))` rejects invalid submitted data before the handler.
2. `Domain.QrCodeUpsert` decode brands `productId` and `productVariantId` as non-empty strings.
3. The client form uses the same `QrFormInput` as `validators.onSubmit`.

The `Object.keys(errors).length > 0` check is a symptom of the ad hoc map shape. `tces` avoids that by encoding validation constraints in schemas and letting TanStack Form own field-level error state.

## Recommendation

Prefer removing `QrService.validate`, `QrValidationErrors`, `serverErrors`, `productError`, and the `{ ok: false, errors }` save result branch.

Move any still-needed business validation into schemas, for example:

```ts
export const QrCodeUpsert = Schema.Struct({
  title: Schema.NonEmptyString,
  productId: ProductId,
  productVariantId: VariantId,
  destination: QrCodeDestination,
});
```

Then make `QrFormInput` reuse domain fields instead of defining parallel constraints:

```ts
const QrFormInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  title: Domain.QrCodeUpsert.fields.title,
  productId: Domain.QrCodeUpsert.fields.productId,
  productVariantId: Domain.QrCodeUpsert.fields.productVariantId,
  destination: Domain.QrCodeUpsert.fields.destination,
});
```

Keep mutation errors for real server failures, like missing Shopify product data, authorization, repository failures, or GraphQL failures. Field-level required/type validation should stay in Standard Schema/TanStack Form.
