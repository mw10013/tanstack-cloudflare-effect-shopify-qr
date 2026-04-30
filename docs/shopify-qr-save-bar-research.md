# Shopify QR Save Bar Research

Question: `QrCodeSaveBarVisibility` in `src/routes/app.qrcodes.$handle.tsx` uses a renderless component with two effects to show/hide the App Bridge save bar. Can we remove it, and what is the idiomatic Shopify pattern?

## Short Answer

- Yes, remove `QrCodeSaveBarVisibility`.
- Use the Save Bar API directly: keep `<ui-save-bar id={qrCodeSaveBarId}>` and call `shopify.saveBar.show(id)`, `shopify.saveBar.hide(id)`, and `shopify.saveBar.leaveConfirmation()` from route logic.
- Do not use `@shopify/app-bridge-react`'s `SaveBar` wrapper here. It exists in `refs/shopify-bridge`, but Shopify's App Home docs point at the direct web-component/API pattern.
- Do not switch to `data-save-bar` for this route. This form has TanStack Form state, resource-picker-driven hidden fields, custom discard behavior, and programmatic navigation confirmation.
- Use TanStack Form `useStore` instead of `form.Subscribe` because dirty state is needed inside component logic, not just for rendering UI.

## Current Problem

`src/routes/app.qrcodes.$handle.tsx:263-284` previously rendered a `form.Subscribe` whose only child was a null component:

```tsx
<form.Subscribe
  selector={(state) =>
    state.values.title !== defaultValues.title ||
    state.values.productId !== defaultValues.productId ||
    state.values.productVariantId !== defaultValues.productVariantId ||
    state.values.destination !== defaultValues.destination
  }
>
  {(isDirty) => (
    <QrCodeSaveBarVisibility isDirty={isDirty} shopify={shopify} />
  )}
</form.Subscribe>
<ui-save-bar id={qrCodeSaveBarId}>
  <button
    variant="primary"
    onClick={() => void form.handleSubmit()}
    disabled={saveMutation.isPending}
  />
  <button onClick={() => void reset()} />
</ui-save-bar>
```

`src/routes/app.qrcodes.$handle.tsx:499-518`:

```tsx
function QrCodeSaveBarVisibility({
  isDirty,
  shopify,
}: {
  readonly isDirty: boolean;
  readonly shopify: ReturnType<typeof useAppBridge>;
}) {
  React.useEffect(() => {
    void shopify.saveBar[isDirty ? "show" : "hide"](qrCodeSaveBarId);
  }, [isDirty, shopify]);

  React.useEffect(
    () => () => {
      void shopify.saveBar.hide(qrCodeSaveBarId);
    },
    [shopify],
  );

  return null;
}
```

The lifecycle intent is valid: sync dirty state to save bar visibility and hide the save bar on route unmount. The component shape is the problem. It converts a form subscription into a renderless React component just to run imperative App Bridge API calls.

## Shopify Save Bar API

Shopify documents two approaches: automatic form tracking or programmatic web-component control.

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:16-24`:

```md
The Save Bar API indicates that a form on the current page has unsaved information. You can implement save bar behavior in one of two ways:

