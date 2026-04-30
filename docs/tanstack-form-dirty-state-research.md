# TanStack Form Dirty State Research

Question: Does TanStack Form track form dirty state so `src/routes/app.qrcodes.$handle.tsx` does not need to manually compare current values with `defaultValues`?

## Short Answer

- Yes, TanStack Form exposes form-level `state.isDirty` and `state.isPristine`.
- But `state.isDirty` is persistent: once a field changes, it stays dirty even if the value is changed back to the default.
- For Shopify Save Bar visibility, the current manual comparison is closer to the wanted behavior because the Save Bar should hide when the form values match the persisted defaults again.
- TanStack Form also exposes `state.isDefaultValue`, derived from every field's `meta.isDefaultValue`; that is the built-in value-diff equivalent. Prefer `!state.isDefaultValue` over hand-comparing fields if every relevant field is registered/tracked by TanStack Form.

## Current Code

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

This implements non-persistent dirty state: `true` only while current values differ from `defaultValues`.

## Docs Evidence

`refs/tan-form/docs/reference/interfaces/FormState.md:218-226` documents form-level `isDirty`:

````md
### isDirty

```ts
isDirty: boolean;
```

A boolean indicating if any of the form's fields' values have been modified by the user. Evaluates `true` if the user have modified at least one of the fields. Opposite of `isPristine`.
````

`refs/tan-form/docs/reference/interfaces/FormState.md:308-316` documents form-level `isPristine`:

````md
### isPristine

```ts
isPristine: boolean;
```

A boolean indicating if none of the form's fields' values have been modified by the user. Evaluates `true` if the user have not modified any of the fields. Opposite of `isDirty`.
````

`refs/tan-form/docs/framework/react/guides/basic-concepts.md:110-116` documents field metadata:

```md
There are four states in the metadata that can be useful for seeing how the user interacts with a field:

- **isTouched**: is `true` once the user changes or blurs the field
- **isDirty**: is `true` once the field's value is changed, even if it's reverted to the default. Opposite of `isPristine`
- **isPristine**: is `true` until the user changes the field's value. Opposite of `isDirty`
- **isBlurred**: is `true` once the field loses focus (is blurred)
- **isDefaultValue**: is `true` when the field's current value is the default value
```

`refs/tan-form/docs/framework/react/guides/basic-concepts.md:124-143` explains the key distinction:

````md
## Understanding 'isDirty' in Different Libraries

Non-Persistent `dirty` state

- **Libraries**: React Hook Form (RHF), Formik, Final Form.
- **Behavior**: A field is 'dirty' if its value differs from the default. Reverting to the default value makes it 'clean' again.

Persistent `dirty` state

- **Libraries**: Angular Form, Vue FormKit.
- **Behavior**: A field remains 'dirty' once changed, even if reverted to the default value.

We have chosen the persistent 'dirty' state model. However, we have introduced the `isDefaultValue` flag to also support a non-persistent 'dirty' state.

```ts
const { isDefaultValue, isTouched } = field.state.meta

// The following line will re-create the non-persistent `dirty` functionality.
const nonPersistentIsDirty = !isDefaultValue
```
````

`refs/tan-form/docs/reference/type-aliases/FieldMetaDerived.md:123-131` documents field-level `isDefaultValue`:

````md
### isDefaultValue

```ts
isDefaultValue: boolean;
```

A flag indicating whether the field's current value is the default value
````

## Implementation Evidence

`refs/tan-form/packages/form-core/src/FormApi.ts:1133-1142` computes each field's `isDefaultValue` by comparing the current field value against form `defaultValues` or field `defaultValue`:

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

`refs/tan-form/packages/form-core/src/FormApi.ts:1226-1237` computes form-level derived state from field meta:

```ts
const isTouched = fieldMetaValues.some((field) => field.isTouched)
const isBlurred = fieldMetaValues.some((field) => field.isBlurred)
const isDefaultValue = fieldMetaValues.every(
  (field) => field.isDefaultValue,
)

const isDirty = fieldMetaValues.some((field) => field.isDirty)
const isPristine = !isDirty
```

This confirms:

- `state.isDirty` answers: has any tracked field ever changed from pristine during this form lifecycle?
- `state.isDefaultValue` answers: do all tracked fields currently equal their configured defaults?

## Recommendation

For this route, do not replace the manual comparison with `state.isDirty` if the Save Bar should hide after reverting values back to defaults.

Use this if all Save Bar-relevant fields are registered/tracked by TanStack Form:

```tsx
const isDirty = useStore(form.store, (state) => !state.isDefaultValue);
```

Keep the current manual comparison if there is any doubt that all relevant fields are registered in TanStack Form field meta. `state.isDefaultValue` is derived from `fieldMetaValues`; unregistered values can exist in `state.values` without contributing to `fieldMetaValues`.
