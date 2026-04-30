import "@/lib/shopifyAppBridgeElements";
import * as React from "react";

import { useAppBridge } from "@shopify/app-bridge-react";
import { revalidateLogic, useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useHydrated, useRouter } from "@tanstack/react-router";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Option, Schema } from "effect";

import { CurrentShopifySession } from "@/lib/CurrentShopifySession";
import * as Domain from "@/lib/Domain";
import { fieldError } from "@/lib/form";
import { QrRepository } from "@/lib/QrRepository";
import { QrService } from "@/lib/QrService";
import { shopifyServerFnMiddleware } from "@/lib/ShopifyServerFnMiddleware";

const QrFormInput = Domain.QrCodeUpsert;
const qrCodeSaveBarId = "qr-code-form";

const SaveQrCodeInput = Schema.Struct({
  handle: Schema.NonEmptyString,
  ...QrFormInput.fields,
});

const DeleteQrInput = Schema.Struct({
  id: Domain.QrCode.fields.id,
});

type QrFormState = Pick<
  Domain.QrCode,
  "title" | "productTitle" | "productImage" | "productAlt" | "destination"
> & {
  readonly id: Domain.QrCode["id"] | null;
  readonly handle: Domain.QrCode["handle"] | null;
  readonly productId: typeof QrFormInput.Encoded.productId;
  readonly productVariantId: typeof QrFormInput.Encoded.productVariantId;
  readonly image: string | null;
  readonly scanUrl: string | null;
  readonly destinationUrl: string | null;
  readonly shop: Domain.Shop;
};

