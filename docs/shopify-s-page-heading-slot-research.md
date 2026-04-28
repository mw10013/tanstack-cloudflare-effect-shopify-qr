# Shopify `s-page`, `heading`, and `slot` Research

Question: explain `src/routes/app.index.tsx:99-102`, especially why `s-page heading` and `s-link slot="primary-action"` appear to create controls outside the iframe, and how this relates to Polaris and Shopify App Bridge.

## Code In Question

`src/routes/app.index.tsx:95-102`:

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

## Short Answer

- `s-page` is a Shopify web component tag loaded by Shopify's CDN scripts.
- In App Home, `s-page heading="QR codes"` does two things: lays out the page inside the app iframe with Polaris styling, and participates in configuring Shopify Admin's native title bar.
- `slot="primary-action"` means this child is not normal page body content. It is assigned to the parent `s-page` component's named `primary-action` slot.
- For App Home pages, Shopify bridges these named slots into the Shopify Admin chrome/title bar area, which is visually outside the app iframe content.
- Polaris is the design/component system. App Bridge is the embedded-app bridge that lets iframe content talk to Shopify Admin chrome. These `s-*` tags sit at the intersection: Polaris web components render native-looking app UI, while App Bridge web components/configuration can affect native Admin frame controls.

## What `s-page` Is

Shopify's App Home docs describe App Home as iframe-hosted app UI built with App Bridge and web components:

`refs/shopify-docs/docs/apps/build/app-surfaces.md:23-28`:

```md
## App Home

App Home is a dedicated area in the Shopify admin for your app to render its landing page and UI.
...
You build App Home pages using [App Bridge](https://shopify.dev/docs/api/app-bridge) and [web components](https://shopify.dev/docs/api/app-home/web-components). App Bridge handles communication between your app and the Shopify admin, while Polaris provides the UI components that make your app look and feel like a native part of the admin.
```

The generic web components page says Polaris provides these web components and that they make the app feel native to Admin:

`refs/shopify-docs/docs/api/app-home/web-components.md:14-20`:

```md
# Web components

Polaris provides a library of web components for your app to display data, get input from merchants, and trigger API calls. These components follow [Shopify's design system](https://shopify.dev/docs/api/polaris/using-polaris-web-components), ensuring that your app looks and feels native to the Shopify admin.

### Adding Polaris to your app
```

In this app, those scripts are loaded here:

`src/components/AppProvider.tsx:4-5`:

```ts
const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris.js";
```

`src/components/AppProvider.tsx:50-55`:

```tsx
export function AppProvider(props: AppProviderProps) {
  return (
    <>
      {props.embedded && <AppBridge apiKey={props.apiKey} />}
      <script src={POLARIS_URL} />
      {props.children}
    </>
  );
}
```

So `<s-page>` is not a React component imported from this repo. It is a custom element registered by Shopify's runtime scripts.

## `heading="QR codes"`

The Polaris page component docs define `heading` as the main page heading:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/layout-and-structure/page.md:47-54`:

```md
* **heading**

  **string**

  **required**

  The main page heading
```

The App Bridge title bar docs also define `heading`, but specifically as the title displayed in Shopify Admin's title bar:

`refs/shopify-docs/docs/api/app-home/app-bridge-web-components/title-bar.md:30-44`:

```md
## Properties

Properties for the page element. This element configures the title bar in the Shopify admin.

* **children**

  **SPageChildren**

  Child elements that populate the title bar slots. Use slots to add action buttons, breadcrumb navigation, and status badges to the title bar.

* **heading**

  **string**

  The page title displayed in the title bar. Use a clear, descriptive heading that helps merchants understand the current context, such as "Edit Product" or "Order #1234".
```

This is the confusing part: the docs contain a Polaris `s-page` and an App Bridge title-bar `s-page` with the same tag name. The docs explicitly connect them:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/layout-and-structure/page.md:17-19`:

