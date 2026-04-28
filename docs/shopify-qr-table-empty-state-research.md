# Shopify QR Table and Empty State Research

Question: explain `QrCodeTable` and `EmptyQrCodeState` in `src/routes/app.index.tsx`, including the `s-*` elements, their attributes, slots, and relationship to Polaris and Shopify App Bridge.

## Short Answer

- `QrCodeTable` and `EmptyQrCodeState` are Shopify App Home UI built from Polaris web components registered by `https://cdn.shopify.com/shopifycloud/polaris.js`.
- The components are not local React components. React renders custom element tags like `<s-table>` and Shopify's Polaris runtime upgrades them.
- `QrCodeTable` is an index-table-style layout. The key detail is `listSlot="primary"` on the Title header, which controls how responsive tables collapse into list rows on small screens.
- `EmptyQrCodeState` is a centered empty-state composition: section container, grid centering, constrained illustration, heading, copy, and primary CTA.
- `slot="primary-action"` on the page-level create button is native Web Components slotting. On `s-page`, that slot is also meaningful to App Bridge/title-bar behavior.
- Polaris provides the visual system and web components; App Bridge provides iframe-to-Shopify-Admin communication and Admin chrome integration.

## Local Code

`src/routes/app.index.tsx:30-50`:

```tsx
function EmptyQrCodeState() {
  return (
    <s-section accessibilityLabel="Empty state section">
      <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
        <s-box maxInlineSize="200px" maxBlockSize="200px">
          <s-image
            aspectRatio="1/0.5"
            src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            alt="A stylized graphic of a document"
          />
        </s-box>
        <s-grid justifyItems="center" maxBlockSize="450px" maxInlineSize="450px">
          <s-heading>Create unique QR codes for your products</s-heading>
          <s-paragraph>Allow customers to scan codes and buy products using their phones.</s-paragraph>
          <s-stack gap="small-200" justifyContent="center" padding="base" paddingBlockEnd="none" direction="inline">
            <s-button href="/app/qrcodes/new" variant="primary">Create QR code</s-button>
          </s-stack>
        </s-grid>
      </s-grid>
    </s-section>
  );
}
```

`src/routes/app.index.tsx:53-92`:

```tsx
function QrCodeTable({ qrCodes }: { readonly qrCodes: Awaited<ReturnType<typeof listQrCodes>> }) {
  return (
    <s-section padding="none" accessibilityLabel="QR code table">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Title</s-table-header>
          <s-table-header>Product</s-table-header>
          <s-table-header>Date created</s-table-header>
          <s-table-header>Scans</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {qrCodes.map((qrCode) => (
            <s-table-row key={qrCode.handle} id={qrCode.handle}>
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-clickable href={`/app/qrcodes/${qrCode.handle}`}>
                    {qrCode.productImage ? <s-image objectFit="cover" src={qrCode.productImage} /> : <s-icon size="base" type="image" />}
                  </s-clickable>
                  <s-link href={`/app/qrcodes/${qrCode.handle}`}>{truncate(qrCode.title)}</s-link>
                </s-stack>
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}
```

The local code is a TanStack port of Shopify's QR tutorial. The source tutorial contains the same shapes:

`refs/shopify-docs/docs/apps/build/build.md:1574-1582`:

```md
### Create an empty state

If there are no QR codes, construct an empty state display using the section, grid, box, heading, and paragraph components. Use the button component to link to the QR code form for creating a new QR Code.

[Section] [Grid] [Box] [Heading] [Paragraph] [Button]
```

`refs/shopify-docs/docs/apps/build/build.md:1878`:

```md
The table should have columns for the QR code title, product, the date the QR code was created, and the number of times the QR code was scanned. The title table header should use `listSlot="primary"`.
```

## Where `s-*` Comes From

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

Shopify docs describe this runtime:

`refs/shopify-docs/docs/api/app-home/web-components.md:14-20`:

```md
Polaris provides a library of web components for your app to display data, get input from merchants, and trigger API calls. These components follow Shopify's design system, ensuring that your app looks and feels native to the Shopify admin.

When you scaffold your app using Shopify CLI, the Polaris library is added to your app automatically. You can also manually add Polaris in any framework by adding the following script tag to your app's HTML head:
```

