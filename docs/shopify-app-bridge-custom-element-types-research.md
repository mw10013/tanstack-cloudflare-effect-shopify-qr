# Shopify App Bridge Custom Element Types Research

Question: why do we manually define JSX types for `s-app-nav` and `ui-save-bar`? Shouldn't Shopify define those web components through Polaris or the App Bridge CDN?

## Short Answer

Yes, Shopify defines the runtime custom elements. No, the CDN scripts do not make TypeScript understand JSX tags.

`s-app-nav` and `ui-save-bar` are real App Bridge custom elements registered by `https://cdn.shopify.com/shopifycloud/app-bridge.js`. The manual code in `src/routes/app.tsx` is not defining the components at runtime. It is only teaching React 19 + TypeScript that these custom tags are valid JSX.

This is not ideal in route code. The idiomatic shape is either:

1. Use Shopify React wrappers from `@shopify/app-bridge-react`, especially `NavMenu` and `SaveBar`.
2. If using raw custom elements, centralize JSX augmentation in one app-level `.d.ts` or small type module, backed by Shopify's official `@shopify/app-bridge-types` / `@shopify/app-bridge-react` exports.

## Runtime Source

Shopify docs say Polaris web components are native web components loaded from the Polaris CDN script:

`refs/shopify-docs/docs/api/app-home.md:50-56`:

```md
You add UI to your app using web components. Shopify provides a set of components which match the Shopify design system in its Polaris library.

Because Polaris components are built on the Web Components standard, they work like native HTML elements. You can use them in any framework or with vanilla JavaScript, just like you would a `<button>` or `<input>`.

For TypeScript users, Shopify provides a companion npm library for Polaris web components types, available at `@shopify/polaris-types`.
```

Polaris setup explicitly loads `polaris.js`:

`refs/shopify-docs/docs/api/app-home/web-components.md:20-28`:

```html
<head>
  <meta name="shopify-api-key" content="%SHOPIFY_API_KEY%" />
  <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
</head>
```

App Bridge is separate. Shopify docs say App Bridge web components affect Shopify Admin chrome outside the iframe:

`refs/shopify-docs/docs/api/app-home.md:111-115`:

```md
With App Bridge web components you can add UI elements like title bars and navigation menus to the main Shopify admin area outside of your app's iframe.
```

The App Bridge CDN provides APIs and App Bridge types are separate from Polaris types:

`refs/shopify-docs/docs/api/app-home.md:80-86`:

```md
The APIs in Shopify's App Bridge library provide provide this functionality through the `shopify` global variable.

When the App Bridge script is included in your app, you don't need to set up or configure any additional authentication to use these APIs.

For TypeScript users, Shopify provides a companion npm library for App Bridge types, available at `@shopify/app-bridge-types`.
```

`refs/shopify-app-js/packages/apps/shopify-app-react-router/src/react/components/AppProvider/AppProvider.tsx:100-106` matches that split:

```tsx
export function AppProvider(props: AppProviderProps) {
  return (
    <>
      {props.embedded && <AppBridge apiKey={props.apiKey} />}
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
      {props.children}
    </>
  );
}
```

`refs/shopify-app-js/packages/apps/shopify-app-react-router/src/react/components/AppProvider/AppProvider.tsx:132-136` loads App Bridge separately:

```tsx
<script
  src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
  data-api-key={apiKey}
/>
```

## Proof `s-app-nav` Is App Bridge Runtime

The readable App Bridge CDN artifact registers `s-app-nav`:

`docs/app-bridge-readable.js:650-681`:

```js
const n={
name:t,attributes:{},children:[{
name:"a",attributes:dn,children:[en.anyText]},{
name:"s-link",attributes:dn,children:[en.anyText]}]};
...
const u=document.querySelectorAll("s-app-nav, ui-nav-menu");u.length>1&&console.warn(`Multiple navigation menu elements detected (${
u.length} total). Only one <s-app-nav> or <ui-nav-menu> should be used per page. Found: ${
Array.from(u).map(t=>t.tagName.toLowerCase()).join(", ")}`);
```

`docs/app-bridge-readable.js:761` shows the registration name:

```js
const hn=fn("s-app-nav")
```

Interpretation: `s-app-nav` is not a local component and not a Polaris-only element. App Bridge knows it and maps its child links into Shopify Admin navigation.

## Proof `ui-save-bar` Is App Bridge Runtime

Shopify documents raw `<ui-save-bar>` as a programmatic Save Bar approach:

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:16-24`:

```md
The Save Bar API indicates that a form on the current page has unsaved information. You can implement save bar behavior in one of two ways:

1. Automatic (form attribute): Add the `data-save-bar` attribute to a `form` element.

2. Programmatic (web component): Add a `<ui-save-bar>` element with a unique `id` to your page, then use `shopify.saveBar.show(id)`, `shopify.saveBar.hide(id)`, and `shopify.saveBar.toggle(id)` to control it.
```

The docs include a raw JSX example:

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:189-221`:

```tsx
function SaveBarExample() {
  const saveBarId = 'settings-save-bar';
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const handleFieldInput = () => {
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true);
      shopify.saveBar.show(saveBarId);
    }
  };

  return (
    <s-page heading="Settings">
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
```

The readable CDN artifact also names `ui-save-bar`:

`docs/app-bridge-readable.js:761-769`:

```js
const hn=fn("s-app-nav"),pn=z,mn=[{
name:"button",attributes:{...ln,variant:{
value:nn.oneOf(["primary"])},disabled:{
value:nn.flag()},
...
name:"ui-save-bar",attributes:{
id:{
value:nn.anyString()},discardConfirmation:{
value:nn.flag()}},children:[...mn]};
```

Interpretation: raw `<ui-save-bar>` is documented and runtime-defined by App Bridge. The manual TypeScript definition is not inventing the element.

## Why TypeScript Still Needs Help

Browser custom element registration and TypeScript JSX typing are separate systems.

Runtime:

```tsx
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />
```

This lets the browser execute App Bridge and define custom elements.

Compile time:

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": ...;
      "ui-save-bar": ...;
    }
  }
}
```

This lets TypeScript accept those JSX tags.

The CDN cannot directly augment local TypeScript's `JSX.IntrinsicElements`; TypeScript only sees installed `.d.ts` files and imported types during compilation.

## Why This App Has Manual Types

Current route code:

`src/routes/app.tsx:20-23`:

```ts
 * App Bridge activation: `s-app-nav` is not covered by `@shopify/polaris-types`
 * (it's an App Bridge element). Template uses it untyped and accepts the
 * error (`refs/shopify-app-template/app/routes/app.tsx:20-23`); we augment it
 * locally so this subtree typechecks.
```

`src/routes/app.tsx:36-43`:

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      "ui-save-bar": UISaveBarAttributes;
    }
  }
}
```

This is a compile-time workaround for raw custom element usage.

## Idiomatic Shopify Path For Navigation

Shopify's React Router docs use the App Bridge React wrapper, not raw `s-app-nav`:

`refs/shopify-docs/docs/api/shopify-app-react-router.md:153-179`:

```tsx
import {NavMenu} from '@shopify/app-bridge-react';
import {AppProvider} from '@shopify/shopify-app-react-router/react';

export default function App() {
  const {apiKey} = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/additional">Additional page</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
```

`@shopify/app-bridge-react` implements that wrapper as a typed alias for `ui-nav-menu`:

`refs/shopify-bridge/packages/app-bridge-react/src/components/NavMenu.tsx:1-25`:

```tsx
import type {UINavMenuAttributes} from '@shopify/app-bridge-types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ui-nav-menu': UINavMenuAttributes & {
        ref?: LegacyRef<UINavMenuElement | null>;
      };
    }
  }
}

export const NavMenu =
  'ui-nav-menu' as unknown as React.ComponentType<NavMenuProps>;
```

Interpretation: Shopify's idiomatic React API is `NavMenu`, which renders `ui-nav-menu`. Raw `s-app-nav` is supported by the CDN, but it is not what the React Router docs choose.

## Idiomatic Shopify Path For Save Bar

Shopify gives two idiomatic options:

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:28-30`:

```md
* Standard forms: Use the `data-save-bar` attribute on a `form` element to automatically detect and manage unsaved changes with save and discard actions.
* Custom state management: Use the `<ui-save-bar>` web component with `shopify.saveBar` methods to control the save bar based on application state that isn't tied to a single form.
* Data protection: Prevent accidental data loss by prompting users when leaving a page with unsaved changes using `shopify.saveBar.leaveConfirmation()`.
```

`@shopify/app-bridge-react` also provides a `SaveBar` wrapper around the same raw element:

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:39-45`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-save-bar` element.
 * It is used to display a contextual save bar to signal dirty state in the app.
 */
export const SaveBar = forwardRef(function InternalSaveBar(
```

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:83-99`:

```tsx
return (
  <ui-save-bar
    {...rest}
    ref={(saveBar) => {
      setSaveBar(saveBar);
```

Interpretation: `SaveBar` is only a React wrapper. Raw `<ui-save-bar>` is still the underlying primitive.

## Recommendation

Manual JSX definitions in route files are not the best final shape.

For `s-app-nav`, prefer `NavMenu` from `@shopify/app-bridge-react` unless we specifically need `s-app-nav` behavior. This follows Shopify's React Router docs and avoids hand-typing the raw tag.

For `ui-save-bar`, prefer one of these:

1. Standard native form: use `data-save-bar` and no raw `ui-save-bar`.
2. Custom dirty state: use `SaveBar` from `@shopify/app-bridge-react`.
3. Raw web component: keep `<ui-save-bar>`, but move JSX augmentation out of route modules and source the attributes from Shopify's types.

The current manual definitions are therefore a TypeScript integration workaround, not evidence that Shopify failed to define the components. The better cleanup is centralizing or replacing the typings, not trying to define the web components ourselves.
