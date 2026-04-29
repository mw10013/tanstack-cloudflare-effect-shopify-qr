# Research: app.qrcodes.$id.tsx Production Patterns

## Current Issues Identified

### 1. Window Interface Hack for Shopify ResourcePicker

**Current Pattern (lines 22-33):**
```typescript
declare global {
  interface Window {
    readonly shopify?: {
      readonly resourcePicker?: (options: {...}) => Promise<readonly ShopifyPickerProduct[] | undefined>;
    };
  }
}
```

**Usage (line 214):**
```typescript
const picker = window.shopify?.resourcePicker;
if (!picker) return;
void picker({...});
```

**Problem:** Extending `Window` interface with Shopify-specific types is a hack that:
- Pollutes the global Window type
- Doesn't properly type the `shopify` object
- Relies on runtime availability without compile-time guarantees

### 2. Proper Shopify App Bridge Pattern

**From `refs/shopify-bridge` research:**

The `useAppBridge()` hook from `@shopify/app-bridge-react` returns the App Bridge instance directly. The `resourcePicker` API is available on this instance.

**Correct Pattern:**
```typescript
import { useAppBridge } from "@shopify/app-bridge-react";

function QrCodeForm() {
  const shopify = useAppBridge();

  const selectProduct = async () => {
    const products = await shopify.resourcePicker({
      type: "product",
      action: "select",
      filter: { variants: true },
      selectionIds: [...],
    });
    // products is typed based on the 'type' parameter
    const product = products?.[0];
    // ...
  };
}
```

**Key Points:**
- `shopify.resourcePicker()` returns `Promise<Product[] | Collection[] | ProductVariant[]>` based on `type`
- No need to extend Window interface
- Types available from `@shopify/app-bridge-types` package
- The ResourcePicker component was removed in favor of this API (see changelog)

**Reference:** `refs/shopify-bridge/packages/app-bridge-types/tests/types.test.ts`
```typescript
const products = await shopify.resourcePicker({type: 'product'});
// products is typed as Product[]
```

### 3. Proper Type Imports

Install and import types from `@shopify/app-bridge-types`:

```typescript
import type { Product } from "@shopify/app-bridge-types";
```

This eliminates the need for custom `ShopifyPickerProduct` interface.

## Additional Production Patterns from refs/shopify-app-js

### Session Storage (for Cloudflare D1)

**From `refs/shopify-app-js/packages/apps/session-storage/`:**

Use the `SessionStorage` interface:
```typescript
export interface SessionStorage {
  storeSession(session: Session): Promise<boolean>;
  loadSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  deleteSessions(ids: string[]): Promise<boolean>;
  findSessionsByShop(shop: string): Promise<Session[]>;
}
```

For Cloudflare D1, implement a custom adapter similar to `DrizzleSessionStorageSQLite`.

### Authentication Flow

**From `refs/shopify-app-js/packages/apps/shopify-app-react-router/`:**

```typescript
const { admin, session, sessionToken } = await authenticate.admin(request);

// admin.graphql() for API calls
const response = await admin.graphql(
  `#graphql
  query { ... }
  `,
  { variables: {} }
);
```

### GraphQL Client Usage

The `admin` context provides a typed GraphQL client. No need to manually construct GraphQL calls.

## Recommended Changes for app.qrcodes.$id.tsx

1. **Remove Window interface extension** (lines 22-33)
2. **Remove custom `ShopifyPickerProduct` interface** (lines 15-20)
3. **Import types from `@shopify/app-bridge-types`**
4. **Use `shopify.resourcePicker()` directly** instead of `window.shopify?.resourcePicker`
5. **Remove the `picker` null check** - `useAppBridge()` always returns the instance if called within App Bridge provider

## Example Refactored selectProduct Function

```typescript
import type { Product } from "@shopify/app-bridge-types";

const selectProduct = async () => {
  const products = await shopify.resourcePicker({
    type: "product",
    action: "select",
    filter: { variants: true },
    selectionIds: values.productId
      ? [{ id: values.productId, variants: values.productVariantId ? [{ id: values.productVariantId }] : [] }]
      : [],
  });

  const product = products?.[0];
  const variantId = product?.variants[0]?.id;
  if (!product || !variantId) return;

  form.setFieldValue("productId", product.id);
  form.setFieldValue("productVariantId", variantId);
  setSelectedProduct({
    title: product.title,
    image: product.images[0]?.originalSrc ?? null,
    alt: product.images[0]?.altText ?? null,
  });
  setServerErrors((current) => ({ ...current, productId: "", productVariantId: "" }));
};
```

## References

- `refs/shopify-bridge/packages/app-bridge-types/` - Type definitions
- `refs/shopify-bridge/packages/app-bridge-react/src/hooks/useAppBridge.ts` - Hook implementation
- `refs/shopify-app-js/packages/apps/shopify-app-react-router/` - Server-side patterns
- `refs/shopify-app-js/packages/apps/session-storage/` - Session storage implementations
