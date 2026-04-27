# QR Code Port Research

## Scope

Focus: the QR code backend example in `refs/shopify-app-qr/qr-code/node/web` and what minimal pieces map into this codebase.

Relevant reference files:

- `refs/shopify-app-qr/qr-code/node/web/qr-codes-db.js`
- `refs/shopify-app-qr/qr-code/node/web/helpers/qr-codes.js`
- `refs/shopify-app-qr/qr-code/node/web/middleware/qr-code-api.js`
- `refs/shopify-app-qr/qr-code/node/web/middleware/qr-code-public.js`

## What The Example Stores

From `qr-codes-db.js`, `create` persists:

```js
{
  shopDomain,
  title,
  productId,
  variantId,
  handle,
  discountId,
  discountCode,
  destination,
}
```

The table also adds:

```js
scans: 0
createdAt: datetime(CURRENT_TIMESTAMP, 'localtime')
```

In this project, those map naturally to QR domain objects in `src/lib/Domain.ts`.

Likely minimal domain additions:

```ts
export const QrId = Schema.NonEmptyString.pipe(Schema.brand("QrId"));
export type QrId = typeof QrId.Type;

export const QrDestination = Schema.Literals(["product", "checkout"]);
export type QrDestination = typeof QrDestination.Type;

export const Qr = Schema.Struct({
  id: QrId,
  shopDomain: Shop,
  title: Schema.String,
  productId: ProductId,
  variantId: VariantId,
  handle: Schema.String,
  discountId: Schema.String,
  discountCode: Schema.String,
  destination: QrDestination,
  scans: Schema.Number,
  createdAt: Schema.String,
});
export type Qr = typeof Qr.Type;
```

## What The Repository Needs To Do

The reference `QRCodesDB` object exposes these operations:

```js
create(data)
update(id, data)
list(shopDomain)
read(id)
delete(id)
generateQrcodeDestinationUrl(qrcode)
handleCodeScan(qrcode)
```

Minimal equivalent: `src/lib/QrRepository.ts`, following the `ProductRepository.ts` Effect service pattern, but backed by Shopify Admin GraphQL/metaobjects instead of sqlite.

Expected methods:

```ts
createQr(input)
updateQr(id, input)
listQrs(shopDomain)
findQrById(id)
deleteQr(id)
incrementScans(id)
```

Pure URL helpers can live near the repository or in a small QR helper module:

```ts
getQrImageUrl(qr, origin)
getQrScanUrl(qr, origin)
getProductViewUrl(qr)
getProductCheckoutUrl(qr)
getScanRedirectUrl(qr)
```

## Metaobject Field Check

Current `shopify.app.toml` already defines:

```toml
[metaobjects.app.qrcode.fields.title]
[metaobjects.app.qrcode.fields.product]
[metaobjects.app.qrcode.fields.product_variant]
[metaobjects.app.qrcode.fields.destination]
[metaobjects.app.qrcode.fields.scans]
```

The reference code also needs these persisted values:

```js
shopDomain
handle
discountId
discountCode
```

So either add equivalent metaobject fields, or derive them every time from Shopify. For the reference behavior, persisting them is closer because public scans need redirect data without form/UI context.

## Admin Data Enrichment

`helpers/qr-codes.js` formats stored QR rows by querying Shopify for fresh product/discount data:

```graphql
query nodes($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      handle
      title
      images(first: 1) {
        edges {
          node {
            url
          }
        }
      }
    }
    ... on ProductVariant {
      id
    }
    ... on DiscountCodeNode {
      id
    }
  }
}
```

Equivalent belongs in `QrRepository.formatQrs` or similar. It should preserve the reference edge case: if a discount was deleted, clear `discountId` and `discountCode` on the QR.

## Shop Data Query

`qr-code-api.js` has `/api/shop-data` for the form:

```graphql
query shopData($first: Int!) {
  shop {
    url
  }
  codeDiscountNodes(first: $first) {
    edges {
      node {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) { edges { node { code } } }
          }
          ... on DiscountCodeBxgy {
            codes(first: 1) { edges { node { code } } }
          }
          ... on DiscountCodeFreeShipping {
            codes(first: 1) { edges { node { code } } }
          }
        }
      }
    }
  }
}
```

Equivalent can be a `QrRepository.getShopData` method or a separate Shopify Admin query helper. Run `pnpm graphql-codegen` after adding it.

## Public Scan Behavior

`qr-codes-db.js` handles scan redirects:

```js
await this.__increaseScanCount(qrcode);

switch (qrcode.destination) {
  case "product":
    return this.__goToProductView(url, qrcode);
  case "checkout":
    return this.__goToProductCheckout(url, qrcode);
}
```

Product URL behavior:

```js
if (discountCode) {
  url.pathname = `/discount/${discountCode}`;
  url.searchParams.append("redirect", productPath);
} else {
  url.pathname = productPath;
}
```

Checkout URL behavior:

```js
const id = variantId.replace(/gid:\/\/shopify\/ProductVariant\/([0-9]+)/, "$1");
url.pathname = `/cart/${id}:${quantity}`;
if (discountCode) url.searchParams.append("discount", discountCode);
```

This logic should be ported as pure functions and tested independently if we add tests.

## Questions

1. Should QR metaobjects persist `shopDomain`, `handle`, `discountId`, and `discountCode` for reference parity?
2. Should `QrRepository` include pure URL helpers, or should those live in a separate `Qr.ts`/helper module?
3. For public routes, what ID should `/qrcodes/:id/image` and `/qrcodes/:id/scan` use: metaobject ID, handle, or another stable field?
4. Do we want to include discount support immediately, since the reference code includes it and the shop-data query depends on discount scopes?