```md
The page component provides a styled page layout within your app, including breadcrumbs, page actions, and content areas with automatic spacing.

Use page when you need a complete page layout with Polaris styling. For apps that need to set the Shopify admin's native title bar (title, breadcrumbs, actions) without a styled page layout, use the [title bar](https://shopify.dev/docs/api/app-home//app-bridge-web-components/title-bar) App Bridge component instead.
```

Interpretation for this route: `heading="QR codes"` is the page title for the app page, and Shopify's App Home runtime can mirror that page context into the Admin native title bar.

## `slot="primary-action"`

`slot` is the native Web Components slot mechanism. A child with `slot="primary-action"` is assigned to the parent component's named slot instead of being rendered as ordinary children.

The Polaris page docs list `primary-action` as a page slot:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/layout-and-structure/page.md:55-95`:

```md
### Slots

The page component supports slots for additional content placement within the component.

* **primary-action**

  **HTMLElement**

  The primary action for the page.

  Only accepts a single button component with a `variant` of `primary`.

* **secondary-actions**

  **HTMLElement**

  The secondary actions for the page.
```

The App Bridge title-bar docs are more explicit about where the slotted element appears:

`refs/shopify-docs/docs/api/app-home/app-bridge-web-components/title-bar.md:46-68`:

```md
### SPageChildren

Available slots for the page component. Each slot accepts specific elements that appear in designated areas of the title bar.

* primaryAction

  The main call-to-action button, typically "Save" or "Create". Appears prominently on the right side of the title bar. Only one primary action should be used per page to maintain clear visual hierarchy. Use `slot="primary-action"` on an `s-button` element.
```

So this line:

```tsx
<s-link slot="primary-action" href="/app/qrcodes/new">Create QR code</s-link>
```

means: register `Create QR code` as the page-level primary action, not as inline body content.

## Why It Looks Outside The Iframe

The actual app page is hosted in the App Home iframe:

`refs/shopify-docs/docs/api/app-home/patterns.md:14-17`:

```md
# Patterns

Most apps include common pages like landing and settings pages, which appear in the App Home iframe.
```

But Shopify Admin owns the surrounding shell/title bar. App Bridge is the communication layer from iframe to Admin shell:

`refs/shopify-docs/docs/apps/build/app-surfaces.md:27`:

```md
App Bridge handles communication between your app and the Shopify admin, while Polaris provides the UI components that make your app look and feel like a native part of the admin.
```

That explains the visual effect: the route renders `<s-page>` inside the iframe, but the runtime uses App Bridge/title-bar semantics to project page-level metadata and actions into Shopify Admin's chrome. The DOM source is in the iframe app, while the visible title/action controls can appear in the parent Admin frame.

## Why `s-link` Works Here

The link component is a Polaris web component for navigation:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/link.md:14-18`:

```md
# Link

The link component makes text interactive, allowing users to navigate to other pages or perform specific actions. Use link for navigation, external references, or triggering actions while maintaining standard link semantics and accessibility.

Links support standard URLs, custom protocols, navigation within Shopify admin pages, and can open in new windows for external destinations. For prominent actions or form submissions, use [button](https://shopify.dev/docs/api/app-home//polaris-web-components/actions/button) instead.
```

Its `href` property navigates on click:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/link.md:55-62`:

```md
* **href**

  **string**

  **required**

  The URL to navigate to when clicked. The `click` event fires first, then navigation occurs. If `commandFor` is also set, the command executes instead of navigation.
```

In this TanStack port, App Bridge navigation events are adapted into TanStack Router navigation:

`src/components/AppProvider.tsx:10-21`:

```tsx
React.useEffect(() => {
  const handleNavigate = (event: Event) => {
    const href = (event.target as HTMLElement)?.getAttribute("href");
    if (href) {
      void navigate({ to: href });
    }
  };

  document.addEventListener("shopify:navigate", handleNavigate);
  return () => {
    document.removeEventListener("shopify:navigate", handleNavigate);
  };
}, [navigate]);
```

So `href="/app/qrcodes/new"` is app-internal navigation, but rendered/styled/handled through Shopify's web component layer.

## Relationship To The Shopify QR Tutorial

This route is following Shopify's QR app tutorial pattern. The tutorial explicitly says the app form/page is built with route modules, web components, and App Bridge:

`refs/shopify-docs/docs/apps/build/build.md:667-672`:

```md
## Create a QR code form

