# App Bridge Web Components vs React Wrappers Research

Question: from first principles, should app code use App Bridge web components directly or use `@shopify/app-bridge-react` wrappers when wrappers exist? Typing convenience is secondary. The main concern is cleaner, clearer, correct, maintainable code and whether the wrapper package introduces extra lag or bugs.

## Conclusion

Prefer direct App Bridge web components by default.

Use React wrappers only when the wrapper provides meaningful semantic value over the underlying element. Today, most `@shopify/app-bridge-react` wrappers are extremely thin. For `NavMenu` and `TitleBar`, they are basically typed aliases for custom element tag names. For `SaveBar` and `Modal`, they add React lifecycle/effect behavior, but that extra behavior is also a new failure surface.

Recommended policy:

1. Use raw `<ui-*>` / `<s-*>` App Bridge web components for stable, declarative markup.
2. Use App Bridge APIs directly for imperative state: `shopify.saveBar.show(id)`, `shopify.saveBar.hide(id)`, `shopify.modal.show(id)`, etc.
3. Use wrappers only when the wrapper materially improves code shape for a specific component.
4. Do not use wrappers just to avoid TypeScript JSX setup; solve typings centrally instead.

## First Principles

### 1. Avoid Redundant Abstractions

If an abstraction only renames an underlying primitive, it usually makes code less direct without improving correctness.

`NavMenu` source:

`refs/shopify-bridge/packages/app-bridge-react/src/components/NavMenu.tsx:18-25`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-nav-menu` element.
 * It is used to create a navigation menu for your app.
 */
export const NavMenu =
  'ui-nav-menu' as unknown as React.ComponentType<NavMenuProps>;
```

`TitleBar` source:

`refs/shopify-bridge/packages/app-bridge-react/src/components/TitleBar.tsx:18-26`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-title-bar` element.
 */
export const TitleBar =
  'ui-title-bar' as unknown as React.ComponentType<TitleBarProps>;
```

These wrappers do not encode React business logic. They mostly change spelling:

```tsx
<NavMenu>...</NavMenu>
```

instead of:

```tsx
<ui-nav-menu>...</ui-nav-menu>
```

From a programming/DX perspective, the direct custom element is clearer because it exposes the actual platform primitive being used.

### 2. Prefer One Mental Model

Polaris App Home UI is web-component-first. Shopify docs describe web components as native-like elements:

`refs/shopify-docs/docs/api/app-home.md:50-56`:

```md
You add UI to your app using web components. Shopify provides a set of components which match the Shopify design system in its Polaris library.

Because Polaris components are built on the Web Components standard, they work like native HTML elements. You can use them in any framework or with vanilla JavaScript, just like you would a `<button>` or `<input>`.
```

App Bridge web components also exist to project UI into Shopify Admin chrome:

`refs/shopify-docs/docs/api/app-home.md:111-115`:

```md
With App Bridge web components you can add UI elements like title bars and navigation menus to the main Shopify admin area outside of your app's iframe.
```

If most UI is already custom elements, mixing in React wrappers creates two component models for the same kind of thing:

```tsx
<s-page>
<s-section>
<s-button>
<NavMenu>
<SaveBar>
```

The clearer model is:

```tsx
<s-page>
<s-section>
<s-button>
<ui-nav-menu>
<ui-save-bar>
```

That makes it obvious which things are Shopify custom elements and keeps framework usage boring: React renders custom elements; App Bridge/Polaris own behavior.

### 3. Lifecycle Ownership Should Stay With The Platform Primitive

Custom elements already have lifecycle: connect, disconnect, attributes, events, methods. React wrappers that mirror custom element state can introduce a second lifecycle layer.