const loadQrCode = createServerFn({ method: "GET" })
  .middleware([shopifyServerFnMiddleware])
  .inputValidator((input: { readonly handle: string }) => input)
  .handler(({ data: { handle }, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const session = yield* CurrentShopifySession;
        const repository = yield* QrRepository;
        const service = yield* QrService;
        const shop = yield* Schema.decodeUnknownEffect(Domain.Shop)(
          session.shop,
        );
        if (handle === "new") {
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
        const qrCodeHandle = yield* Schema.decodeUnknownEffect(
          Domain.QrCodeHandle,
        )(handle);
        const qrCodeOption = yield* repository.findByHandle(qrCodeHandle);
        if (Option.isNone(qrCodeOption))
          return yield* Effect.fail(new Error("QR code not found"));
        const qrCode = qrCodeOption.value;
        const image = yield* service
          .getQrCodeImage(qrCode.handle, shop)
          .pipe(Effect.catchTag("QrServiceError", () => Effect.succeed(null)));
        const scanUrl = yield* service.getScanUrl(qrCode.handle, shop);
        const destinationUrl = yield* service
          .getDestinationUrl(qrCode, shop)
          .pipe(Effect.catchTag("QrServiceError", () => Effect.succeed(null)));
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
  .inputValidator(Schema.toStandardSchemaV1(SaveQrCodeInput))
  .handler(({ data, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const repository = yield* QrRepository;
        const service = yield* QrService;
        const input = {
          title: data.title,
          productId: data.productId,
          productVariantId: data.productVariantId,
          destination: data.destination,
        } satisfies Domain.QrCodeUpsert;
        const handle =
          data.handle === "new"
            ? yield* service.generateHandle(input.title)
            : yield* Schema.decodeUnknownEffect(Domain.QrCodeHandle)(
                data.handle,
              );
        return yield* repository
          .save(handle, input)
          .pipe(Effect.map(({ handle }) => ({ handle })));
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
        return yield* repository.deleteById(id);
      }),
    ),
  );

export const Route = createFileRoute("/app/qrcodes/$handle")({
  loader: ({ params }) => loadQrCode({ data: { handle: params.handle } }),
  component: QrCodeForm,
});

function QrCodeForm() {
  const loaderData = Route.useLoaderData();
  const { handle } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const isHydrated = useHydrated();
  const defaultValues = {
    title: loaderData.title,
    productId: loaderData.productId,
    productVariantId: loaderData.productVariantId,
    destination: loaderData.destination,
  } satisfies typeof QrFormInput.Encoded;
  const loaderProduct = {
    title: loaderData.productTitle,
    image: loaderData.productImage,
    alt: loaderData.productAlt,
  };
  const [pickedProduct, setPickedProduct] = React.useState<
    null | typeof loaderProduct
  >(null);
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
  const deleteMutation = useMutation({
    mutationFn: (data: typeof DeleteQrInput.Type) => deleteQrCode({ data }),
    onSuccess: () => navigate({ to: "/app" }),
  });

  const form = useForm({
    defaultValues,
    /** Keeps first validation submit-driven, then revalidates on change after a submit attempt. */
    validationLogic: revalidateLogic(),
    validators: { onDynamic: Schema.toStandardSchemaV1(QrFormInput) },
    onSubmit: ({ value }) => {
      saveMutation.mutate(value);
    },
  });
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

  const selectProduct = async () => {
    const { productId, productVariantId } = form.state.values;
    const products = await shopify.resourcePicker({
      type: "product",
      action: "select",
      filter: { variants: true },
      selectionIds: productId
        ? [
            {
              id: productId,
              variants: productVariantId ? [{ id: productVariantId }] : [],
            },
          ]
        : [],
    });
    const product = products?.[0];
    if (!product) return;
    const variantId = product.variants[0]?.id;
    if (!variantId) return;
    form.setFieldValue("productId", product.id);
    form.setFieldValue("productVariantId", variantId);
    setPickedProduct({
      title: product.title,
      image: product.images[0]?.originalSrc ?? null,
      alt: product.images[0]?.altText ?? null,
    });
    saveMutation.reset();
  };

  const removeProduct = () => {
    form.setFieldValue("productId", "");
    form.setFieldValue("productVariantId", "");
    setPickedProduct(null);
  };

  const deleteCurrent = () => {
    if (!loaderData.id) return;
    deleteMutation.mutate({ id: loaderData.id });
  };

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

  return (
    <>
      <ui-save-bar id={qrCodeSaveBarId}>
        <button
          variant="primary"
          onClick={() => void form.handleSubmit()}
          disabled={saveMutation.isPending}
        />
        <button onClick={() => void reset()} />
      </ui-save-bar>
      <s-page heading={loaderData.handle ? loaderData.title : "Create QR code"}>
        <s-link href="/app" slot="breadcrumb-actions" onClick={leave}>
          QR codes
        </s-link>
        {loaderData.id && isHydrated && (
          <s-button
            slot="secondary-actions"
            onClick={deleteCurrent}
            {...(deleteMutation.isPending ? { loading: true } : {})}
          >
            Delete
          </s-button>
        )}
        <s-section heading="QR code information">
          <s-stack gap="base">
            <form.Field name="title">
              {(field) => (
                <s-text-field
                  label="Title"
                  details="Only store staff can see this title"
                  error={fieldError(field.state.meta.errors)}
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
                    error={fieldError(field.state.meta.errors)}
                    onChange={(event) => {
                      field.handleChange(
                        event.currentTarget.value as Domain.QrCodeDestination,
                      );
                    }}
                    onBlur={field.handleBlur}
                  >
                    <s-option
                      value="product"
                      selected={field.state.value === "product"}
                    >
                      Link to product page
                    </s-option>
                    <s-option
                      value="cart"
                      selected={field.state.value === "cart"}
                    >
                      Link to checkout page with product in the cart
                    </s-option>
                  </s-select>
                  {loaderData.destinationUrl && (
                    <s-link href={loaderData.destinationUrl} target="_blank">
                      Go to destination URL
                    </s-link>
                  )}
                </s-stack>
              )}
            </form.Field>
            <form.Field name="productId">
              {(productIdField) => (
                <form.Field name="productVariantId">
                  {(productVariantIdField) => {
                    const productId = productIdField.state.value;
                    const selectedProduct = productId
                      ? (pickedProduct ?? loaderProduct)
                      : null;
                    const productAdminId = productId.split("/").at(-1) ?? "";
                    const productUrl = productId
                      ? `shopify://admin/products/${productAdminId}`
                      : "";
                    const productError = fieldError([
                      ...productIdField.state.meta.errors,
                      ...productVariantIdField.state.meta.errors,
                    ]);
                    return (
                      <s-stack gap="small-400">
                        <s-stack
                          direction="inline"
                          gap="small-100"
                          justifyContent="space-between"
                        >
                          <s-text color="subdued">Product</s-text>
                          {productId && (
                            <s-link onClick={removeProduct}>Clear</s-link>
                          )}
                        </s-stack>
                        {productId ? (
                          <s-stack
                            direction="inline"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <s-stack
                              direction="inline"
                              gap="small-100"
                              alignItems="center"
                            >
                              <s-clickable
                                href={productUrl}
                                target="_blank"
                                accessibilityLabel={`Go to the product page for ${selectedProduct?.title ?? "selected product"}`}
                                borderRadius="base"
                              >
                                <s-box
                                  padding="small-200"
                                  border="base"
                                  borderRadius="base"
                                  background="subdued"
                                  inlineSize="38px"
                                  blockSize="38px"
                                >
                                  {selectedProduct?.image ? (
                                    <s-image
                                      src={selectedProduct.image}
                                      alt={selectedProduct.alt ?? ""}
                                    />
                                  ) : (
                                    <s-icon size="base" type="product" />
                                  )}
                                </s-box>
                              </s-clickable>
                              <s-link href={productUrl} target="_blank">
                                {selectedProduct?.title}
                              </s-link>
                            </s-stack>
                            {isHydrated && (
                              <s-button onClick={() => void selectProduct()}>
                                Change
                              </s-button>
                            )}
                          </s-stack>
                        ) : (
                          isHydrated && (
                            <s-button onClick={() => void selectProduct()}>
                              Select product
                            </s-button>
                          )
                        )}
                        {productError && (
                          <s-text tone="critical">{productError}</s-text>
                        )}
                      </s-stack>
                    );
                  }}
                </form.Field>
              )}
            </form.Field>
          </s-stack>
        </s-section>
        <s-box slot="aside">
          <s-section heading="Preview">
            <s-stack gap="base">
              <s-box
                padding="base"
                border="none"
                borderRadius="base"
                background="subdued"
              >
                {loaderData.image ? (
                  <s-image
                    aspectRatio="1/0.8"
                    src={loaderData.image}
                    alt="The QR code for the current form"
                  />
                ) : (
                  <s-stack
                    direction="inline"
                    alignItems="center"
                    justifyContent="center"
                    blockSize="198px"
                  >
                    <s-text color="subdued">See a preview once you save</s-text>
                  </s-stack>
                )}
              </s-box>
              <s-stack
                gap="small"
                direction="inline"
                alignItems="center"
                justifyContent="space-between"
              >
                <s-button
                  disabled={!loaderData.handle}
                  href={loaderData.scanUrl ?? undefined}
                  target="_blank"
                >
                  Go to public URL
                </s-button>
                <s-button
                  disabled={!loaderData.image}
                  href={loaderData.image ?? undefined}
                  download={`${loaderData.handle ?? "qr-code"}.png`}
                  variant="primary"
                >
                  Download
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </s-box>
      </s-page>
    </>
  );
}