Create a form that enables the app user to manage QR codes.

To create this form, you'll use a [Route module](https://reactrouter.com/start/framework/route-module), [web components](https://shopify.dev/docs/api/app-home/web-components) and [App Bridge](https://shopify.dev/docs/api/app-bridge).
```

The tutorial also states why web components are used:

`refs/shopify-docs/docs/apps/build/build.md:975-983`:

```md
### Lay out the form

Using web components, build the layout for the form. Use the page, section, and box components with `slot="aside"` to structure the page. The page should have two columns.

Polaris is Shopify's unified system for building app interfaces. Using web components ensures that your UI is accessible, responsive, and displays consistently with the Shopify admin.
```

And the tutorial repeatedly uses the same `s-page`/slot pattern for QR pages, for example:

`refs/shopify-docs/docs/apps/build/build.md:1555-1564`:

```tsx
<s-page heading="QR codes">
  <s-link slot="secondary-actions" href="/app/qrcodes/new">
    Create QR code
  </s-link>
  {qrCodes.length === 0 ? <EmptyQRCodeState /> : <QRCodeTable qrCodes={qrCodes} />}
</s-page>
```

This port uses `slot="primary-action"` instead of the tutorial excerpt's `secondary-actions`, which makes the action more prominent in the title/page action area.

## Practical Model

- Treat `<s-page>` as the root page container for App Home pages.
- Treat `heading` as page/title-bar metadata, not just local text.
- Treat `slot="primary-action"`, `slot="secondary-actions"`, and `slot="breadcrumb-actions"` as page chrome placement instructions.
- Use Polaris docs to understand component styling, layout, accessibility, and child slots.
- Use App Bridge docs to understand why some of those same `s-page` children appear in the Shopify Admin title bar outside the iframe body.

## Caveat In Current Code

The current code uses `s-link` in `slot="primary-action"`. `s-button` would work here and is the stricter docs-aligned choice. The button docs explicitly support `href`, so a navigation primary action can be written as a button:

```tsx
<s-button slot="primary-action" href="/app/qrcodes/new" variant="primary">Create QR code</s-button>
```

Button docs:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/button.md:107-113`:

```md
* **href**

  **string**

  **required**

  The URL to navigate to when clicked. The `click` event fires first, then navigation occurs. If `commandFor` is also set, the command executes instead of navigation.
```

`refs/shopify-docs/docs/api/app-home/polaris-web-components/actions/button.md:376-389`:

```md
### Use buttons for navigation and downloads

Set the `href` property to make buttons navigate like links while maintaining button styling.

```html
<s-stack direction="inline" gap="base">
  <s-button href="javascript:void(0)">View products</s-button>
  <s-button href="javascript:void(0)" target="_blank">Help docs</s-button>
  <s-button href="javascript:void(0)" download="sales-report.csv">
    Export data
  </s-button>
</s-stack>
```
```

The App Bridge title-bar docs say primary action examples use `s-button`, and the Polaris page docs say `primary-action` accepts a single button with `variant="primary"`:

`refs/shopify-docs/docs/api/app-home/polaris-web-components/layout-and-structure/page.md:81-88`:

```md
* **primary-action**

  **HTMLElement**

  The primary action for the page.

  Only accepts a single button component with a `variant` of `primary`.
```

If `s-link` works visually today, Shopify's runtime is likely tolerant of it there. For strict doc alignment, use `s-button slot="primary-action" href="/app/qrcodes/new" variant="primary"`, or keep `s-link` in `secondary-actions` as shown by the QR tutorial excerpt.
