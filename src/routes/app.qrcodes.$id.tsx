import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useHydrated } from "@tanstack/react-router";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Option, Schema } from "effect";

import * as Domain from "@/lib/Domain";
import { QrRepository } from "@/lib/QrRepository";
import { QrService } from "@/lib/QrService";
import { CurrentSession } from "@/lib/CurrentSession";
import { shopifyServerFnMiddleware } from "@/lib/ShopifyServerFnMiddleware";

declare module "react" {
  // oxlint-disable-next-line typescript-eslint/no-namespace -- React JSX augmentation
  namespace JSX {
    interface IntrinsicElements {
      "ui-save-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<HTMLElement & { show: () => void; hide: () => void }>;
      };
    }
  }
}

interface ShopifyPickerProduct {
  readonly id: string;
  readonly title: string;
  readonly images: readonly { readonly altText?: string | null; readonly originalSrc?: string | null }[];
  readonly variants: readonly { readonly id: string }[];
}

declare global {
  interface Window {
    readonly shopify?: {
      readonly resourcePicker?: (options: {
        readonly type: "product";
        readonly action: "select";
        readonly filter: { readonly variants: true };
        readonly selectionIds: readonly { readonly id: string; readonly variants: readonly { readonly id: string }[] }[];
      }) => Promise<readonly ShopifyPickerProduct[] | undefined>;
    };
  }
}

const QrFormInput = Schema.Struct({
  routeId: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  productId: Schema.NonEmptyString,
  productVariantId: Schema.NonEmptyString,
  destination: Domain.QrCodeDestination,
});

const DeleteQrInput = Schema.Struct({
  id: Domain.QrCodeId,
});

interface QrFormState {
  readonly id: string | null;
  readonly handle: string | null;
  readonly title: string;
  readonly productId: string;
  readonly productVariantId: string;
  readonly productTitle: string | null;
  readonly productImage: string | null;
  readonly productAlt: string | null;
  readonly destination: Domain.QrCodeDestination;
  readonly image: string | null;
  readonly scanUrl: string | null;
  readonly destinationUrl: string | null;
  readonly shop: string;
}

const fieldError = (errors: unknown[]) => errors.map((error) => error instanceof Error ? error.message : String(error)).join(", ");

