# QR Code Form And Routes Research

## Scope

Focus: next port step after QR models are complete in `src/lib/Domain.ts`, `src/lib/QrRepository.ts`, and `src/lib/QrService.ts`.

Includes:

- QR code create/edit form route
- QR code list/app home route
- public QR scan route
- TanStack Form usage pattern from `refs/tces`
- Shopify App Bridge resource picker and save bar integration

Excludes:

- metaobject model implementation already covered by `docs/qr-code-models-research.md`
- Shopify app config/scopes unless needed by UI behavior
- generated route tree edits

Primary references:

- `docs/qr-code-tutorial.md`
- `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx`
- `refs/shopify-app-qr/app/routes/app._index.jsx`
- `refs/tces/src/routes/login.tsx`
- `refs/tces/src/routes/app.$organizationId.invoices.$invoiceId.tsx`
- `src/routes/app.tsx`
- `src/routes/app.index.tsx`
- `src/lib/Domain.ts`
- `src/lib/QrRepository.ts`
- `src/lib/QrService.ts`

## Current State

The QR model split is already present.

`src/lib/Domain.ts` owns the QR domain structure:

```ts
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
```

`src/lib/QrRepository.ts` owns metaobject CRUD:

```ts
return { findByHandle, list, save, deleteById, incrementScans };
```

`src/lib/QrService.ts` owns workflow/domain behavior:

```ts
return { validate, generateHandle, getScanUrl, getQrCodeImage, getDestinationUrl, recordScanAndGetDestination };
```

The remaining work should not recreate the tutorial's `QRCode.server.js`. Routes should call `QrRepository` and `QrService` through server functions and the existing Shopify server function middleware.

## Route Mapping

The tutorial's React Router routes map to TanStack file routes like this:

| Tutorial route | This project route file | Route path |
| --- | --- | --- |
| `app/routes/app.qrcodes.$id.jsx` | `src/routes/app.qrcodes.$id.tsx` | `/app/qrcodes/$id` |
| `app/routes/app._index.jsx` | `src/routes/app.index.tsx` | `/app/` |
| public scan route from model URL `/qrcodes/$id/scan` | `src/routes/qrcodes.$id.scan.ts` or `.tsx` | `/qrcodes/$id/scan` |

TanStack file routes in this app already use `createFileRoute`, for example `src/routes/app.index.tsx`:

```ts
export const Route = createFileRoute("/app/")({
  component: AppIndex,
});
```

Authenticated app routes are guarded by `src/routes/app.tsx` `beforeLoad`:

```ts
export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    return authenticateAppRoute({
      data: {
        searchStr: location.searchStr,
        pathname: location.pathname,
      },
    });
  },
  component: AppLayout,
});
```

So `/app/qrcodes/$id` and `/app/` can rely on `/app` context for auth/session data. The public scan route must not sit under `/app` because customers scanning QR codes are not embedded/admin users.

## Server Function Shape

Current project server mutations use `createServerFn` plus `shopifyServerFnMiddleware`, as seen in `src/routes/app.index.tsx`:

```ts
const generateProduct = createServerFn({ method: "POST" })
  .middleware([shopifyServerFnMiddleware])
  .handler(({ context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const products = yield* ProductRepository;
```

Use the same pattern for QR functions:

- `listQrCodes`: GET, returns `QrRepository.list()` plus derived image/URLs if needed.
- `getQrFormData`: GET, input `{ id }`, returns default form data for `new` or existing QR with `image`, `scanUrl`, `destinationUrl`.
- `saveQrCode`: POST, input form values and route id, validates with `QrService.validate`, generates handle for `new`, saves with `QrRepository.save`.
- `deleteQrCode`: POST, input `{ id }`, deletes by metaobject id with `QrRepository.deleteById`.
- `scanQrCode`: GET or route loader/server function for public route, calls `QrService.recordScanAndGetDestination` and redirects.

The existing `QrService.validate` is synchronous and returns field errors:

```ts
const validate = (input: Partial<Domain.QrCodeUpsert>): QrValidationErrors => ({
  ...(input.title ? {} : { title: "Title is required" }),
  ...(input.productId ? {} : { productId: "Product is required" }),
  ...(input.productVariantId ? {} : { productVariantId: "Product variant is required" }),
  ...(input.destination ? {} : { destination: "Destination is required" }),
});
```