Interpretation: the `s-*` JSX tags are custom elements. They are framework-agnostic web components, not imported React components.

## Why The DOM Looks Weird

The DOM looks weird because every Polaris `s-*` tag is a custom element with its own internal DOM. Chrome DevTools shows both:

- Light DOM: the elements React created as children of the custom element.
- Shadow DOM: the private implementation DOM that the web component owns.
- Slots: placeholders inside the shadow DOM where the component displays its light-DOM children.

MDN's Shadow DOM docs define the terms:

`https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`:

```md
Shadow DOM allows hidden DOM trees to be attached to elements in the regular DOM tree — this shadow DOM tree starts with a shadow root, underneath which you can attach any element, in the same way as the normal DOM.

Shadow host: The regular DOM node that the shadow DOM is attached to.
Shadow tree: The DOM tree inside the shadow DOM.
Shadow boundary: the place where the shadow DOM ends, and the regular DOM begins.
Shadow root: The root node of the shadow tree.
```

For this route, `s-section` is a shadow host:

```html
<s-section accessibilitylabel="Empty state section">
  #shadow-root (open)
    <section class="section level-1 padding-base">
      <span class="visually-hidden">...</span>
      <slot></slot>
    </section>

  <s-grid>...</s-grid>
</s-section>
```

Meaning:

- `s-section` is the public element in the normal document.
- `#shadow-root (open)` is Shopify Polaris' private implementation for `s-section`.
- The internal real HTML is a native `<section>` with Polaris classes.
- The internal `<slot></slot>` is where `s-section` displays the light-DOM child `<s-grid>`.
- The child `<s-grid>` remains physically under `<s-section>` in the normal DOM, but visually/compositionally appears where the shadow slot sits.

This is why DevTools has a reveal action on slots. The `<slot>` node is inside the component's shadow tree. The slotted child is somewhere else in the light DOM. DevTools lets you jump between those two related but separate locations.

MDN's `<slot>` docs define this exact behavior:

`https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot`:

```md
The <slot> HTML element—part of the Web Components technology suite—is a placeholder inside a web component that you can fill with your own markup, which lets you create separate DOM trees and present them together.
```

MDN's templates and slots docs explain default slots:

`https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots`:

```md
The `name` and `slot` attributes both default to the empty string, so elements with no `slot` attributes are assigned to the `<slot>` with no `name` attribute (the unnamed slot, or default slot).
```

That is what happens throughout `EmptyQrCodeState`. Most children do not have `slot="..."`, so they go into each parent's unnamed/default slot.

## Reading The Empty State DOM

Start from the JSX because it is the authoring shape:

```tsx
<s-section accessibilityLabel="Empty state section">
  <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
    <s-box maxInlineSize="200px" maxBlockSize="200px">
      <s-image aspectRatio="1/0.5" src="..." alt="A stylized graphic of a document" />
    </s-box>
    <s-grid justifyItems="center" maxBlockSize="450px" maxInlineSize="450px">
      <s-heading>Create unique QR codes for your products</s-heading>
      <s-paragraph>Allow customers to scan codes and buy products using their phones.</s-paragraph>
      <s-stack gap="small-200" justifyContent="center" padding="base" paddingBlockEnd="none" direction="inline">
        <s-button href="/app/qrcodes/new" variant="primary">Create QR code</s-button>
      </s-stack>
    </s-grid>
  </s-grid>
</s-section>
```

Then read the rendered DOM as repeated custom-element wrappers:

```text
s-section host
  shadow DOM: native section + visually hidden heading + default slot
  light DOM child assigned to slot: s-grid

  s-grid host
    shadow DOM: span.grid + default slot
    light DOM children assigned to slot: s-box, inner s-grid

    s-box host
      shadow DOM: span.box + default slot
      light DOM child assigned to slot: s-image

      s-image host
        shadow DOM: real img element
        no child slot, because image content comes from src/alt attributes

    inner s-grid host
      shadow DOM: span.grid + default slot
      light DOM children assigned to slot: s-heading, s-paragraph, s-stack

      s-heading host
        shadow DOM: h2.heading + default slot
        light DOM text assigned to slot: "Create unique QR codes for your products"

      s-paragraph host
        shadow DOM: p.paragraph + default slot
        light DOM text assigned to slot: body copy

      s-stack host
        shadow DOM: span.stack + default slot
        light DOM child assigned to slot: s-button

        s-button host
          shadow DOM: real a.button[href="/app/qrcodes/new"] + default slot
          light DOM text assigned to slot: "Create QR code"
```