1. **Automatic (form attribute)**: Add the `data-save-bar` attribute to a [`form` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form). The save bar displays automatically when there are unsaved changes. The [`submit`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event) event fires when the merchant clicks **Save**, and the [`reset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reset_event) event fires when the merchant clicks **Discard**. This is the simplest approach for standard form workflows.

2. **Programmatic (web component)**: Add a `<ui-save-bar>` element with a unique `id` to your page, then use `shopify.saveBar.show(id)`, `shopify.saveBar.hide(id)`, and `shopify.saveBar.toggle(id)` to control it. The `<ui-save-bar>` element can contain `<button>` children for **Save** (with `variant="primary"`) and **Discard**. This approach gives you full control over when the save bar appears and what happens when merchants interact with it.

**Caution:**

Choose one approach for each form. Don't combine `data-save-bar` on a form with programmatic `shopify.saveBar` methods — each approach manages save bar visibility independently and using both can cause unexpected behavior.
```

This route already uses the programmatic API and should stay there.

`src/routes/app.qrcodes.$handle.tsx:172-185`:

```tsx
const saveMutation = useMutation({
  mutationFn: (data: typeof defaultValues) =>
    saveQrCode({ data: { handle, ...data } }),
  onSuccess: async (result) => {
    await shopify.saveBar.hide(qrCodeSaveBarId);
    if (result.handle !== handle) {
      await navigate({
        to: "/app/qrcodes/$handle",
        params: { handle: result.handle },
      });
      return;
    }
    await router.invalidate({ sync: true });
  },
});
```

`src/routes/app.qrcodes.$handle.tsx:242-260`:

```tsx
const reset = async () => {
  if (handle === "new") {
    await shopify.saveBar.hide(qrCodeSaveBarId);
    void navigate({ to: "/app" });
    return;
  }
  form.reset(defaultValues);
  setPickedProduct(null);
  saveMutation.reset();
};

const leave: NonNullable<React.ComponentProps<"s-link">["onClick"]> = (
  event,
) => {
  event.preventDefault();
  void (async () => {
    await shopify.saveBar.leaveConfirmation();
    void navigate({ to: "/app" });
  })();
};
```

Shopify also explicitly describes these use cases.

`refs/shopify-docs/docs/api/app-home/apis/save-bar.md:26-30`:

```md
### Use cases

* **Standard forms:** Use the `data-save-bar` attribute on a `form` element to automatically detect and manage unsaved changes with save and discard actions.
* **Custom state management:** Use the `<ui-save-bar>` web component with `shopify.saveBar` methods to control the save bar based on application state that isn't tied to a single form.
* **Data protection:** Prevent accidental data loss by prompting users when leaving a page with unsaved changes using `shopify.saveBar.leaveConfirmation()`.
```

The QR route is custom state management: dirty state is derived from TanStack Form values and includes product IDs changed by Shopify's resource picker.

## TanStack Form Subscription Shape

TanStack Form docs distinguish logic subscriptions from render subscriptions.

`refs/tan-form/docs/framework/react/guides/reactivity.md:14-17`:

```md
## useStore

The `useStore` hook is perfect when you need to access form values within the logic of your component. `useStore` takes two parameters. First, the form store. Second, a selector to specify the piece of the form you wish to subscribe to.
```

`refs/tan-form/docs/framework/react/guides/reactivity.md:29-52`:

```md
## form.Subscribe

The `form.Subscribe` component is best suited when you need to react to something within the UI of your component. For example, showing or hiding UI based on the value of a form field.
...
The choice between whether to use `useStore` or `form.Subscribe` mainly boils down to your use case. If you're aiming for direct UI updates based on form state, use `form.Subscribe` for its optimization perks. And if you need the reactivity within the logic, then `useStore` is the better choice.
```

The save bar call is not UI rendering inside React. It is imperative App Bridge logic. So `useStore(form.store, selector)` is the better fit than `form.Subscribe` plus a null component.

## Why Not The React Wrapper

`refs/shopify-bridge` includes a `SaveBar` wrapper.

`refs/shopify-bridge/packages/app-bridge-react/CHANGELOG.md:152-159`:

```md
## 4.1.0

### Minor Changes

- #64 `b1fbf2b` Thanks [@henrytao-me](https://github.com/henrytao-me)! - add SaveBar component to declaratively control the contextual save bar
```

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:39-45`:

```tsx
/**
 * This component is a wrapper around the App Bridge `ui-save-bar` element.
 * It is used to display a contextual save bar to signal dirty state in the app.
 *
 * @see {@link https://shopify.dev/docs/api/app-bridge-library/react-components/save-bar}
 */
export const SaveBar = forwardRef(function InternalSaveBar(
```

But the wrapper is not necessary here and hides the same imperative lifecycle behind React effects.

`refs/shopify-bridge/packages/app-bridge-react/src/components/SaveBar.tsx:49-81`:

```tsx
const [saveBar, setSaveBar] = useState<UISaveBarElement | null>();

useEffect(() => {
  if (!saveBar) return;
  if (open) {
    saveBar.show();
  } else {
    saveBar.hide();
  }
}, [saveBar, open]);

useEffect(() => {
  if (!saveBar) return;
  return () => {
    saveBar.hide();
  };
}, [saveBar]);
```

Given Shopify's App Home Save Bar API docs, the most direct route code is clearer: render `<ui-save-bar>` and call `shopify.saveBar` where route state changes.

## Shopify App JS Scan

Searches under `refs/shopify-app-js/packages` found no relevant matches for `saveBar`, `SaveBar`, `ui-save-bar`, or `data-save-bar`. Matches under `refs/shopify-app-js/node_modules/@shopify/polaris` are old Polaris contextual save bar internals, not app code patterns to copy.

This aligns with App Bridge v4's migration away from older React contextual save bar hooks/components.

`refs/shopify-bridge/packages/app-bridge-react/CHANGELOG.md:171-178`:

```md
- Removed `ContextualSaveBar` component in favour of it being [automatically configured through `form` elements](https://shopify.dev/docs/api/app-bridge-library/apis/contextual-save-bar)
...
- Removed `useContextualSaveBar` hook in favour of it being [automatically configured through `form` elements](https://shopify.dev/docs/api/app-bridge-library/apis/contextual-save-bar)
```

## Recommended Refactor

Use `useStore` to derive dirty state in `QrCodeForm`, call `shopify.saveBar` directly, keep `<ui-save-bar>`, and delete `QrCodeSaveBarVisibility`.

Target shape:

```tsx
const isDirty = useStore(
  form.store,
  (state) =>
    state.values.title !== defaultValues.title ||
    state.values.productId !== defaultValues.productId ||
    state.values.productVariantId !== defaultValues.productVariantId ||
    state.values.destination !== defaultValues.destination,
);

React.useEffect(() => {
  void shopify.saveBar[isDirty ? "show" : "hide"](qrCodeSaveBarId);
}, [isDirty, shopify]);

React.useEffect(
  () => () => {
    void shopify.saveBar.hide(qrCodeSaveBarId);
  },
  [shopify],
);
```

Then render the save bar directly:

```tsx
<ui-save-bar id={qrCodeSaveBarId}>
  <button
    variant="primary"
    onClick={() => void form.handleSubmit()}
    disabled={saveMutation.isPending}
  />
  <button onClick={() => void reset()} />
</ui-save-bar>
```

Keep explicit `shopify.saveBar.hide(qrCodeSaveBarId)` calls after successful save and in the new-record discard path. Shopify docs say `hide` should be called after save/discard, and the route has custom navigation behavior.

## Conclusion

The renderless component should go. The idiomatic minimal fix is direct Save Bar API usage in the route component, with TanStack Form `useStore` feeding the dirty boolean into `shopify.saveBar.show/hide`.
