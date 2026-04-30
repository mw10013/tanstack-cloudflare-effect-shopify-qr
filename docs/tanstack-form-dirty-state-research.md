# TanStack Form Dirty State Research

Question: can `src/routes/app.qrcodes.$handle.tsx` stop manually comparing current values to `defaultValues` and rely on TanStack Form dirty state instead?

## Verdict

- `state.isDirty` is the wrong signal for this route.
- `state.isDefaultValue` is the right TanStack Form concept for non-persistent dirty state, but it is **not** a safe drop-in replacement in this route as currently written.
- The current manual comparison is correct today because it tracks the exact save payload and immediately re-bases against fresh loader data after a successful save.
- If we want to use TanStack Form's built-in diff, we should first change the save flow to call `form.reset(savedValues)` on successful same-handle saves. After that, `useStore(form.store, (state) => !state.isDefaultValue)` becomes sound.

## Why The Earlier Draft Was Too Weak

- It correctly distinguished persistent `isDirty` from non-persistent `isDefaultValue`.
- It did not analyze this route's actual save/revalidation flow.
- It treated `all relevant fields are registered` as the main caveat.
- In this route, field registration is fine. The real blocker is that TanStack Form does not automatically re-base `isDefaultValue` on touched forms when `defaultValues` change through `useForm` rerenders.

## Route Analysis

The route's form state is based on exactly four persisted values.

`src/routes/app.qrcodes.$handle.tsx:158-163`:

```tsx
const defaultValues = {
  title: loaderData.title,
  productId: loaderData.productId,
  productVariantId: loaderData.productVariantId,
  destination: loaderData.destination,
} satisfies typeof QrFormInput.Encoded;
```

Those same four values are what gets submitted.

`src/routes/app.qrcodes.$handle.tsx:172-175` and `src/routes/app.qrcodes.$handle.tsx:197-199`:

```tsx
const saveMutation = useMutation({
  mutationFn: (data: typeof defaultValues) =>
    saveQrCode({ data: { handle, ...data } }),
});

onSubmit: ({ value }) => {
  saveMutation.mutate(value);
},
```

The current dirty check also tracks exactly those same four values.

`src/routes/app.qrcodes.$handle.tsx:201-208`:

```tsx
const isDirty = useStore(
  form.store,
  (state) =>
    state.values.title !== defaultValues.title ||
    state.values.productId !== defaultValues.productId ||
    state.values.productVariantId !== defaultValues.productVariantId ||
    state.values.destination !== defaultValues.destination,
);
```

That is not generic guesswork. It is an exact diff against the persisted form payload.

All four save-bar-relevant values are registered as TanStack Form fields and stay mounted in this route.

- `title`: `src/routes/app.qrcodes.$handle.tsx:309-324`
- `destination`: `src/routes/app.qrcodes.$handle.tsx:325-360`
- `productId`: `src/routes/app.qrcodes.$handle.tsx:361-362`
- `productVariantId`: `src/routes/app.qrcodes.$handle.tsx:363-364`

So the field-registration caveat is not the important one here.

The product picker also writes through TanStack Form, not outside it.

`src/routes/app.qrcodes.$handle.tsx:223-249`:

```tsx
form.setFieldValue("productId", product.id);
form.setFieldValue("productVariantId", variantId);
```

The local `pickedProduct` state is display-only. It is not part of the saved payload and should not drive the save bar.

## What TanStack Form Actually Guarantees

TanStack Form docs explicitly say `isDirty` is persistent and `isDefaultValue` is the non-persistent alternative.

`refs/tan-form/docs/framework/react/guides/basic-concepts.md:112-142`:

```md
- **isDirty**: is `true` once the field's value is changed, even if it's reverted to the default.
- **isDefaultValue**: is `true` when the field's current value is the default value

We have chosen the persistent 'dirty' state model. However, we have introduced the `isDefaultValue` flag to also support a non-persistent 'dirty' state.

const nonPersistentIsDirty = !isDefaultValue
```

Form-level `isDefaultValue` is defined as all tracked fields matching defaults.

`refs/tan-form/docs/reference/interfaces/FormState.md:200-208`:

````md
### isDefaultValue

```ts
isDefaultValue: boolean;
```

A boolean indicating if all of the form's fields are the same as default values.
````

The implementation matches the docs.

`refs/tan-form/packages/form-core/src/FormApi.ts:1133-1142`:

```ts
const isDefaultValue =
  evaluate(
    curFieldVal,
    getBy(this.options.defaultValues, fieldName),
  ) ||
  evaluate(
    curFieldVal,
    this.getFieldInfo(fieldName)?.instance?.options.defaultValue,
  )
```

`refs/tan-form/packages/form-core/src/FormApi.ts:1226-1237`:

```ts
const isDefaultValue = fieldMetaValues.every(
  (field) => field.isDefaultValue,
)

const isDirty = fieldMetaValues.some((field) => field.isDirty)
const isPristine = !isDirty
```

Tests confirm `isDefaultValue` flips back to `true` when a field value is restored.

