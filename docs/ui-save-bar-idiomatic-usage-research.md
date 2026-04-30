# `ui-save-bar` Idiomatic Usage Research

## Question

How should this app use Shopify Save Bar idiomatically if we want raw `<ui-save-bar>` instead of the React `<SaveBar>` wrapper, without hand-written element method types in route code?

## Sources Checked

- `refs/shopify-docs/docs/api/app-home/apis/save-bar.md`
- `refs/shopify-docs/docs/api/app-home/apis/user-interface-and-interactions/save-bar-api.md`
- `refs/shopify-docs/docs/api/app-home/patterns/templates/details.md`
- `refs/shopify-docs/docs/api/app-home/patterns/templates/settings.md`
- `refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx`
- `refs/shopify-bridge/packages/app-bridge-react/src/index.ts`

## Shopify Documents Two Modes

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:16-24`:

```md
The Save Bar API indicates that a form on the current page has unsaved information. You can implement save bar behavior in one of two ways:

1. **Automatic (form attribute)**: Add the `data-save-bar` attribute to a [`form` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form). The save bar displays automatically when there are unsaved changes. The [`submit`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event) event fires when the merchant clicks **Save**, and the [`reset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reset_event) event fires when the merchant clicks **Discard**. This is the simplest approach for standard form workflows.

2. **Programmatic (web component)**: Add a `<ui-save-bar>` element with a unique `id` to your page, then use `shopify.saveBar.show(id)`, `shopify.saveBar.hide(id)`, and `shopify.saveBar.toggle(id)` to control it. The `<ui-save-bar>` element can contain `<button>` children for **Save** (with `variant="primary"`) and **Discard**. This approach gives you full control over when the save bar appears and what happens when merchants interact with it.

**Caution:**

Choose one approach for each form. Don't combine `data-save-bar` on a form with programmatic `shopify.saveBar` methods — each approach manages save bar visibility independently and using both can cause unexpected behavior.
```

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:28-30`:

```md
* **Standard forms:** Use the `data-save-bar` attribute on a `form` element to automatically detect and manage unsaved changes with save and discard actions.
* **Custom state management:** Use the `<ui-save-bar>` web component with `shopify.saveBar` methods to control the save bar based on application state that isn't tied to a single form.
* **Data protection:** Prevent accidental data loss by prompting users when leaving a page with unsaved changes using `shopify.saveBar.leaveConfirmation()`.
```

Facts:

- `data-save-bar` is the most idiomatic Shopify path for plain/native form workflows.
- `<ui-save-bar>` plus `shopify.saveBar.*(id)` is the documented path for custom state management.
- This route has custom state: TanStack Form state plus Shopify resource picker product state, so programmatic Save Bar remains defensible.
- Do not mix `data-save-bar` and programmatic `shopify.saveBar` for the same form.

## Raw `ui-save-bar` Docs Pattern

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

  const handleDiscard = () => {
    setHasUnsavedChanges(false);
    shopify.saveBar.hide(saveBarId);
  };

  const handleSave = async () => {
    // Save to your backend
    setHasUnsavedChanges(false);
    shopify.saveBar.hide(saveBarId);
  };

  return (
    <s-page heading="Settings">
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
```

Facts:

- Shopify's raw-web-component TSX examples do not call `.show()` / `.hide()` on an element ref.
- They call `shopify.saveBar.show(id)` and `shopify.saveBar.hide(id)`.
- Therefore route code should not need local `HTMLElement & { show; hide }` types at all.

## Leave Confirmation Docs Pattern

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:285-289`:

```tsx
const handleCustomNavigation = async () => {
  // Call leaveConfirmation before programmatic navigation
  await shopify.saveBar.leaveConfirmation();
  // Navigation proceeds after merchant confirms or if no unsaved changes
  window.location.href = '/other-page';
};
```

Facts:

- `leaveConfirmation()` is documented before custom navigation.
- It does not require an element ref.
- It pairs cleanly with either `data-save-bar` or programmatic `<ui-save-bar>` if a save bar is visible.

## Template Docs Prefer `data-save-bar` For Standard Forms

`refs/shopify-docs/docs/api/app-home/patterns/templates/details.md:614-632`:

```tsx
<form
  data-save-bar
  onSubmit={(event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formEntries = Object.fromEntries(formData);
    console.log("Form submitted", formEntries);
  }}
  onReset={(event) => {
    console.log("Changes discarded");
  }}
>
```

`refs/shopify-docs/docs/api/app-home/patterns/templates/settings.md:33-49` says settings forms should add `data-save-bar` and handle `onSubmit` / `onReset`.

Facts:

- If this QR form can be represented as real native inputs, `data-save-bar` is Shopify's cleanest UX integration.
- Product picker changes are not obviously represented as native form input changes, so this needs runtime proof before switching.

## React Wrapper Source

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:39-58`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-save-bar` element.
 * It is used to display a contextual save bar to signal dirty state in the app.
 */
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

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:83-99`:

```tsx
return (
  <ui-save-bar
    {...rest}
    ref={(saveBar) => {
      setSaveBar(saveBar);
```

Facts:

- The React wrapper is not a different UI primitive; it renders `<ui-save-bar>`.
- The wrapper's `open` prop is wrapper-specific. Raw `<ui-save-bar>` docs do not use `open`.
- Dropping the wrapper means we should control visibility with `shopify.saveBar.show(id)` / `hide(id)`, not recreate the wrapper with local element method types.

## Official Types Path

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:9-17`:

```tsx
import type {UISaveBarAttributes} from '@shopify/app-bridge-types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ui-save-bar': UISaveBarAttributes & {
        ref?: LegacyRef<UISaveBarElement | null>;
      };
    }
  }
}
```

`refs/shopify-bridge/packages/app-bridge-react/src/index.ts:10-15`:

```ts
export type {SaveBarProps} from './components/SaveBar';
export {SaveBar} from './components/SaveBar';