The mental model: every `s-*` element is a shell. Its shadow DOM turns it into normal HTML plus scoped CSS. Its light-DOM children are projected into the shell through slots.

## Your Pasted DOM, Simplified

This part:

```html
<s-grid justifyitems="center" paddingblock="large-400" gap="base">
  <template shadowrootmode="open">
    <style>.grid{padding-block:2.5rem;}</style>
    <style>.grid{display:grid;}</style>
    <span class="grid"><slot></slot></span>
  </template>
  <s-box>...</s-box>
  <s-grid>...</s-grid>
</s-grid>
```

Means this visually:

```html
<span class="grid">
  <s-box>...</s-box>
  <s-grid>...</s-grid>
</span>
```

But that visual/composed structure is not the same as the physical DOM tree. Physically, `s-box` and the inner `s-grid` remain light-DOM children of the outer `s-grid` host. The shadow `<slot>` points at them.

This part:

```html
<s-button href="/app/qrcodes/new" variant="primary">
  <template shadowrootmode="open" shadowrootdelegatesfocus="">
    <a role="link" class="button size-base tone-auto variant-primary" target="_self" href="/app/qrcodes/new">
      <span class="content"><span class="text-wrapper"><slot></slot></span></span>
    </a>
  </template>
  Create QR code
</s-button>
```

Means:

- You author `<s-button href="..." variant="primary">Create QR code</s-button>`.
- Polaris implements it with a real `<a href="...">` because `href` makes it navigational.
- The text `Create QR code` is a light-DOM text node.
- The internal `<slot>` projects that text into the internal `<a>`.
- `shadowrootdelegatesfocus` means focus behavior can be forwarded into the shadow tree, so focusing the host can focus the internal interactive element.

This part:

```html
<s-section accessibilitylabel="Empty state section">
  <template shadowrootmode="open">
    <section class="section level-1 padding-base">
      <span class="visually-hidden">
        <s-heading>Empty state section</s-heading>
      </span>
      <slot></slot>
    </section>
  </template>
  <s-grid>...</s-grid>
</s-section>
```

Means:

- `accessibilityLabel="Empty state section"` became the HTML attribute `accessibilitylabel="Empty state section"`; DOM attributes are lowercase in HTML.
- Polaris created an internal native `<section>`.
- Polaris created a visually hidden heading from the accessibility label.
- The visible child content goes through the default slot.

## Why Chrome Highlighting Can Feel Broken

Chrome highlights rendered boxes. Many of the nodes you click in DevTools are not boxes on the page:

- A `<slot>` is a placeholder, not the final visible element. The assigned child may draw elsewhere in the composed tree.
- A custom-element host like `<s-grid>` may not itself draw much; its internal `<span class="grid">` owns the layout box.
- A shadow-root line is not an element and has no page box to highlight.
- Some internal nodes are `display: contents`, visually hidden, or wrapper spans whose bounds are hard to see.

For visual inspection, select the internal real element inside the shadow root when possible:

- For `s-section`, inspect internal `<section class="section ...">`.
- For `s-grid`, inspect internal `<span class="grid">`.
- For `s-box`, inspect internal `<span class="box">`.
- For `s-image`, inspect internal `<img class="image ...">`.
- For `s-button`, inspect internal `<a class="button ...">`.

For authoring/debugging, select the `s-*` host when you care about props/attributes from JSX. Select the internal shadow element when you care about the final native HTML and computed CSS.

## DevTools Copy/Paste Confusion

Chrome sometimes serializes open shadow roots as declarative shadow DOM:

```html
<template shadowrootmode="open">...</template>
```

That is not what React wrote in `src/routes/app.index.tsx`. It is Chrome showing the shadow root in a copyable HTML-ish form. MDN describes declarative shadow DOM this way:

`https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`:

```md
In such cases, you can use the <template> element to declaratively define the shadow DOM. The key to this behavior is the enumerated `shadowrootmode` attribute, which can be set to either `open` or `closed`.

After the browser parses the HTML, it replaces <template> element with its content wrapped in a shadow root that's attached to the parent element.
```

In this app, the important source of truth is still the JSX. The copied DOM includes Shopify's implementation details, generated styles, and shadow-root serialization.

## Open Shadow Root

`#shadow-root (open)` means the component's internals are inspectable and accessible via JavaScript as `element.shadowRoot`.

MDN:

`https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`:

```md
With `mode` set to `"open"`, the JavaScript in the page is able to access the internals of your shadow DOM through the `shadowRoot` property of the shadow host.
```

For example in DevTools console:

```js
document.querySelector("s-button")?.shadowRoot?.querySelector("a")
```

This can find the internal `<a>` created by Polaris. Use that for debugging only; app code should generally treat Polaris internals as private.

## Polaris and App Bridge Relationship

Shopify's App Home surface is explicitly built with both:

`refs/shopify-docs/docs/apps/build/app-surfaces.md:23-28`:

```md
App Home is a dedicated area in the Shopify admin for your app to render its landing page and UI.

You build App Home pages using App Bridge and web components. App Bridge handles communication between your app and the Shopify admin, while Polaris provides the UI components that make your app look and feel like a native part of the admin.
```

Practical split for this route:

- Polaris web components render the page body UI: `s-section`, `s-table`, `s-grid`, `s-button`, etc.
- App Bridge is loaded only in embedded mode and connects the iframe app to Shopify Admin.
- `s-page` sits near the boundary: it is a Polaris layout component, but its heading/actions overlap with App Bridge title-bar concepts.

Shopify documents that distinction on the page component:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/page.md:17-19`:

```md
The page component provides a styled page layout within your app, including breadcrumbs, page actions, and content areas with automatic spacing.

Use page when you need a complete page layout with Polaris styling. For apps that need to set the Shopify admin's native title bar (title, breadcrumbs, actions) without a styled page layout, use the title bar App Bridge component instead.
```

And the title-bar reference uses the same `s-page` tag for Admin title-bar configuration:

`refs/shopify-docs/docs/api/app-home/app-bridge-web-components/title-bar.md:30-44`:

```md
Properties for the page element. This element configures the title bar in the Shopify admin.

children: Child elements that populate the title bar slots. Use slots to add action buttons, breadcrumb navigation, and status badges to the title bar.

heading: The page title displayed in the title bar.
```

## Slots

Slots are native Web Components placement points. A child with `slot="name"` is assigned to the parent component's named slot instead of default children.

For `s-page`, Shopify documents these slots:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/page.md:55-95`:

```md
The page component supports slots for additional content placement within the component.

primary-action: The primary action for the page. Only accepts a single button component with a `variant` of `primary`.

secondary-actions: The secondary actions for the page. Only accepts button group and button components with a `variant` of `secondary` or `auto`.
```

The App Bridge title-bar docs make the chrome placement explicit:

`refs/shopify-docs/docs/api/app-home/app-bridge-web-components/title-bar.md:46-76`:

```md
Available slots for the page component. Each slot accepts specific elements that appear in designated areas of the title bar.

primaryAction: The main call-to-action button, typically "Save" or "Create". Appears prominently on the right side of the title bar. Only one primary action should be used per page to maintain clear visual hierarchy. Use `slot="primary-action"` on an `s-button` element.

secondaryActions: Additional action buttons that appear next to the primary action. Use for secondary operations like "Cancel", "Delete", or grouped actions using `s-menu`. Multiple buttons can be added. Use `slot="secondary-actions"` on `s-button` elements.
```

In this route:

`src/routes/app.index.tsx:99-101`:

```tsx
<s-page heading="QR codes">
  <s-button slot="primary-action" href="/app/qrcodes/new" variant="primary">Create QR code</s-button>
  {qrCodes.length === 0 ? <EmptyQrCodeState /> : <QrCodeTable qrCodes={qrCodes} />}
</s-page>
```

Meaning:

- The `s-button` is page-level chrome/action content because of `slot="primary-action"`.
- The empty state or table are default `children` content because they have no slot.
- `variant="primary"` is correct for the `primary-action` slot.