Recommended route behavior: return field errors from the server function for save failures instead of throwing for validation. Throw or fail only for infrastructure/API errors.

## Form Route Data Shape

The tutorial loader returns minimal defaults for `new` and full QR data for edit in `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:19-35`:

```js
if (params.id === "new") {
  return {
    destination: "product",
    title: "",
    shop: session.shop,
  };
}

const qrCode = await getQRCode(params.id, admin.graphql, session.shop);
return { ...qrCode, shop: session.shop };
```

For this app, return a single client form state shape so `new` and edit paths render with the same component:

```ts
interface QrCodeFormState {
  readonly id: string | null;
  readonly handle: string | null;
  readonly title: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly productTitle: string | null;
  readonly productImage: string | null;
  readonly productAlt: string | null;
  readonly destination: "product" | "cart";
  readonly image: string | null;
  readonly scanUrl: string | null;
  readonly destinationUrl: string | null;
  readonly shop: string;
}
```

For `new`, use:

```ts
{
  id: null,
  handle: null,
  title: "",
  productId: "",
  productVariantId: "",
  productTitle: null,
  productImage: null,
  productAlt: null,
  destination: "product",
  image: null,
  scanUrl: null,
  destinationUrl: null,
  shop,
}
```

For edit, derive:

- `image` from `QrService.getQrCodeImage(qr.handle, shop)`
- `scanUrl` from `QrService.getScanUrl(qr.handle, shop)`
- `destinationUrl` from `QrService.getDestinationUrl(qr, shop)`, null if product/variant unavailable

## TanStack Form Pattern

`refs/tces` uses direct `useForm` with `defaultValues`, `validators.onSubmit`, and `onSubmit`. Example from `refs/tces/src/routes/login.tsx:55-64`:

```ts
const form = useForm({
  defaultValues,
  validators: {
    onSubmit: Schema.toStandardSchemaV1(LoginInput),
  },
  onSubmit: ({ value }) => {
    void loginMutation.mutateAsync(value);
  },
});
```

Field binding uses `form.Field`, `field.state.value`, `field.handleBlur`, and `field.handleChange`, from `refs/tces/src/routes/login.tsx:118-134`:

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
```

For QR form, use TanStack Form for persisted fields only:

- `title`
- `productId`
- `productVariantId`
- `destination`

Keep display-only product fields in local state or include them in form default values but do not send them to `QrRepository.save`:

- `productTitle`
- `productImage`
- `productAlt`

Recommended first pass: keep validation server-owned. `refs/tces` often duplicates the same Effect Schema at both boundaries, for example `refs/tces/src/routes/app.$organizationId.invitations.tsx:160-162` validates the server function input:

```ts
export const invite = createServerFn({ method: "POST" })
  .inputValidator(Schema.toStandardSchemaV1(inviteSchema))
