# QR Form State Shape Research

Question: `QrFormState` in `src/routes/app.qrcodes.$handle.tsx` looks like a long laundry list of properties. Would chunking or another shape help?

## Short Answer

- Yes, some chunking would help readability, but only if it follows the existing data boundaries.
- Best split: keep editable form input as `QrFormInput.Encoded`, then group non-editable loader data into `product`, `preview`, and `identity`.
- Avoid chunking by UI section only. The current fields are not all the same kind of state: some are persisted QR fields, some are selected-product display fields, some are derived preview URLs, and one is request/session context.
- The current flat shape is serviceable because it is local to one route, but it forces `loadQrCode` to return two large object literals with every field repeated.
- A small view-model shape would make intent clearer without adding abstractions across the app.

## Local Code

`src/routes/app.qrcodes.$handle.tsx:31-43`:

```tsx
type QrFormState = Pick<
  Domain.QrCode,
  "title" | "productTitle" | "productImage" | "productAlt" | "destination"
> & {
  readonly id: Domain.QrCode["id"] | null;
  readonly handle: Domain.QrCode["handle"] | null;
  readonly productId: typeof QrFormInput.Encoded.productId;
  readonly productVariantId: typeof QrFormInput.Encoded.productVariantId;
  readonly image: string | null;
  readonly scanUrl: string | null;
  readonly destinationUrl: string | null;
  readonly shop: Domain.Shop;
};
```

`src/routes/app.qrcodes.$handle.tsx:158-168` already manually separates two concerns:

```tsx
const defaultValues = {
  title: loaderData.title,
  productId: loaderData.productId,
  productVariantId: loaderData.productVariantId,
  destination: loaderData.destination,
} satisfies typeof QrFormInput.Encoded;
const loaderProduct = {
  title: loaderData.productTitle,
  image: loaderData.productImage,
  alt: loaderData.productAlt,
};
```

That is the strongest signal that the loader type wants explicit groups:

- `defaultValues`: editable persisted form input.
- `loaderProduct`: display-only product card metadata.
- `image`, `scanUrl`, `destinationUrl`: preview/link data generated from the saved QR code.
- `id`, `handle`, `shop`: identity/context.

## Domain Boundaries

`src/lib/Domain.ts:52-67` defines a full persisted/read QR code:

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

`src/lib/Domain.ts:70-75` defines editable upsert input:

```ts
export const QrCodeUpsert = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty({ message: "Title is required" })),
  productId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("ProductId")),
  productVariantId: Schema.String.check(Schema.isNonEmpty({ message: "Please select a product" })).pipe(Schema.brand("VariantId")),
  destination: QrCodeDestination,
});
```

So `QrFormState` is not really one domain type. It is a route view model made from:

- `Domain.QrCodeUpsert`: editable form fields.
- A subset of `Domain.QrCode`: saved identity and display fields.
- `QrService`: generated QR image, scan URL, destination URL.
- Current Shopify session: `shop`.

## Reference App

The reference QR app uses a similarly broad object, but because it has untyped React state, the boundaries are less visible.

`refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:25-34`:

```jsx
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

`refs/shopify-app-qr/app/models/QRCode.server.js:112-130` mutates extra derived fields onto the QR code object:

```js
const qrCode = {
  id: metaobject.id,
  handle: metaobject.handle,
  title: metaobject.title?.jsonValue,
  productId,
  productVariantId: variant?.id,
  productHandle: product?.handle,
  productVariantLegacyId: variant?.legacyResourceId,
  destination: metaobject.destination?.jsonValue,
  scans: metaobject.scans?.jsonValue ?? 0,
  createdAt: metaobject.updatedAt,
  productDeleted: productId && !product,
  productTitle: product?.title,
  productImage: product?.media?.nodes[0]?.preview?.image?.url,
  productAlt: product?.media?.nodes[0]?.preview?.image?.altText,
};

qrCode.destinationUrl = getDestinationUrl(qrCode, shop);
qrCode.image = await getQRCodeImage(metaobject.handle, shop);
```

This port should not copy that pattern blindly. TypeScript gives us a cheap way to make those boundaries explicit.

## Recommended Shape

Use a route-local view model like this:

```tsx
type QrFormState = {
  readonly identity: {
    readonly id: Domain.QrCode["id"] | null;
    readonly handle: Domain.QrCode["handle"] | null;
    readonly shop: Domain.Shop;
  };
  readonly form: typeof QrFormInput.Encoded;
  readonly product: {
    readonly title: Domain.QrCode["productTitle"];
    readonly image: Domain.QrCode["productImage"];
    readonly alt: Domain.QrCode["productAlt"];
  };
  readonly preview: {
    readonly image: string | null;
    readonly scanUrl: string | null;
    readonly destinationUrl: string | null;
  };
};
```

This maps cleanly to current consumers:

- `defaultValues = loaderData.form`
- `loaderProduct = loaderData.product`
- page heading/delete/new checks use `loaderData.identity`
- aside preview uses `loaderData.preview`

## Why This Is Better

- `form` can be passed directly to TanStack Form as `defaultValues` with `satisfies typeof QrFormInput.Encoded` no longer needed at the use site.
- Product display fields stop looking like editable form fields.
- Generated URLs stop looking like persisted QR-code columns.
- New and existing loader branches still return one object, but each chunk explains why a property exists.
- Future fields have clearer homes. Example: a `productDeleted` warning belongs under `product`; a download filename belongs under `preview` or can stay derived from `identity.handle`.

## Tradeoffs

- Existing JSX gets slightly more dotted paths: `loaderData.preview.image` instead of `loaderData.image`.
- The loader object literal gets more nested braces.
- If this route stays small and no more QR form fields are added, the flat shape is acceptable.

## Not Recommended

Do not create shared app-wide types yet. This shape is route-specific and includes UI/loader-only data.

Do not split into separate server functions for form, product, and preview. The existing loader needs the same QR lookup and session context, so splitting would add orchestration without a clear runtime benefit.

Do not model this as `Domain.QrCode & extraFields`. The route handles `new`, where `id`, `handle`, product metadata, and preview URLs are legitimately absent.

## Verdict

Chunking is beneficial if kept local and semantic. Prefer `identity`, `form`, `product`, and `preview`. This reduces the laundry-list feel while preserving the current single-loader flow and avoiding unnecessary new abstractions.