Important distinction: `listSlot` is not native slotting. It is a table-header property that controls responsive list layout.

## `QrCodeTable`

### Structure

The table docs describe the responsive behavior:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/table.md:16-20`:

```md
The table component displays data clearly in rows and columns, helping users view, analyze, and compare structured information.

Tables automatically adapt to screen size, rendering as lists on small screens and tables on larger ones for optimal readability across devices.
```

The required structure is also documented:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/table.md:93-99`:

```md
children: The table structure defining headers and data rows.

Accepts table header row (for column headers) and table body (for data rows) components. Structure your table with a table header row first, followed by table body.
```

`src/routes/app.index.tsx` follows that shape:

- `s-section padding="none" accessibilityLabel="QR code table"` wraps the table in a content section and removes default section padding so the table spans section edges.
- `s-table` owns responsive table/list behavior.
- `s-table-header-row` contains one `s-table-header` per column.
- `s-table-body` contains `s-table-row` records.
- Each `s-table-row` contains `s-table-cell` values in the same order as the headers.

### `s-section padding="none" accessibilityLabel="QR code table"`

Section purpose:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/section.md:17-19`:

```md
The section component groups related content into clearly-defined thematic areas with consistent styling and structure. Use section to organize page content into logical blocks, each with its own heading and visual container.

Sections automatically adapt their styling based on nesting depth and adjust heading levels to maintain meaningful, accessible page hierarchies.
```

`padding="none"` is specifically useful for tables:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/section.md:50-61`:

```md
padding: The padding applied to all edges of the element.

base: applies padding that is appropriate for the element.
none: removes all padding from the element. This can be useful when elements inside the section need to span to the edge of the section. For example, a full-width image.
```

### `s-table-header listSlot="primary"`

The Title header is marked as the primary content for the mobile/list representation.

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/table.md:201-224`:

```md
listSlot: The content designation for this column when the table displays in list variant on mobile devices.

ListSlotType: Represents the semantic type of content slots within list items. - `primary`: The main content or title of the list item. - `secondary`: Supporting or descriptive content below the primary content. - `kicker`: A small label or tag displayed above the primary content. - `inline`: Content displayed inline with the primary content. - `labeled`: Content with an associated label.

'primary' | 'secondary' | 'kicker' | 'inline' | 'labeled'
```

Interpretation for QR codes:

- Desktop/wide: columns render as Title, Product, Date created, Scans.
- Mobile/narrow: the table can render rows as list items.
- The Title cell becomes the list item's main content because its header has `listSlot="primary"`.
- Product, Date created, and Scans use the default `listSlot="labeled"`, so they appear with labels in the list layout.

The index-table composition calls this out as a key responsive-table attribute:

`refs/shopify-docs/docs/api/app-home/patterns/compositions/index-table.md:29-31`:

```md
Key attributes include `slot="filters"` on the grid to place controls in the filters area, `clickDelegate` on table rows to connect clicks to checkboxes, and `listSlot` on table headers to control responsive stacking.
```

### Row Cell Components

First cell:

```tsx
<s-stack direction="inline" gap="small" alignItems="center">
  <s-clickable href={`/app/qrcodes/${qrCode.handle}`} accessibilityLabel={...} border="base" borderRadius="base" overflow="hidden" inlineSize="20px" blockSize="20px">
    {qrCode.productImage ? <s-image objectFit="cover" src={qrCode.productImage} /> : <s-icon size="base" type="image" />}
  </s-clickable>
  <s-link href={`/app/qrcodes/${qrCode.handle}`}>{truncate(qrCode.title)}</s-link>
</s-stack>
```

`s-stack` is the inline layout primitive:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/stack.md:17-20`:

```md
The stack component organizes elements horizontally or vertically along the block or inline axis.

Stacks support gap spacing, alignment, wrapping, and distribution properties to create consistent, responsive layouts without custom CSS.
```

`direction="inline"` places thumbnail/icon and title next to each other. `gap="small"` creates spacing. `alignItems="center"` vertically centers them.

`s-clickable` wraps the thumbnail as a custom clickable area:

`refs/shopify-docs/docs/api/app-home/web-components/actions/clickable.md:13-18`:

```md
The clickable component wraps content to make it interactive and clickable. Use it when you need more styling control than button or link provide, such as custom backgrounds, padding, or borders around your clickable content.

Clickable supports button, link, and submit modes with built-in accessibility properties for keyboard navigation and screen reader support.
```

Relevant attributes:

- `href` makes it navigational.
- `accessibilityLabel` gives the image-only link a screen-reader label.
- `border`, `borderRadius`, `overflow`, `inlineSize`, and `blockSize` create a fixed clipped thumbnail frame.

`s-image` displays the product image. The image docs describe `objectFit` and sizing use:

`refs/shopify-docs/docs/api/app-home/web-components/media-and-visuals/image.md:96-110`:

```md
Display a product thumbnail with metadata in a grid layout. This example demonstrates how to control image sizing with `aspectRatio`, `objectFit`, and `inlineSize`, and round corners with `borderRadius`.

<s-image src="..." alt="Indoor plant" aspectRatio="1/1" objectFit="cover" borderRadius="base" inlineSize="fill" />
```

`s-icon` is the fallback when there is no product image:

`refs/shopify-docs/docs/api/app-home/web-components/media-and-visuals/icon.md:17-19`:

```md
The icon component renders graphic symbols to visually communicate actions, status, and navigation throughout the interface.

Icons support multiple sizes, tones for semantic meaning, and can be integrated with other components like button, badge, and chip.
```

`s-link` is the text navigation target:

`refs/shopify-docs/docs/api/app-home/web-components/actions/link.md:14-18`:

```md
The link component makes text interactive, allowing users to navigate to other pages or perform specific actions.

Links support standard URLs, custom protocols, navigation within Shopify admin pages, and can open in new windows for external destinations. For prominent actions or form submissions, use button instead.
```

Second cell:

```tsx
{qrCode.productDeleted ? <s-badge icon="alert-diamond" tone="critical">Product has been deleted</s-badge> : truncate(qrCode.productTitle)}
```

`s-badge` gives a compact status when the product is deleted:

`refs/shopify-docs/docs/api/app-home/web-components/feedback-and-status-indicators/badge.md:16-20`:

```md
The badge component displays status information or indicates completed actions through compact visual indicators.

Badges support multiple tones and sizes, with optional icons to reinforce status meaning and improve scannability in lists and tables.
```

`tone="critical"` marks the deleted-product state as urgent/problematic. `icon="alert-diamond"` reinforces the warning.

Third and fourth cells are plain text values: a formatted creation date and scan count.

## `EmptyQrCodeState`

The Shopify empty-state pattern explains the purpose:

`refs/shopify-docs/docs/api/app-home/patterns/compositions/empty-state.md:14-18`:

```md
Every app has moments when there's nothing to show yet and some action is required of the merchant before they can manage resources. The empty state composition turns these blank screens into opportunities by guiding merchants toward their first action.

Include a clear explanation of what will appear here and a prominent call-to-action to help merchants get started.
```

The example is almost the same layout:

`refs/shopify-docs/docs/api/app-home/patterns/compositions/empty-state.md:30-33`:

```md
Merchants need guidance and a clear next step when a list or page is empty. This pattern displays an empty state with centered content and primary and secondary actions. The grid centers content vertically and horizontally.
```

### Element-by-Element

`s-section accessibilityLabel="Empty state section"`:

- Groups the empty-state block as a section.
- Gives assistive tech an explicit purpose label.

`s-grid gap="base" justifyItems="center" paddingBlock="large-400"`:

- Creates the outer centered layout.
- `gap="base"` controls spacing between image and text/action block.
- `justifyItems="center"` centers children on the inline axis.
- `paddingBlock="large-400"` adds vertical padding.

Grid docs:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/grid.md:17-20`:

```md
The grid component organizes content in a matrix of rows and columns to create responsive page layouts.

Grid follows the CSS grid layout pattern and supports flexible column configurations, gap spacing, and alignment properties for precise layout control. For simpler linear layouts, use stack.
```

`s-box maxInlineSize="200px" maxBlockSize="200px"`:

- Constrains the illustration box.
- Uses logical CSS dimensions: inline size is width in normal horizontal writing modes; block size is height.

Box docs:

`refs/shopify-docs/docs/api/app-home/web-components/layout-and-structure/box.md:16-20`:

```md
The box component provides a generic, flexible container for custom designs and layouts. Use box to apply styling like backgrounds, padding, borders, or border radius when existing components don't meet your needs, or to nest and group other components.