const loadQrCode = createServerFn({ method: "GET" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator((input: { readonly id: string }) => input)
  .handler(({ data: { id }, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const session = yield* CurrentSession;
        const repository = yield* QrRepository;
        const service = yield* QrService;
        const shop = yield* Schema.decodeUnknownEffect(Domain.Shop)(session.shop);
        if (id === "new") {
          return {
            id: null,
            handle: null,
            title: "",
            productId: "",
            productVariantId: "",
            productTitle: null,
            productImage: null,
            productAlt: null,
            destination: "product",
            image: null,
            scanUrl: null,
            destinationUrl: null,
            shop,
          } satisfies QrFormState;
        }
        const handle = yield* Schema.decodeUnknownEffect(Domain.QrCodeHandle)(id);
        const qrCodeOption = yield* repository.findByHandle(handle);
        if (Option.isNone(qrCodeOption)) return yield* Effect.fail(new Error("QR code not found"));
        const qrCode = qrCodeOption.value;
        const image = yield* service.getQrCodeImage(qrCode.handle, shop).pipe(Effect.catchTag("QrServiceError", () => Effect.succeed(null)));
        const scanUrl = yield* service.getScanUrl(qrCode.handle, shop);
        const destinationUrl = yield* service.getDestinationUrl(qrCode, shop).pipe(Effect.catchTag("QrServiceError", () => Effect.succeed(null)));
        return {
          id: qrCode.id,
          handle: qrCode.handle,
          title: qrCode.title,
          productId: qrCode.productId,
          productVariantId: qrCode.productVariantId,
          productTitle: qrCode.productTitle,
          productImage: qrCode.productImage,
          productAlt: qrCode.productAlt,
          destination: qrCode.destination,
          image,
          scanUrl,
          destinationUrl,
          shop,
        } satisfies QrFormState;
      }),
    ),
  );

const saveQrCode = createServerFn({ method: "POST" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator(Schema.toStandardSchemaV1(QrFormInput))
  .handler(({ data, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const repository = yield* QrRepository;
        const service = yield* QrService;
        const input = yield* Schema.decodeUnknownEffect(Domain.QrCodeUpsert)({
          title: data.title,
          productId: data.productId,
          productVariantId: data.productVariantId,
          destination: data.destination,
        });
        const errors = service.validate(input);
        if (Object.keys(errors).length > 0) return { ok: false, errors } as const;
        const handle = data.routeId === "new" ? yield* service.generateHandle(input.title) : yield* Schema.decodeUnknownEffect(Domain.QrCodeHandle)(data.routeId);
        const saved = yield* repository.save(handle, input);
        return { ok: true, handle: saved.handle } as const;
      }),
    ),
  );

const deleteQrCode = createServerFn({ method: "POST" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator(Schema.toStandardSchemaV1(DeleteQrInput))
  .handler(({ data: { id }, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const repository = yield* QrRepository;
        yield* repository.deleteById(id);
        return { ok: true } as const;
      }),
    ),
  );

export const Route = createFileRoute("/app/qrcodes/$id")({
  loader: ({ params }) => loadQrCode({ data: { id: params.id } }),
  component: QrCodeForm,
});

function QrCodeForm() {
  const loaderData = Route.useLoaderData();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const isHydrated = useHydrated();
  const saveBarRef = React.useRef<HTMLElement & { show: () => void; hide: () => void }>(null);
  const defaultValues = React.useMemo(() => ({
    routeId: id,
    title: loaderData.title,
    productId: loaderData.productId,
    productVariantId: loaderData.productVariantId,
    destination: loaderData.destination,
  }), [id, loaderData.destination, loaderData.productId, loaderData.productVariantId, loaderData.title]);
  const [selectedProduct, setSelectedProduct] = React.useState({
    title: loaderData.productTitle,
    image: loaderData.productImage,
    alt: loaderData.productAlt,
  });
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const form = useForm({
    defaultValues,
    validators: { onSubmit: Schema.toStandardSchemaV1(QrFormInput) },
    onSubmit: ({ value }) => {
      setIsSaving(true);
      setServerErrors({});
      void saveQrCode({ data: value })
        .then((result) => {
          if (!result.ok) {
            setServerErrors(Object.fromEntries(Object.entries(result.errors).filter((entry): entry is [string, string] => entry[1] !== undefined)));
            return;
          }
          void navigate({ to: "/app/qrcodes/$id", params: { id: result.handle } });
        })
        .finally(() => {
          setIsSaving(false);
        });
    },
  });
  const values = form.state.values;
  const isDirty = JSON.stringify(values) !== JSON.stringify(defaultValues);
  const productAdminId = values.productId.split("/").at(-1) ?? "";
  const productUrl = values.productId ? `shopify://admin/products/${productAdminId}` : "";

  React.useEffect(() => {
    form.reset(defaultValues);
    setSelectedProduct({ title: loaderData.productTitle, image: loaderData.productImage, alt: loaderData.productAlt });
    setServerErrors({});
  }, [defaultValues, form, loaderData.productAlt, loaderData.productImage, loaderData.productTitle]);

  React.useEffect(() => {
    if (isDirty) saveBarRef.current?.show();
    else saveBarRef.current?.hide();
  }, [isDirty]);

  const selectProduct = () => {
    const picker = window.shopify?.resourcePicker;
    if (!picker) return;
    void picker({
      type: "product",
      action: "select",
      filter: { variants: true },
      selectionIds: values.productId ? [{ id: values.productId, variants: values.productVariantId ? [{ id: values.productVariantId }] : [] }] : [],
    }).then((products) => {
      const product = products?.[0];
      const variantId = product?.variants[0]?.id;
      if (!product || !variantId) return;
      form.setFieldValue("productId", product.id);
      form.setFieldValue("productVariantId", variantId);
      setSelectedProduct({ title: product.title, image: product.images[0]?.originalSrc ?? null, alt: product.images[0]?.altText ?? null });
      setServerErrors((current) => ({ ...current, productId: "", productVariantId: "" }));
    });
  };

  const removeProduct = () => {
    form.setFieldValue("productId", "");
    form.setFieldValue("productVariantId", "");
    setSelectedProduct({ title: null, image: null, alt: null });
  };

  const deleteCurrent = () => {
    if (!loaderData.id) return;
    setIsDeleting(true);
    void deleteQrCode({ data: { id: loaderData.id } })
      .then(() => navigate({ to: "/app" }))
      .finally(() => {
        setIsDeleting(false);
      });
  };

  const reset = () => {
    form.reset(defaultValues);
    setSelectedProduct({ title: loaderData.productTitle, image: loaderData.productImage, alt: loaderData.productAlt });
    setServerErrors({});
  };

  return (
    <>
      <ui-save-bar ref={saveBarRef} id="qr-code-form">
        <button variant="primary" onClick={() => void form.handleSubmit()} disabled={isSaving} />
        <button onClick={reset} />
      </ui-save-bar>
      <s-page heading={loaderData.handle ? loaderData.title : "Create QR code"}>
        <s-link href="/app" slot="breadcrumb-actions">QR codes</s-link>
        {loaderData.id && isHydrated && (
          <s-button slot="secondary-actions" onClick={deleteCurrent} {...(isDeleting ? { loading: true } : {})}>Delete</s-button>
        )}
        <s-section heading="QR code information">
          <s-stack gap="base">
            <form.Field name="title">
              {(field) => (
                <s-text-field
                  label="Title"
                  details="Only store staff can see this title"
                  error={serverErrors.title || fieldError(field.state.meta.errors)}
                  autocomplete="off"
                  name={field.name}
                  value={field.state.value}
                  onInput={(event) => {
                    field.handleChange(event.currentTarget.value);
                  }}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
            <form.Field name="destination">
              {(field) => (
                <s-stack gap="base" alignItems="start">
                  <s-select
                    name={field.name}
                    label="Scan destination"
                    value={field.state.value}
                    error={serverErrors.destination || fieldError(field.state.meta.errors)}
                    onChange={(event) => {
                      field.handleChange(event.currentTarget.value as Domain.QrCodeDestination);
                    }}
                    onBlur={field.handleBlur}
                  >
                    <s-option value="product" selected={field.state.value === "product"}>Link to product page</s-option>
                    <s-option value="cart" selected={field.state.value === "cart"}>Link to checkout page with product in the cart</s-option>
                  </s-select>
                  {loaderData.destinationUrl && <s-link href={loaderData.destinationUrl} target="_blank">Go to destination URL</s-link>}
                </s-stack>
              )}
            </form.Field>
            <s-stack gap="small-400">
              <s-stack direction="inline" gap="small-100" justifyContent="space-between">
                <s-text color="subdued">Product</s-text>
                {values.productId && <s-link onClick={removeProduct}>Clear</s-link>}
              </s-stack>
              {values.productId ? (
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-clickable href={productUrl} target="_blank" accessibilityLabel={`Go to the product page for ${selectedProduct.title ?? "selected product"}`} borderRadius="base">
                      <s-box padding="small-200" border="base" borderRadius="base" background="subdued" inlineSize="38px" blockSize="38px">
                        {selectedProduct.image ? <s-image src={selectedProduct.image} alt={selectedProduct.alt ?? ""} /> : <s-icon size="base" type="product" />}
                      </s-box>
                    </s-clickable>
                    <s-link href={productUrl} target="_blank">{selectedProduct.title}</s-link>
                  </s-stack>
                  {isHydrated && <s-button onClick={selectProduct}>Change</s-button>}
                </s-stack>
              ) : (
                isHydrated && <s-button onClick={selectProduct}>Select product</s-button>
              )}
              {(serverErrors.productId || serverErrors.productVariantId) && <s-text tone="critical">{serverErrors.productId || serverErrors.productVariantId}</s-text>}
            </s-stack>
          </s-stack>
        </s-section>
        <s-box slot="aside">
          <s-section heading="Preview">
            <s-stack gap="base">
              <s-box padding="base" border="none" borderRadius="base" background="subdued">
                {loaderData.image ? (
                  <s-image aspectRatio="1/0.8" src={loaderData.image} alt="The QR code for the current form" />
                ) : (
                  <s-stack direction="inline" alignItems="center" justifyContent="center" blockSize="198px">
                    <s-text color="subdued">See a preview once you save</s-text>
                  </s-stack>
                )}
              </s-box>
              <s-stack gap="small" direction="inline" alignItems="center" justifyContent="space-between">
                <s-button disabled={!loaderData.handle} href={loaderData.scanUrl ?? undefined} target="_blank">Go to public URL</s-button>
                <s-button disabled={!loaderData.image} href={loaderData.image ?? undefined} download="" variant="primary">Download</s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </s-box>
      </s-page>
    </>
  );
}
