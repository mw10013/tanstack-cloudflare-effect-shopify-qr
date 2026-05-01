# QR Form Title Flash on Save — Research

## Symptom

Editing the title of an existing QR code and hitting Save causes the title input to briefly revert to the old value before settling on the edited value.

## Root Cause

Three mechanisms interact to produce the flash:

### 1. `useForm` calls `formApi.update(opts)` on every render

`refs/tan-form/packages/react-form/src/useForm.tsx:264-266`
```typescript
useIsomorphicLayoutEffect(() => {
  formApi.update(opts)
})
```
No dependency array — runs after every React render. `opts.defaultValues` reflects the current render's `defaultValues`, which is derived directly from `loaderData`.

### 2. `update()` resets form values when `defaultValues` changes and form is untouched

`refs/tan-form/packages/form-core/src/FormApi.ts:1479-1507`
```typescript
const shouldUpdateValues =
  options.defaultValues &&
  !evaluate(options.defaultValues, oldOptions.defaultValues) &&
  !this.state.isTouched
```
If the incoming `defaultValues` differ from the stored ones **and** no field has been touched, the form is reset to the new `defaultValues`.

### 3. `form.reset(variables)` clears `isTouched` before `router.invalidate`

`refs/tan-form/packages/form-core/src/FormApi.ts:1523-1544`

`reset(values)` updates `this.options.defaultValues` to `values` and calls `getDefaultFormState(...)`, which initializes all field meta with `isTouched: false`. Form-level `isTouched` is derived as `fieldMetaValues.some(f => f.isTouched)` — after reset, it is `false`.

## Failure Sequence

Current `onSuccess` order:
```
form.reset(variables)          // stores defaultValues = "New Title", clears isTouched
shopify.saveBar.hide(...)
router.invalidate({ sync: true })  // triggers loader re-run
```

| Step | loaderData.form.title | opts.defaultValues (render) | stored defaultValues | isTouched | update() action |
|---|---|---|---|---|---|
| After `form.reset(variables)` | Old | — | **New** | **false** | — |
| Stale render during invalidation | **Old** | **Old** | New | false | differ + !touched → **reset to Old** ← FLASH |
| Loader completes | New | New | Old (set by update) | false | differ + !touched → reset to New |

The stale render during invalidation passes `opts.defaultValues = "Old Title"` to `update()`. Because `reset` already cleared `isTouched`, `shouldUpdateValues` is `true`, and the form field snaps back to the old title.

## Fix

Move `form.reset(variables)` to **after** `router.invalidate` resolves:

```typescript
onSuccess: async (result, variables) => {
  await shopify.saveBar.hide(qrCodeSaveBarId);
  if (result.handle !== handle) {
    await navigate({ to: "/app/qrcodes/$handle", params: { handle: result.handle } });
    return;
  }
  await router.invalidate({ sync: true });
  form.reset(variables);
},
```

With `isTouched` still `true` during the invalidation (user touched the form, reset not yet called), `update()`'s `shouldUpdateValues` condition fails at the `!isTouched` check — the form holds "New Title" throughout. After invalidation, `form.reset(variables)` explicitly re-bases the defaults to the saved values and clears state cleanly.

### Why the `result.handle === handle` guard is no longer needed for `form.reset`

The `reset` call only executes on the same-handle path (navigate returns early on handle change), so the guard is implicit. The old guard was:
```typescript
if (result.handle === handle) {
  form.reset(variables);
}
```
After the reorder it becomes unconditional within the same-handle branch.
