# QR Form Validation Research

## Question

At `src/routes/app.qrcodes.$id.tsx:105`, are we validating submit data twice?

Current server fn:

```ts
const saveQrCode = createServerFn({ method: "POST" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator(Schema.toStandardSchemaV1(QrFormInput))
  .handler(({ data, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const repository = yield* QrRepository;
        const service = yield* QrService;
        const input = yield* Schema.decodeUnknownEffect(Domain.QrCodeUpsert)({
          title: data.title,
          productId: data.productId,
          productVariantId: data.productVariantId,
          destination: data.destination,
        });
```

`QrFormInput` is effectively `routeId + QrCodeUpsert`:

```ts
const QrFormInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  title: Domain.QrCodeUpsert.fields.title,
  productId: Domain.QrCodeUpsert.fields.productId,
  productVariantId: Domain.QrCodeUpsert.fields.productVariantId,
  destination: Domain.QrCodeUpsert.fields.destination,
});
```

Domain schema:

```ts
export const QrCodeUpsert = Schema.Struct({
  title: Schema.NonEmptyString,
  productId: ProductId,
  productVariantId: VariantId,
  destination: QrCodeDestination,
});
```

Source: `src/lib/Domain.ts:70`.

## TanStack Start Behavior

TanStack Start executes `inputValidator` on the server before the server fn handler runs.

Source: `refs/tan-start/packages/start-client-core/src/createServerFn.ts:231`:

```ts
if (
  'inputValidator' in nextMiddleware.options &&
  nextMiddleware.options.inputValidator &&
  env === 'server'
) {
  ctx.data = await execValidator(
    nextMiddleware.options.inputValidator,
    ctx.data,
  )
}
```

For Standard Schema validators, Start returns the parsed value as handler data.

Source: `refs/tan-start/packages/start-client-core/src/createServerFn.ts:749`:

```ts
export async function execValidator(
  validator: AnyValidator,
  input: unknown,
): Promise<unknown> {
  if (validator == null) return {}

  if ('~standard' in validator) {
    const result = await validator['~standard'].validate(input)

    if (result.issues)
      throw new Error(JSON.stringify(result.issues, undefined, 2))

    return result.value
  }
```

The local TanStack Start skill docs show the same contract.

Source: `refs/tan-start/packages/start-client-core/skills/start-core/server-functions/SKILL.md:94`:

```ts
const greetUser = createServerFn({ method: 'GET' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    return `Hello, ${data.name}!`
  })
```

Conclusion: yes, handler `data` is already parsed and validated by `Schema.toStandardSchemaV1(QrFormInput)`. Re-decoding the overlapping fields with `Domain.QrCodeUpsert` is duplicate validation, not a safety requirement.

## TCES Pattern

`refs/tces` generally has one schema per boundary contract and reuses it directly in `inputValidator`, route search validation, or TanStack Form.

Example server fn input only, no second decode in handler:

Source: `refs/tces/src/routes/app.$organizationId.invitations.tsx:160`:

```ts
export const invite = createServerFn({ method: "POST" })
  .inputValidator(Schema.toStandardSchemaV1(inviteSchema))
  .handler(
    ({ data: { organizationId, emails, role }, context: { runEffect } }) =>
      runEffect(
        Effect.gen(function* () {
```

Same schema reused by the form:

Source: `refs/tces/src/routes/app.$organizationId.invitations.tsx:219`:

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

When the form shape differs from the domain/update input, TCES derives a form schema from the domain schema rather than manually repeating constraints.

Source: `refs/tces/src/routes/app.$organizationId.invoices.$invoiceId.tsx:37`:

```ts
const UpdateInvoiceFields = UpdateInvoiceInput.mapFields(Struct.omit(["invoiceId"]));
const InvoiceFormSchema = Schema.Struct({
  ...UpdateInvoiceFields.fields,
  invoiceItems: Schema.mutable(UpdateInvoiceFields.fields.invoiceItems),
});
const invoiceFormStandardSchema = Schema.toStandardSchemaV1(InvoiceFormSchema);
```

The form then submits values already validated against `InvoiceFormSchema`:

```ts
const form = useForm({
  defaultValues,
  validators: {
    onSubmit: invoiceFormStandardSchema,
  },
  onSubmit: ({ value }) => {
    void saveMutation.mutateAsync(value);
  },
});
```

Source: `refs/tces/src/routes/app.$organizationId.invoices.$invoiceId.tsx:92`.

TCES does still validate at each trust boundary. Example: form validation and server fn validation may use the same schema because client validation is UX and server fn validation is security. But it does not usually validate again inside the handler with the same schema after `inputValidator` has parsed the data.

## Assessment For This Route

There are two legitimate validation boundaries:

1. Client form `validators.onSubmit`: UX, immediate field errors, not trusted.
2. Server fn `.inputValidator(...)`: trusted boundary, rejects/parses data before handler.

The awkward part is the third validation:

```ts
const input = yield* Schema.decodeUnknownEffect(Domain.QrCodeUpsert)({
  title: data.title,
  productId: data.productId,
  productVariantId: data.productVariantId,
  destination: data.destination,
});
```

Because `QrFormInput` already uses the exact `Domain.QrCodeUpsert.fields.*` schemas for those four fields, this is redundant. The handler can build the repository input from already validated `data` without decoding again.

## Recommendation

Keep one boundary schema for the server fn:

```ts
const QrFormInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  ...Domain.QrCodeUpsert.fields,
});
```

Then in the handler, avoid re-decoding the same fields:

```ts
const input = {
  title: data.title,
  productId: data.productId,
  productVariantId: data.productVariantId,
  destination: data.destination,
} satisfies Domain.QrCodeUpsert;
```

Keep decoding `data.routeId` as `Domain.QrCodeHandle` for the existing-record path because `routeId` has a different contract from QR upsert data: it may be the sentinel `"new"` before save, and otherwise must be a persisted QR handle.

Net: client validation plus server `inputValidator` is correct. Server `inputValidator` plus handler-level `Domain.QrCodeUpsert` decode is redundant in the current code.