export {useAppBridge} from './hooks/useAppBridge';

export type * from '@shopify/app-bridge-types';
```

Facts:

- Shopify's own wrapper uses official `UISaveBarAttributes` and `UISaveBarElement` types.
- If raw `<ui-save-bar>` is used directly, any JSX augmentation should be centralized and based on Shopify's official types.
- Route-local hand-written `HTMLElement & { show; hide }` types are not idiomatic and are unnecessary if using `shopify.saveBar.show(id)` / `hide(id)`.

## Recommendation

For this route, the idiomatic raw-web-component direction is:

```tsx
<ui-save-bar id="qr-code-form">
  <button variant="primary" onClick={() => void form.handleSubmit()} />
  <button onClick={() => void reset()} />
</ui-save-bar>
```

Then drive visibility from form dirtiness with App Bridge API methods:

```tsx
React.useEffect(() => {
  void shopify.saveBar[isDirty ? "show" : "hide"]("qr-code-form");
}, [isDirty, shopify.saveBar]);
```

Typing should be solved once, not in the route:

```ts
import type { UISaveBarAttributes } from "@shopify/app-bridge-react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ui-save-bar": UISaveBarAttributes;
    }
  }
}
```

That augmentation should live with the existing Shopify JSX augmentations, currently `src/routes/app.tsx`, or in a dedicated project-level `.d.ts` file if the repo wants intrinsic element types outside the `/app` route subtree.

## Current Conclusion

- Yes, using raw `<ui-save-bar>` is Shopify-documented and avoids the React wrapper.
- No, we should not add route-local manual element method types.
- Correct raw implementation should use `shopify.saveBar.show(id)` and `shopify.saveBar.hide(id)`, not element refs.
- The only typing needed should come from Shopify's official types, centralized once.
- Before switching to `data-save-bar`, test whether resource picker product changes are detected as dirty; otherwise programmatic `<ui-save-bar>` is the better fit.