Box contents maintain their natural size, making it especially useful within layout components that would otherwise stretch their children.
```

`s-image aspectRatio="1/0.5" src="..." alt="..."`:

- Renders the empty-state illustration.
- `aspectRatio` reserves/controls layout proportions.
- `alt` gives screen-reader text for the graphic.

Image docs:

`refs/shopify-docs/docs/api/app-home/web-components/media-and-visuals/image.md:17-19`:

```md
The image component embeds images within the interface with control over presentation and loading behavior.

Images support responsive sizing, alt text for accessibility, aspect ratio control, and loading states for progressive enhancement.
```

`s-grid justifyItems="center" maxBlockSize="450px" maxInlineSize="450px"`:

- Constrains and centers the textual content and action.
- Keeps the empty-state copy from stretching too wide.

`s-heading`:

`refs/shopify-docs/docs/api/app-home/web-components/typography-and-content/heading.md:17-20`:

```md
The heading component renders hierarchical titles to communicate the structure and organization of page content.

Heading levels adjust automatically based on nesting within parent section components, ensuring meaningful and accessible page outlines without manual level management.
```

`s-paragraph`:

`refs/shopify-docs/docs/api/app-home/web-components/typography-and-content/paragraph.md:15-19`:

```md
The paragraph component displays blocks of text content and can contain inline elements like buttons, links, or emphasized text.

Paragraphs support alignment options and can wrap inline components to create rich, formatted content blocks.
```

`s-stack gap="small-200" justifyContent="center" padding="base" paddingBlockEnd="none" direction="inline"`:

- Creates an inline action row.
- Centers the CTA.
- Adds spacing around the button except at block end.

`s-button href="/app/qrcodes/new" variant="primary"`:

Button docs:

`refs/shopify-docs/docs/api/app-home/web-components/actions/button.md:13-18`:

```md
The button component triggers actions or events, such as submitting forms, opening dialogs, or navigating to other pages.

Buttons support various visual styles, tones, and interaction patterns to communicate intent and hierarchy. They can also function as links, guiding users to internal or external destinations.
```

Relevant attributes:

- `href` means the button navigates to the create route.
- `variant="primary"` gives it high emphasis.
- This button is normal empty-state content, not a page/title-bar slot, because it has no `slot` attribute.

## Element Attribute Notes

Attributes used by both components:

- `accessibilityLabel`: Polaris prop exposed as camelCase JSX attribute. Provides screen-reader context.
- `padding`, `paddingBlock`, `paddingBlockEnd`: Polaris spacing tokens using logical block/inline directions.
- `inlineSize`, `blockSize`, `maxInlineSize`, `maxBlockSize`: logical CSS sizing, direction-aware equivalents of width/height constraints.
- `gap`: Polaris spacing token for grid/stack child spacing.
- `justifyItems`, `justifyContent`, `alignItems`: layout alignment controls; grid and stack map them to CSS grid/flex-like concepts.
- `href`: makes buttons, links, and clickables navigational.
- `variant`: controls visual hierarchy for buttons.
- `tone`: semantic color/status for components like badges and icons.
- `icon`/`type`: icon names from Shopify's icon set. `s-badge` uses `icon`; `s-icon` uses `type`.
- `objectFit`: image fitting behavior inside its box.
- `aspectRatio`: image aspect ratio for predictable layout.

## Practical Conclusions For This Route

- `QrCodeTable` is correct for QR code index data because Shopify tables handle desktop table and mobile list presentation.
- `listSlot="primary"` is important. Without it, the mobile/list layout would not know that the Title column is the main row identity.
- The empty state follows Shopify's App Home composition: clear explanation plus prominent create CTA.
- The page-level `Create QR code` button belongs in `slot="primary-action"`; the empty-state `Create QR code` button does not, because it is contextual body content shown only when the collection is empty.
- If adding filters later, use the table `filters` slot, as shown by the index-table docs: `slot="filters"` on controls placed above the table.
- If adding table row selection later, follow the index-table composition's `clickDelegate`/checkbox pattern.