```

and `refs/tces/src/routes/app.$organizationId.invitations.tsx:219-224` reuses the same schema in TanStack Form:

```ts
const form = useForm({
  defaultValues,
  validators: {
    onSubmit: Schema.toStandardSchemaV1(inviteSchema),
  },
```

For QR tutorial parity, server validation can suffice initially. Use TanStack Form for field state and submit orchestration, omit `validators.onSubmit` for now, and display field errors returned by `saveQrCode`. Add client-side schema reuse later if UX needs immediate validation.

Recommended client form skeleton:

```ts
const form = useForm({
  defaultValues: {
    title: loaderData.title,
    productId: loaderData.productId,
    productVariantId: loaderData.productVariantId,
    destination: loaderData.destination,
  },
  onSubmit: ({ value }) => {
    void saveMutation.mutateAsync({ id: routeId, ...value });
  },
});
```

`Domain.QrCodeUpsert` uses branded `ProductId` and `VariantId`, which are awkward for browser form input. Prefer a route-local unbranded client schema, then decode into `Domain.QrCodeUpsert` on the server function before saving.

## Dirty State And Save Bar

The tutorial uses a separate `initialFormState`, `formState`, JSON dirty check, and `ui-save-bar` in `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:72-80` and `151-180`:

```js
const [initialFormState, setInitialFormState] = useState(qrCode);
const [formState, setFormState] = useState(qrCode);
const isDirty =
  JSON.stringify(formState) !== JSON.stringify(initialFormState);
```

```jsx
<ui-save-bar ref={saveBarRef} id="qr-code-form">
  <button variant="primary" onClick={handleSave}></button>
  <button onClick={handleReset}></button>
</ui-save-bar>
```

TanStack Form already tracks dirty-ish state. Use `form.Subscribe` for submit enablement like `refs/tces/src/routes/app.$organizationId.invoices.$invoiceId.tsx:128-144`:

```tsx
<form.Subscribe selector={(state) => state.canSubmit}>
  {(canSubmit) => (
    <Button
      type="button"
      disabled={!isHydrated || !canEdit || !canSubmit || saveMutation.isPending}
      onClick={() => void form.handleSubmit()}
    >
```

For Shopify `ui-save-bar`, subscribe to form state values and compare against `loaderData` persisted values. This is more explicit than depending on exact TanStack dirty semantics:

```ts
const isDirty = JSON.stringify(form.state.values) !== JSON.stringify(defaultValues);
```

When save succeeds, navigate to `/app/qrcodes/$handle`. The route reload gives new defaults, image, and clean state.

## Product Picker

The reference uses App Bridge `resourcePicker` in `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:82-112`:

```js
const products = await window.shopify.resourcePicker({
  type: "product",
  action: "select",
  filter: { variants: true },
  selectionIds: formState.productId
    ? [
        {
          id: formState.productId,
          variants: formState.productVariantId
            ? [{ id: formState.productVariantId }]
            : [],
        },
      ]
    : [],
});
```

After selection, it stores product and first variant IDs:

```js
const { images, id, variants, title } = products[0];

setFormState({
  ...formState,
  productId: id,
  productVariantId: variants[0].id,
  productTitle: title,
  productAlt: images[0]?.altText,
  productImage: images[0]?.originalSrc,
});
```

Use the same interaction, but update TanStack Form fields for IDs:

```ts
form.setFieldValue("productId", product.id);
form.setFieldValue("productVariantId", product.variants[0]?.id ?? "");
setSelectedProduct({
  title: product.title,
  image: product.images[0]?.originalSrc ?? null,
  alt: product.images[0]?.altText ?? null,
});
```

Guard on hydration before calling `window.shopify` or App Bridge APIs. `src/routes/app.index.tsx` already uses `useHydrated()` before rendering buttons that need client APIs:

```tsx
{hydrated && (
  <s-button slot="primary-action" variant="primary" onClick={generate}>
```

## Form Layout

Use Polaris web components, preserving current project visual language from `src/routes/app.index.tsx`.

The reference form layout has:

- `<s-page heading={initialFormState.title || "Create QR code"}>`
- breadcrumb to `/app`
- delete secondary action when editing
- main `<s-section heading="QR Code information">`
- title text field
- destination select
- product selector block
- aside preview section

The tutorial explicitly says the page should use two columns with `slot="aside"` in `docs/qr-code-tutorial.md:975-983`:

```md
Using web components, build the layout for the form. Use the page, section, and box components with `slot="aside"` to structure the page. The page should have two columns.
```

Use `<s-box slot="aside">` or `<s-section slot="aside">` as in the reference preview at `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:323-375`.

## List Route

The tutorial list route loads QR codes and renders either an empty state or table. The reference loader in `docs/qr-code-tutorial.md:1440-1447`:

```js
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const qrCodes = await getQRCodes(admin.graphql, session.shop);

  return {
    qrCodes,
  };
}
```

For this app, keep the current generated-product demo available and add QR listing without deleting the demo. Options, in increasing churn:

- Add QR list above the existing demo sections on `/app/`.
- Move product generation into an aside or lower section on `/app/`.
- Move product generation to `/app/additional` later if the app home becomes crowded.

Recommended first pass: add QR list as the primary content on `/app/`, keep product generation below it as a dev/demo section.

The QR list needs:

- server function or route loader calling `QrRepository.list()`
- empty state with create button linking to `/app/qrcodes/new`
- table with title, product, created date, scans
- app nav label changed from `Home` if desired, but keep minimal

Reference table row behavior in `docs/qr-code-tutorial.md:1504-1540`:

```jsx
<s-table-row id={qrCode.handle}>
  <s-table-cell>
    <s-stack direction="inline" gap="small" alignItems="center">
      <s-clickable
        href={`/app/qrcodes/${qrCode.handle}`}
```

Keep a local `truncate` helper. The tutorial's helper uses an ellipsis in `docs/qr-code-tutorial.md:1480-1484`; this repo prefers ASCII unless justified, so use `...` instead of `…` unless preserving tutorial text exactly.

## Save And Delete Flow

The reference action in `refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:38-66` does three things:

```js
if (data.action === "delete") {
  await deleteQRCode(data.metaobjectId, admin.graphql);
  return redirect("/app");
}

const errors = validateQRCode(data);

if (errors) {
  return new Response(JSON.stringify({ errors }), {
    status: 422,
```

```js
const handle =
  params.id === "new" ? generateHandle(data.title) : params.id;

const metaobject = await saveQRCode(handle, data, admin.graphql);

return redirect(`/app/qrcodes/${metaobject.handle}`);
```

TanStack Start equivalent:

- separate `saveQrCode` and `deleteQrCode` server functions is simpler than an action discriminator
- `saveQrCode` returns `{ ok: false, errors }` for validation or `{ ok: true, handle }` for success
- client calls `navigate({ to: "/app/qrcodes/$id", params: { id: handle } })` on success
- `deleteQrCode` returns ok and client navigates to `/app/`

Use route params, not hidden fields, for handles. Use metaobject `id` from loaded form data for delete because `QrRepository.deleteById` requires `Domain.QrCodeId`.

For product/variant behavior, stick to the tutorial first: App Bridge product picker with `filter: { variants: true }`, then save the first selected variant. Do not add variant-selection UI in this pass.

## Public Scan Route

The service already builds scan URLs:

```ts
const getScanUrl = Effect.fn("QrService.getScanUrl")((handle: Domain.QrCodeHandle, shop: Domain.Shop) => {
  const url = new URL(`/qrcodes/${handle}/scan`, appUrl);
  url.searchParams.set("shop", shop);
  return Effect.succeed(url.href);
});
```

Add public route `src/routes/qrcodes.$id.scan.ts` for `/qrcodes/$id/scan`.

Expected behavior:

1. Read `$id` route param and `shop` search param.
2. Decode `id` as `Domain.QrCodeHandle` and `shop` as `Domain.Shop`.
3. Call `QrService.recordScanAndGetDestination(handle, shop)`.
4. If none, return 404 or redirect to a safe app/public error page.
5. If destination exists, throw TanStack `redirect({ href: destination })` or return a redirect response consistent with TanStack Start route loaders.

`recordScanAndGetDestination` composes the correct backend workflow:

```ts
const qrCode = yield* repository.findByHandle(handle);
if (Option.isNone(qrCode)) return Option.none();
yield* repository.incrementScans(qrCode.value.id, qrCode.value.scans);
return yield* getDestinationUrl(qrCode.value, shop).pipe(Effect.map(Option.some));
```

This route is not an embedded app route. It should not use `/app` auth or App Bridge.

## Typing Notes

`src/routes/app.tsx` currently includes JSX augmentation for `s-app-nav` only:

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
```

The QR form uses `ui-save-bar`, which is an App Bridge element, not covered by Polaris types. Add a local React JSX augmentation where the form route needs it, or centralize App Bridge element typings if more App Bridge web components are added.

Avoid adding comments around the augmentation unless explicitly needed. Existing comments in `src/routes/app.tsx` are historical context, but project instructions say not to generate comments unless asked.

## Implementation Checklist

1. Add unbranded client schema/types for QR form values.
2. Add `src/routes/app.qrcodes.$id.tsx` with loader/server function, TanStack Form, product picker, save bar, preview, save/delete mutations.
3. Replace `src/routes/app.index.tsx` generated-product demo with QR list route using `QrRepository.list()`.
4. Add `src/routes/qrcodes.$id.scan.ts` public scan redirect route using `QrService.recordScanAndGetDestination`.
5. Update `/app` nav links in `src/routes/app.tsx` from template labels to QR-focused labels if desired.
6. Run `pnpm typecheck` and `pnpm lint`.
7. Run `pnpm graphql-codegen` only if any `#graphql` literals are changed.

## Decisions

- Validation: server validation suffices for first pass. `refs/tces` duplicates schemas client/server, but QR can defer client validation until needed.
- Product generation: keep it around. QR list becomes primary `/app/` content, product generation stays as a demo/dev section.
- Variant selection: stick to the tutorial first. Use App Bridge product picker and save the first selected variant.
