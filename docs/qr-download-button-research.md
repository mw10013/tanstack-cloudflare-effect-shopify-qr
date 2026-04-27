# QR Code Download Button Research

## Problem

Clicking the Download button opened a new blank page instead of downloading the QR code image.

**Original button code** (`src/routes/app.qrcodes.$id.tsx:354`):

```jsx
<s-button disabled={!loaderData.image} href={loaderData.image ?? undefined} download="" variant="primary">Download</s-button>
```

`loaderData.image` is a `data:image/png;base64,...` data URL produced by `qrcode.toDataURL()` (`src/lib/QrService.ts:71`).

## Shopify Docs

Shopify documents `download` as a supported `s-button` property, not just a native anchor attribute.

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/button.md:107-125`:

```md
* **href**

  The URL to navigate to when clicked. The `click` event fires first, then navigation occurs.

* **download**

  Prompts the browser to download the linked URL rather than navigate to it. When set, the value specifies the suggested filename for the downloaded file.

  The filename suggestion is only respected for same-origin URLs, `blob:`, and `data:` schemes. Cross-origin URLs can still trigger downloads, but browsers might ignore the suggested filename.
```

The menu docs also show `s-button download href=...` as a normal pattern.

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/menu.md:106-110`:

```html
<s-button href="javascript:void(0)" target="_blank">
  View product page
</s-button>
<s-button disabled>Unavailable action</s-button>
<s-button download href="javascript:void(0)">Download report</s-button>
```

`s-link` has the same supported download API.

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/link.md:237-245`:

```html
<s-link href="javascript:void(0)" download="customer-export.csv">Download customer list</s-link>
```

## Reference App

The reference app uses the basic documented `s-button href + download` approach.

`refs/shopify-app-qr/app/routes/app.qrcodes.$id.jsx:364-371`:

```jsx
<s-button
  disabled={!initialFormState?.image}
  href={initialFormState?.image}
  download
  variant="primary"
>
  Download
</s-button>
```

So the reference app is not using the programmatic temporary-anchor workaround. It uses the idiomatic Shopify web component API, but with boolean `download` rather than a filename string.

## Assessment

The earlier root-cause theory that `s-button` does not support or forward `download` is off. Current Shopify docs explicitly list `download` on `s-button`, and mention `data:` URLs as a case where filename suggestions are respected.

The fix is to keep the idiomatic `s-button href + download` approach, but pass a filename string instead of an empty string or boolean:

```jsx
<s-button
  disabled={!loaderData.image}
  href={loaderData.image ?? undefined}
  download={`${loaderData.handle ?? "qr-code"}.png`}
  variant="primary"
>
  Download
</s-button>
```

This matches Shopify's documented API and the reference app's structure while improving the reference implementation by providing the suggested filename.

## If Runtime Still Fails

If `s-button href + download` still opens a blank page in the embedded app runtime, the cleaner fallback is not a client-side temporary-anchor click. The cleaner fallback is a same-origin download route that returns the PNG bytes with download headers:

```http
content-type: image/png
content-disposition: attachment; filename="qr-code.png"
```

Then the button can stay a normal documented link:

```jsx
<s-button href={downloadUrl} download={`${loaderData.handle ?? "qr-code"}.png`} variant="primary">Download</s-button>
```

## Avoided Approach

Creating an `<a>` element and calling `.click()` is a browser workaround, not the Shopify-idiomatic implementation. It may work, but it bypasses the documented web component API and adds TypeScript/lint friction in this Cloudflare DOM type environment.