`refs/tan-form/packages/form-core/tests/FormApi.spec.ts:3336-3361`:

```ts
lastNameField.setValue('')
expect(form.state.isDefaultValue).toBe(false)

lastNameField.setValue('hawk')
expect(form.state.isDefaultValue).toBe(true)
```

So the library-level answer is straightforward:

- `state.isDirty` answers: has any tracked field ever changed in this form lifecycle?
- `state.isDefaultValue` answers: do tracked fields currently match defaults?

If this were only about the meaning of the flags, `!state.isDefaultValue` would win.

## The Real Problem In This Route

This route does not only edit fields. It also revalidates the route after a successful save on the same handle.

`src/routes/app.qrcodes.$handle.tsx:175-185`:

```tsx
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
```

That means `loaderData` changes, so the route re-renders with new `defaultValues`.

But TanStack Form only pushes new `defaultValues` into form state while the form is untouched.

`refs/tan-form/packages/form-core/src/FormApi.ts:1474-1488`:

```ts
this.options = options

const shouldUpdateValues =
  options.defaultValues &&
  !evaluate(options.defaultValues, oldOptions.defaultValues) &&
  !this.state.isTouched

const shouldUpdateState =
  !evaluate(options.defaultState, oldOptions.defaultState) &&
  !this.state.isTouched

if (!shouldUpdateValues && !shouldUpdateState) return
```

TanStack Form keeps the new `options.defaultValues`, but if the form was already touched it does not update the store.

That matters here because the user has necessarily touched the form before saving.

## Local Reproduction Of The Edge Case

I reproduced this directly in the workspace against `refs/tan-form` with `pnpm exec tsx`.

```ts
const form = new FormApi({ defaultValues: { name: 'one' } })
form.mount()

const field = new FieldApi({ form, name: 'name' })
field.mount()

form.setFieldValue('name', 'two')
form.update({ defaultValues: { name: 'two' } })

console.log(form.state.isDefaultValue) // false
console.log(field.getMeta().isDefaultValue) // false
console.log(form.options.defaultValues) // { name: 'two' }
```

Observed result:

- the new defaults are stored in `form.options.defaultValues`
- `form.state.isDefaultValue` stays `false`
- field meta stays stale until a later field write or an explicit `form.reset(...)`

This means `!state.isDefaultValue` is not a clean substitute for the current manual comparator in this route as currently written.

## Why The Current Manual Comparison Works Better Today

The current route compares current `state.values` against render-time `defaultValues` from `loaderData`.

When same-handle save succeeds:

1. the save completes
2. the route invalidates
3. `loaderData` refreshes
4. `defaultValues` in render update immediately
5. the manual comparison becomes `false` immediately

That re-basing happens even though TanStack Form keeps touched state.

So the current manual comparison is not a hack. It is the one implementation in this route that already follows the post-save loader refresh correctly.

## Concrete Paths Forward

### Path 1: Keep The Current Manual Comparison

This is the smallest correct choice.

Use it if you want:

- no save-flow refactor
- no dependence on TanStack Form's touched/default rebasing behavior
- exact tracking of the current persisted payload

### Path 2: Switch To `!state.isDefaultValue`, But Also Re-Base On Save

If we want the built-in TanStack Form diff, we should reset the form to the saved values on successful same-handle saves.

Why this works:

- `form.reset(values)` updates `options.defaultValues`
- `form.reset(values)` also resets field meta immediately
- that makes `state.isDefaultValue` accurate again without waiting for another field write

`refs/tan-form/packages/form-core/src/FormApi.ts:1523-1543`:

```ts
reset = (values?: TFormData, opts?: { keepDefaultValues?: boolean }) => {
  if (values && !opts?.keepDefaultValues) {
    this.options = {
      ...this.options,
      defaultValues: values,
    }
  }

  this.baseStore.setState(() =>
    getDefaultFormState({
      ...(this.options.defaultState as any),
      values:
        values ??
        this.options.defaultValues ??
        this.options.defaultState?.values,
      fieldMetaBase,
    }),
  )
}
```

In route terms, the shape would be:

```tsx
const hasUnsavedChanges = useStore(
  form.store,
  (state) => !state.isDefaultValue,
);

const saveMutation = useMutation({
  mutationFn: (data: typeof defaultValues) =>
    saveQrCode({ data: { handle, ...data } }),
  onSuccess: async (result, variables) => {
    if (result.handle === handle) {
      form.reset(variables);
    }

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

That path is reasonable because this save handler persists the submitted values as-is; there is no server-side normalization in `saveQrCode` that would make `variables` diverge from what is stored.

## Recommendation

- Do not replace the current manual comparator with `state.isDirty`.
- Do not replace the current manual comparator with `!state.isDefaultValue` unless the save flow also calls `form.reset(savedValues)` on successful same-handle saves.
- For the route exactly as it exists now, keep the manual comparison.
- If you want to simplify toward TanStack Form built-ins, do it as a two-part change:
  1. re-base the form on successful same-handle save with `form.reset(savedValues)`
  2. then switch the save-bar selector to `!state.isDefaultValue`
