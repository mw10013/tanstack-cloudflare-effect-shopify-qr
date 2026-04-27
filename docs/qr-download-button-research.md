# QR Code Download Button Research

## Problem

Clicking the Download button opens a new blank page instead of downloading the QR code image.

**Button code** (`src/routes/app.qrcodes.$id.tsx:354`):
```jsx
<s-button disabled={!loaderData.image} href={loaderData.image ?? undefined} download="" variant="primary">Download</s-button>
```

`loaderData.image` is a `data:image/png;base64,...` data URL produced by `qrcode.toDataURL()` (`src/lib/QrService.ts:71`).

## Root Cause

`s-button` is a Shopify App Bridge web component. Its `BaseElementAttributes` type (`@shopify/app-bridge-types/dist/shopify.ts:172`):

```ts
interface BaseElementAttributes {
  id?: string;
  name?: string;
  class?: string;
  href?: string;
  rel?: string;
  target?: string;
  onclick?: string;
  children?: string;
}
```

No `download` attribute. The component does not forward `download` to its internal anchor element. When `href` is provided, the component intercepts navigation — in the Shopify iframe context, external URLs open in a new tab, and a `data:` URL navigates to a blank-looking page.

The reference app (`refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:364`) uses the **identical pattern** — this is a bug in the reference app itself, not introduced by the port. Our port was faithful, which is why this was missed: the reference was treated as correct ground truth without runtime verification.

## Fix

Replace `href`/`download` with `onClick` that programmatically triggers a download:

```jsx
<s-button
  disabled={!loaderData.image}
  onClick={() => {
    if (!loaderData.image) return;
    const a = document.createElement("a");
    a.href = loaderData.image;
    a.download = `${loaderData.handle ?? "qr-code"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }}
  variant="primary"
>
  Download
</s-button>
```

This bypasses `s-button`'s href/navigation handling entirely. The programmatic `<a>` click with `download` on a `data:` URL triggers a native browser download without navigation.

## Alternatives Considered

- **Blob URL**: Convert data URL to blob then create object URL — cleaner for large files, but QR PNGs are small so data URL is fine.
- **Native `<a>` styled as button**: Avoids the web component entirely but loses Polaris button styling.
