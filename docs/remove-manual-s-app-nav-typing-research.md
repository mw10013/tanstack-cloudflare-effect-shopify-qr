# Remove Manual `s-app-nav` Typing Research

Question: how can we remove the manual JSX typing for `s-app-nav` while using raw web components, not React wrappers, and relying on Shopify typings where Shopify provides them?

## Correction

The correct public component is `<s-app-nav>`.

My earlier conclusion to use `<ui-nav-menu>` was too shallow. It followed the checked `@shopify/app-bridge-react` wrapper implementation, but that wrapper/source is not the full public contract. Current Shopify public docs and the App Bridge React 4 migration guide explicitly name `<s-app-nav>` as the navigation API app code should render.

`ui-nav-menu` appears in older/package examples and in type history, but it is not the documented current App Home navigation component. Treat it as legacy/internal unless Shopify documents it as public again.

## Public API Evidence

Shopify's current App Home docs document `App nav` at `https://shopify.dev/docs/api/app-home/app-bridge-web-components/app-nav`.

Fetched doc excerpt:

```md
The app nav component creates a navigation menu for your app. On desktop, the navigation appears in the app nav on the left side of the screen. On Shopify mobile, it appears in a dropdown from the title bar.

Add links to define navigation items. You can designate a home route with `rel="home"` to set the default landing page. To trigger navigation from JavaScript code, use the Navigation API.
```

Same page example:

```html
<s-app-nav>
  <s-link href="/" rel="home">Home</s-link>
  <s-link href="/templates">Templates</s-link>
  <s-link href="/settings">Settings</s-link>
</s-app-nav>
```

Shopify's App Bridge React migration guide also explicitly replaced the old React `NavigationMenu` component with `<s-app-nav>`:

`https://shopify.dev/docs/api/app-bridge/migration-guide-react`:

```md
The navigation menu for your app is now created using the `<s-app-nav>` web component instead of a React component. When using React, you can render this component directly in your JSX.
```

Migration example from the same page:

```jsx
<s-app-nav>
  <s-link href="/">Home</s-link>
  <s-link href="/templates">Templates</s-link>
  <s-link href="/settings">Settings</s-link>
</s-app-nav>
```

Shopify Built for Shopify requirements also reference `s-app-nav`:

`refs/shopify-docs/docs/apps/launch/built-for-shopify/requirements.md:199`:

```md
Use the App Bridge [s-app-nav](https://shopify.dev/docs/api/app-home/app-bridge-web-components/s-app-nav) to integrate your app's primary navigation into the Shopify admin navigation menu.
```

## Official Type Evidence

The latest `@shopify/app-bridge-types` package is `0.7.0`:

```txt
pnpm view @shopify/app-bridge-types@latest version
0.7.0
```

The source package builds its published types by downloading the CDN declaration file:

`refs/shopify-bridge/packages/app-bridge-types/scripts/build.mjs:5-18`:

```js
const CDN_URL = 'https://cdn.shopify.com/shopifycloud/app-bridge.d.ts';
const response = await fetch(CDN_URL);
const types = await response.text();
await writeFile(outFile, types);
```

That CDN declaration currently includes public `s-app-nav` types:

`https://cdn.shopify.com/shopifycloud/app-bridge.d.ts`:

```ts
/**
 * Properties for the app nav element. This element configures the app nav in the Shopify admin.
 * @publicDocs
 */
export interface SAppNavAttributes {
  children?: any;
}
```

The same declaration includes the global element mapping:

```ts
interface AppBridgeElements {
  "ui-modal": UIModalAttributes;
  "s-app-window": SAppWindowAttributes;
  "ui-nav-menu": UINavMenuAttributes;
  "s-app-nav": SAppNavAttributes;
  "ui-save-bar": UISaveBarAttributes;
  "ui-title-bar": UITitleBarAttributes;
  "s-page": SPageAttributes;
}
```

It also globally augments JSX:

```ts
declare global {
  namespace JSX {
    interface IntrinsicElements extends AppBridgeElements {
    }
    interface IntrinsicAttributes extends AppBridgeAttributes {
    }
  }
}
```

Conclusion from types: Shopify does have official `s-app-nav` typings now. Our app should consume `@shopify/app-bridge-types`, not approximate `s-app-nav` locally as generic HTML props.

## Why The Confusion Happened

There are three overlapping surfaces:

1. Public App Home docs: document `<s-app-nav>`.
2. Latest App Bridge CDN/types: include `SAppNavAttributes` and `"s-app-nav"`.
3. `@shopify/app-bridge-react` source in `refs/shopify-bridge`: still has a `NavMenu` alias around `ui-nav-menu`.

`refs/shopify-bridge/packages/app-bridge-react/src/components/NavMenu.tsx:18-25`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-nav-menu` element.
 * It is used to create a navigation menu for your app.
 */
export const NavMenu =
  'ui-nav-menu' as unknown as React.ComponentType<NavMenuProps>;
```

That source explains why `ui-nav-menu` may typecheck through `@shopify/app-bridge-react`, but it should not override the current public docs. We want raw web components and no React wrappers, so the migration guide is more relevant than the wrapper internals.

The linked issue also makes sense in this light. Issue `544` reports that `s-app-nav` was not in `JSX.IntrinsicElements`, while `ui-nav-menu` worked. That likely reflected a type-loading/versioning gap in the user's setup, not proof that `ui-nav-menu` is the right public API.

## Current App Problem

Current code manually approximates `s-app-nav`:

`src/routes/app.tsx:36-42`:

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

That is the part to remove. The element should stay `<s-app-nav>`.

The selected JSDoc is only partially right. It says `s-app-nav` is not covered by `@shopify/polaris-types`, which is true because this is App Bridge, not Polaris. But it misses that `@shopify/app-bridge-types` now provides `SAppNavAttributes` and includes `"s-app-nav"` in `AppBridgeElements`.

## Likely Fix

Use `@shopify/app-bridge-types` directly for App Bridge web component JSX types.

Candidate minimal setup:

```ts
import type {} from "@shopify/app-bridge-types";
import type {} from "@shopify/polaris-types";
```

Then remove the manual `"s-app-nav"` declaration and run `pnpm typecheck`.

If React 19 does not honor the package's global `namespace JSX` augmentation in this app, the next-best fallback is a centralized type bridge that aliases Shopify's official exported type rather than retyping the element manually:

```ts
import type { SAppNavAttributes, UISaveBarAttributes } from "@shopify/app-bridge-types";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": SAppNavAttributes;
      "ui-save-bar": UISaveBarAttributes;
    }
  }
}
```

That still involves a local React JSX augmentation, but it does not manually type Shopify's web component contract. It only adapts Shopify's official type package to React 19's JSX lookup if needed.

## Verification Plan

1. Add/ensure `@shopify/app-bridge-types` is in `tsconfig.json` `compilerOptions.types` or imported type-only from app entry code.
2. Remove the manual generic `"s-app-nav"` entry.
3. Keep `<s-app-nav>` and use `<s-link>` children, matching docs.
4. Run `pnpm typecheck`.
5. If `s-app-nav` still fails, add the centralized React module augmentation using `SAppNavAttributes` from `@shopify/app-bridge-types`.

## Recommendation

Keep `<s-app-nav>`. Do not switch to `<ui-nav-menu>`.

Remove manual typing by making TypeScript load Shopify's `@shopify/app-bridge-types`. If React 19 still needs a bridge, centralize it and source the element attributes from Shopify's `SAppNavAttributes`, not from `React.HTMLAttributes<HTMLElement>`.