`SaveBar` wrapper source:

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:45-58`:

```tsx
export const SaveBar = forwardRef(function InternalSaveBar(
  {open, onShow, onHide, children, ...rest}: SaveBarProps,
  forwardedRef: ForwardedRef<UISaveBarElement>,
) {
  const [saveBar, setSaveBar] = useState<UISaveBarElement | null>();

  useEffect(() => {
    if (!saveBar) return;
    if (open) {
      saveBar.show();
    } else {
      saveBar.hide();
    }
  }, [saveBar, open]);
```

`SaveBar` also adds event listener effects and an unmount cleanup:

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:60-81`:

```tsx
useEffect(() => {
  if (!saveBar || !onShow) return;
  saveBar.addEventListener('show', onShow);
  return () => {
    saveBar.removeEventListener('show', onShow);
  };
}, [saveBar, onShow]);

useEffect(() => {
  if (!saveBar) return;
  return () => {
    saveBar.hide();
  };
}, [saveBar]);
```

This looks nice because it lets code say `open={dirty}`. But the wrapper now owns a synchronization contract between React state, a custom element ref, App Bridge's remote save bar state, and React unmount timing.

The direct version is lower-level but more explicit:

```tsx
<ui-save-bar id="product-form-save-bar">
  <button variant="primary" onClick={save}>Save</button>
  <button onClick={discard}>Discard</button>
</ui-save-bar>
```

```ts
if (dirty) shopify.saveBar.show("product-form-save-bar");
else shopify.saveBar.hide("product-form-save-bar");
```

The explicit version is usually easier to debug because there is no wrapper synchronization layer. If a save bar remains open, the code path that called `show` / `hide` is visible.

### 4. Wrapper APIs Can Drift From Platform APIs

The platform primitive is the CDN App Bridge API. The wrapper package is a second release artifact with its own build, changelog, and API decisions.

`@shopify/app-bridge-react` README says the CDN is always latest:

`refs/shopify-bridge/packages/app-bridge-react/README.md:57-64`:

```md
Include the `app-bridge.js` script tag in your app.

The `app-bridge.js` script is CDN-hosted, so your app always gets the latest version of it.

<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
```

The React package is separately versioned:

`refs/shopify-bridge/packages/app-bridge-react/package.json:1-5`:

```json
{
  "name": "@shopify/app-bridge-react",
  "version": "4.2.10",
  "description": "React wrappers for the Shopify App Bridge library"
}
```

The wrapper package is small, but still has its own build/output surface:

`refs/shopify-bridge/packages/app-bridge-react/package.json:20-31`:

```json
"sideEffects": false,
"scripts": {
  "build": "vite build",
  "test": "vitest run --passWithNoTests",
  "type-check": "tsc -p tsconfig.json --noEmit"
},
"main": "./build/cjs/index.cjs",
"types": "./build/types/esm/index.d.ts",
"module": "./build/esm/index.js"
```

Important signal: the package test script is `vitest run --passWithNoTests`, and its Vite config has an explicit note:

`refs/shopify-bridge/packages/app-bridge-react/vite.config.ts:261`:

```ts
// TODO: bring this back when we have tests in this package. Consider using happy-dom
```

That does not mean the package is bad. It does mean wrapper behavior should not be treated as more reliable than the underlying custom elements/API.

## Issue Signals From Shopify Repo

Public issue search shows wrapper-adjacent bugs remain open. These are not proof that direct web components avoid every problem, because many issues involve App Bridge itself. But they show that wrappers can add or expose their own React-specific failure modes.

Issue list query:

```bash
gh issue list --repo Shopify/shopify-app-bridge --search "app-bridge-react OR SaveBar OR NavMenu OR Modal" --state all --limit 30
```

Relevant open results included:

```txt
532 OPEN SaveBar from @shopify/app-bridge-react doesn't close itself when unmounted
529 OPEN NavMenu is not show in Shopify Admin
496 OPEN app-bridge-react "Unknown property 'variant' found" on Modal/TitleBar/button
```

Issue `532` describes a React lifecycle mismatch:

```md
The SaveBar stays visible even after unmounting the component.

As a result, the SaveBar stays open after the user has Saved / Discarded, which breaks navigation because navigation is blocked while a SaveBar is open.
```

A commenter says they replaced the wrapper locally:

```md
FWIW we worked around this locally by implementing our own version of `SaveBar` as it's just a thin wrapper around the `shopify.saveBar` API.

The fix was to use `useLayoutEffect` as opposed to `useEffect` as the former is executed while the `saveBar` ref is still part of the DOM during unmount.
```

Issue `529` reports `NavMenu` not rendering in Admin even though other App Bridge features work:

```md
The NavMenu component from @shopify/app-bridge-react does not render when the app is deployed to Shopify Admin. The navigation menu fails to display, and no errors are shown in the console.
```

Issue `496` shows lint/tooling friction around wrapper use with custom attributes on native child buttons:

```md
<Modal>
  <TitleBar>
    <button type="button" variant="primary">
      Save
    </button>
  </TitleBar>
</Modal>

Unknown property 'variant' found
```

Interpretation: wrappers do not eliminate DX/tooling weirdness. Sometimes they move it into places that are harder to reason about because the markup looks like React components but still depends on custom-element semantics inside.

## Component-by-Component Assessment

### Navigation

Wrapper value: low.

`NavMenu` is a typed alias for `ui-nav-menu`. It does not provide state management, event normalization, or behavior. Direct `<ui-nav-menu>` is clearer and has less dependency on wrapper correctness.

Use direct:

```tsx
<ui-nav-menu>
  <a href="/app" rel="home">Home</a>
  <a href="/app/settings">Settings</a>
</ui-nav-menu>
```

Use wrapper only if following a Shopify example exactly is more valuable than directness:

```tsx
<NavMenu>
  <a href="/app" rel="home">Home</a>
  <a href="/app/settings">Settings</a>
</NavMenu>
```

### Title Bar

Wrapper value: low.

`TitleBar` is also a typed alias. Direct `<ui-title-bar>` is more honest and avoids a React-shaped abstraction over custom-element children.

### Save Bar

Wrapper value: mixed.

The wrapper's `open={dirty}` API is attractive because it makes visibility declarative in React terms. But save bars affect Admin-level navigation blocking and are lifecycle-sensitive. The open issue about unmount behavior is exactly the kind of bug caused by adding a React lifecycle synchronization layer.

For simple local state, wrapper can be clean:

```tsx
<SaveBar open={dirty}>
  <button variant="primary" onClick={save}>Save</button>
  <button onClick={discard}>Discard</button>
</SaveBar>
```

For correctness-critical flows, direct API calls are clearer:

```tsx
<ui-save-bar id={saveBarId}>
  <button variant="primary" onClick={save}>Save</button>
  <button onClick={discard}>Discard</button>
</ui-save-bar>
```

```ts
await shopify.saveBar.hide(saveBarId);
```

Recommendation: use direct `ui-save-bar` plus explicit `shopify.saveBar` calls unless the wrapper's `open` prop makes a specific form obviously simpler and unmount behavior is tested.

### Modal

Wrapper value: potentially higher, but higher risk.

`Modal` does more than alias. It portals content into `modal.content` and extracts `ui-title-bar` / `ui-save-bar` children:

`refs/shopify-bridge/packages/app-bridge-react/src/components/Modal.tsx:54-79`:

```tsx
const {titleBar, saveBar, modalContent} = Children.toArray(children).reduce(
  (acc, node) => {
    const nodeName = getNodeName(node);
    const isTitleBar = nodeName === 'ui-title-bar';
    const isSaveBar = nodeName === 'ui-save-bar';
    const belongToModalContent = !isTitleBar && !isSaveBar;
```

This is real React integration value if you want to render rich React content into an App Bridge modal. It is also more complex and therefore more likely to have edge cases.

Recommendation: consider wrapper for modal content only if direct `<ui-modal>` composition is awkward. Otherwise prefer direct element/API.

### useAppBridge

`useAppBridge` is useful and low-risk. It is not a web component wrapper; it is a safe accessor for `window.shopify` with SSR guardrails:

`refs/shopify-bridge/packages/app-bridge-react/src/hooks/useAppBridge.ts:44-53`:

```ts
export function useAppBridge() {
  if (typeof window === 'undefined') {
    return serverProxy as unknown as ShopifyGlobal;
  }
  if (!window.shopify) {
    throw Error(
      'The shopify global is not defined. This likely means the App Bridge script tag was not added correctly to this page',
    );
  }
  return window.shopify;
}
```

Recommendation: using `useAppBridge` is reasonable even if component wrappers are avoided.

## Programming/DX Recommendation

Best default for this app style:

```tsx
<ui-nav-menu>
  <a href="/app" rel="home">Home</a>
  <a href="/app/settings">Settings</a>
</ui-nav-menu>

<ui-save-bar id={saveBarId}>
  <button variant="primary" onClick={save}>Save</button>
  <button onClick={discard}>Discard</button>
</ui-save-bar>
```

Then keep side effects explicit:

```ts
dirty ? shopify.saveBar.show(saveBarId) : shopify.saveBar.hide(saveBarId);
```

This yields cleaner maintenance properties:

- Markup names match runtime custom elements.
- Behavior is owned by App Bridge/Polaris, not a wrapper shim.
- Side effects are visible in app code.
- Fewer dependencies on React wrapper release cadence.
- Fewer hidden lifecycle sync contracts.

When wrappers are justified:

- `Modal`, if portal behavior is needed and tested.
- `SaveBar`, if `open={dirty}` makes a simple page materially clearer and tests cover unmount/navigation behavior.
- `NavMenu` / `TitleBar`, only for consistency with Shopify React examples, not because they provide much technical value.

Final recommendation: do not standardize on `@shopify/app-bridge-react` wrappers for wrapped custom elements. Standardize on direct web components plus centralized typings. Treat wrappers as opt-in escape hatches when they make a specific component simpler enough to justify the extra abstraction.
