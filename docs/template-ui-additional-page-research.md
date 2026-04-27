# Template UI Additional Page Research

## Scope

Goal: move the Shopify app template welcome/product demo UI out of `src/routes/app.index.tsx` and into a new sibling app page, so `/app/` can focus on QR code list/create functionality while the existing `/app/additional` page stays unchanged.

Current mingling in this project:

- QR home behavior lives in `src/routes/app.index.tsx:29-43` and `src/routes/app.index.tsx:51-159`.
- Template product demo server/client behavior also lives in `src/routes/app.index.tsx:11-27` and `src/routes/app.index.tsx:118-154`.
- Template welcome/product/aside markup lives in `src/routes/app.index.tsx:160-267`.
- The existing additional page is the baseline multi-page placeholder in `src/routes/app.additional.tsx:7-39` and should stay as-is.

## Reference Shape

The QR app home is intentionally only QR codes.

From `refs/shopify-app-qr/app/routes/app._index.jsx:121-137`:

```jsx
export default function Index() {
  const { qrCodes } = useLoaderData();

  return (
    <s-page heading="QR codes">
      <s-link slot="secondary-actions" href="/app/qrcodes/new">
        Create QR code
      </s-link>
      {qrCodes.length === 0 ? (
        <EmptyQRCodeState />
      ) : (
        <QRTable qrCodes={qrCodes} />
      )}
    </s-page>
  );
}
```

The template app home contains the content to preserve elsewhere.

From `refs/shopify-app-template/app/routes/app._index.tsx:103-248`:

```tsx
return (
  <s-page heading="Shopify app template">
    <s-button slot="primary-action" onClick={generateProduct}>
      Generate a product
    </s-button>

    <s-section heading="Congrats on creating a new Shopify app 🎉">
      ...
    </s-section>
    <s-section heading="Get started with products">
      ...
    </s-section>

    <s-section slot="aside" heading="App template specs">
      ...
    </s-section>

    <s-section slot="aside" heading="Next steps">
      ...
    </s-section>
  </s-page>
);
```

The template additional page is just a navigation demo. Preserve this separately from the template product-demo page.

From `refs/shopify-app-template/app/routes/app.additional.tsx:1-37`:

```tsx
export default function AdditionalPage() {
  return (
    <s-page heading="Additional page">
      <s-section heading="Multiple pages">
        ...
      </s-section>
      <s-section slot="aside" heading="Resources">
        ...
      </s-section>
    </s-page>
  );
}
```

The port already has the same navigation route target in `src/routes/app.tsx:119-122`:

```tsx
<s-app-nav>
  <s-link href={`/app${searchStr}`}>Home</s-link>
  <s-link href={`/app/additional${searchStr}`}>Additional page</s-link>
</s-app-nav>
```

## Recommended Extraction

Create a new route file for the template demo. Recommended name:

- `src/routes/app.template-demo.tsx`
- route path: `/app/template-demo`
- nav label: `Template demo`

This name is intentionally descriptive rather than overloading `additional`. It separates the page purpose from the existing `Additional page` route and avoids changing tests/docs that already refer to `/app/additional`.

Move all template-only pieces from `src/routes/app.index.tsx` to `src/routes/app.template-demo.tsx`:

- `import * as React from "react";`
- `import { useAppBridge } from "@shopify/app-bridge-react";`
- `import { useHydrated } from "@tanstack/react-router";`
- `import { createServerFn } from "@tanstack/react-start";`
- `import { Effect } from "effect";`
- `import { ProductRepository } from "@/lib/ProductRepository";`
- `import { shopifyServerFnMiddleware } from "@/lib/ShopifyServerFnMiddleware";`
- `generateProduct` server function from `src/routes/app.index.tsx:11-27`.
- Product-demo state/effects/handlers from `src/routes/app.index.tsx:118-154`.
- Welcome section, get-started section, mutation JSON output, and both aside sections from `src/routes/app.index.tsx:160-267`.

Leave QR-only pieces on `src/routes/app.index.tsx`:

- `QrRepository` import.
- `listQrCodes` server function.
- `Route` loader using `listQrCodes()`.
- `truncate`, `EmptyQrCodeState`, `QrCodeTable`, and the QR page render.

After extraction, `AppIndex` should be close to:

```tsx
function AppIndex() {
  const qrCodes = Route.useLoaderData();

  return (
    <s-page heading="QR codes">
      <s-link slot="primary-action" href="/app/qrcodes/new">Create QR code</s-link>
      {qrCodes.length === 0 ? <EmptyQrCodeState /> : <QrCodeTable qrCodes={qrCodes} />}
    </s-page>
  );
}
```

`src/routes/app.additional.tsx` should not change. The new route component can be named `TemplateDemoPage` and use `heading="Shopify app template"`.

## Server Function Placement

Keep `generateProduct` route-local in `src/routes/app.template-demo.tsx`.

Reasons:

- It is only used by the template demo page.
- It already composes through `shopifyServerFnMiddleware`, which provides `ProductRepository`; see `src/lib/ShopifyServerFnMiddleware.ts:62-73`.
- It mirrors the template action's responsibility without adding a shared abstraction.

Reference template action creates a product and updates the first variant in `refs/shopify-app-template/app/routes/app._index.tsx:18-85`. Current port already adapted that to Effect and `ProductRepository` in `src/routes/app.index.tsx:11-27`, so this is a move, not a rewrite.

## Navigation

Keep the existing additional route unchanged. `src/routes/app.additional.tsx:3-5` already declares:

```tsx
export const Route = createFileRoute("/app/additional")({
  component: AdditionalPage,
});
```

Add the new page to app nav before the existing additional page. Current nav is `src/routes/app.tsx:119-122`:

```tsx
<s-app-nav>
  <s-link href={`/app${searchStr}`}>Home</s-link>
  <s-link href={`/app/additional${searchStr}`}>Additional page</s-link>
</s-app-nav>
```

Recommended nav after extraction:

```tsx
<s-app-nav>
  <s-link href={`/app${searchStr}`}>Home</s-link>
  <s-link href={`/app/template-demo${searchStr}`}>Template demo</s-link>
  <s-link href={`/app/additional${searchStr}`}>Additional page</s-link>
</s-app-nav>
```

Optional label alternatives if `Template demo` feels too implementation-focused:

- `Getting started`
- `Product demo`
- `Template starter`

Default recommendation: use `Template demo` for clarity and minimal ambiguity. Do not rename `Additional page`; existing coverage mentions that label in `docs/e2e-coverage-gaps-research.md:8-88`.

## Validation

After code changes:

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Do not run `pnpm graphql-codegen` unless the move edits `#graphql` template literal strings. A pure move of the current `generateProduct` server function should not change GraphQL content.

Manual smoke check:

- `/app/` renders `s-page[heading="QR codes"]` with only QR list/empty state and create action.
- `/app/template-demo` renders template welcome/product demo sections.
- `/app/additional` still renders the existing multiple-pages demo.
- `Generate a product` creates a product, shows `Product created`, renders both JSON blocks, and `Edit product` opens the Shopify product editor intent.

## Implementation Notes

Use a direct move instead of a shared component unless reuse appears later. The smallest correct change is route-local code in `app.template-demo.tsx`, unchanged `app.additional.tsx`, and a QR-only `app.index.tsx`.

Be careful not to edit `src/routeTree.gen.ts`; it is generated.
