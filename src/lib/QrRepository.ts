import { Context, Effect, Layer, Option, Schema } from "effect";

import * as Domain from "@/lib/Domain";
import { ShopifyAdmin } from "@/lib/ShopifyAdmin";
import { ShopifyError } from "@/lib/Shopify";

const METAOBJECT_TYPE = "$app:qrcode";

export class QrRepositoryError extends Schema.TaggedErrorClass<QrRepositoryError>()(
  "QrRepositoryError",
  {
    message: Schema.String,
    cause: Schema.Defect,
  },
) {}

const JsonField = Schema.optional(Schema.NullOr(Schema.Struct({ jsonValue: Schema.Unknown })));

const ProductReference = Schema.Struct({
  handle: Schema.String,
  title: Schema.String,
  media: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({
        preview: Schema.Struct({
          image: Schema.NullOr(
            Schema.Struct({ url: Schema.String, altText: Schema.NullOr(Schema.String) }),
          ),
        }),
      }),
    ),
  }),
});

const VariantReference = Schema.Struct({
  id: Schema.String,
  legacyResourceId: Schema.String,
});

const ProductField = Schema.optional(
  Schema.NullOr(
    Schema.Struct({
      jsonValue: Schema.Unknown,
      reference: Schema.NullOr(ProductReference),
    }),
  ),
);

const ProductVariantField = Schema.optional(
  Schema.NullOr(Schema.Struct({ reference: Schema.NullOr(VariantReference) })),
);

const QrMetaobject = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
  updatedAt: Schema.String,
  title: JsonField,
  product: ProductField,
  productVariant: ProductVariantField,
  destination: JsonField,
  scans: JsonField,
});

const GetQrCodeResponse = Schema.Struct({
  metaobjectByHandle: Schema.NullOr(QrMetaobject),
});

const ListQrCodesResponse = Schema.Struct({
  metaobjects: Schema.Struct({ nodes: Schema.Array(QrMetaobject) }),
});

const UserError = Schema.Struct({
  field: Schema.NullOr(Schema.Array(Schema.String)),
  message: Schema.String,
});

const SaveQrCodeResponse = Schema.Struct({
  metaobjectUpsert: Schema.Struct({
    metaobject: Schema.NullOr(Schema.Struct({ id: Schema.String, handle: Schema.String })),
    userErrors: Schema.Array(UserError),
  }),
});

const DeleteQrCodeResponse = Schema.Struct({
  metaobjectDelete: Schema.Struct({
    deletedId: Schema.NullOr(Schema.String),
    userErrors: Schema.Array(UserError),
  }),
});

const IncrementScansResponse = Schema.Struct({
  metaobjectUpdate: Schema.Struct({
    metaobject: Schema.NullOr(Schema.Struct({ id: Schema.String })),
    userErrors: Schema.Array(UserError),
  }),
});

const decodeQrCode = (input: unknown) =>
  Schema.decodeUnknownEffect(Domain.QrCode)(input).pipe(
    Effect.mapError((cause) => new QrRepositoryError({ message: "Invalid QR code metaobject", cause })),
  );

const decodeSavedQrCode = (input: unknown) =>
  Schema.decodeUnknownEffect(Schema.Struct({ id: Domain.QrCodeId, handle: Domain.QrCodeHandle }))(input).pipe(
    Effect.mapError((cause) => new QrRepositoryError({ message: "Invalid saved QR code metaobject", cause })),
  );

const getString = (value: unknown) => (typeof value === "string" ? value : "");

const getNumber = (value: unknown) => (typeof value === "number" ? value : 0);

const toDomainInput = (metaobject: typeof QrMetaobject.Type) => {
  const product = metaobject.product?.reference ?? null;
  const variant = metaobject.productVariant?.reference ?? null;
  const image = product?.media.nodes[0]?.preview.image ?? null;
  const productId = getString(metaobject.product?.jsonValue);
  return {
    id: metaobject.id,
    handle: metaobject.handle,
    title: getString(metaobject.title?.jsonValue),
    productId,
    productVariantId: variant?.id ?? "",
    productHandle: product?.handle ?? null,
    productVariantLegacyId: variant?.legacyResourceId ?? null,
    destination: getString(metaobject.destination?.jsonValue),
    scans: getNumber(metaobject.scans?.jsonValue),
    createdAt: metaobject.updatedAt,
    productDeleted: productId !== "" && product === null,
    productTitle: product?.title ?? null,
    productImage: image?.url ?? null,
    productAlt: image?.altText ?? null,
  };
};

const failUserError = (operation: string, userErrors: readonly typeof UserError.Type[]) =>
  Effect.fail(
    new ShopifyError({
      message: userErrors[0]?.message ?? `${operation} failed`,
      cause: userErrors,
    }),
  );

export class QrRepository extends Context.Service<QrRepository>()(
  "QrRepository",
  {
    make: Effect.gen(function* () {
      const admin = yield* ShopifyAdmin;

      const findByHandle = Effect.fn("QrRepository.findByHandle")(function* (handle: Domain.QrCodeHandle) {
        const result = yield* admin.graphqlDecode(
          GetQrCodeResponse,
          `#graphql
          query GetQRCode($handle: MetaobjectHandleInput!) {
            metaobjectByHandle(handle: $handle) {
              id
              handle
              updatedAt
              title: field(key: "title") { jsonValue }
              product: field(key: "product") {
                jsonValue
                reference {
                  ... on Product {
                    handle
                    title
                    media(first: 1) {
                      nodes {
                        preview {
                          image { url altText }
                        }
                      }
                    }
                  }
                }
              }
              productVariant: field(key: "product_variant") {
                reference {
                  ... on ProductVariant { id legacyResourceId }
                }
              }
              destination: field(key: "destination") { jsonValue }
              scans: field(key: "scans") { jsonValue }
            }
          }`,
          { variables: { handle: { type: METAOBJECT_TYPE, handle } } },
        );
        if (result.metaobjectByHandle === null) return Option.none();
        return yield* decodeQrCode(toDomainInput(result.metaobjectByHandle)).pipe(Effect.map(Option.some));
      });

      const list = Effect.fn("QrRepository.list")(function* () {
        const result = yield* admin.graphqlDecode(
          ListQrCodesResponse,
          `#graphql
          query GetQRCodes($type: String!) {
            metaobjects(type: $type, first: 50, sortKey: "updated_at", reverse: true) {
              nodes {
                id
                handle
                updatedAt
                title: field(key: "title") { jsonValue }
                product: field(key: "product") {
                  jsonValue
                  reference {
                    ... on Product {
                      handle
                      title
                      media(first: 1) {
                        nodes {
                          preview {
                            image { url altText }
                          }
                        }
                      }
                    }
                  }
                }
                productVariant: field(key: "product_variant") {
                  reference {
                    ... on ProductVariant { id legacyResourceId }
                  }
                }
                destination: field(key: "destination") { jsonValue }
                scans: field(key: "scans") { jsonValue }
              }
            }
          }`,
          { variables: { type: METAOBJECT_TYPE } },
        );
        return yield* Effect.all(result.metaobjects.nodes.map((node) => decodeQrCode(toDomainInput(node))));
      });

      const save = Effect.fn("QrRepository.save")(function* (handle: Domain.QrCodeHandle, input: Domain.QrCodeUpsert) {
        const result = yield* admin.graphqlDecode(
          SaveQrCodeResponse,
          `#graphql
          mutation UpsertQRCode($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
            metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
              metaobject { id handle }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              handle: { type: METAOBJECT_TYPE, handle },
              metaobject: {
                fields: [
                  { key: "title", value: input.title },
                  { key: "product", value: input.productId },
                  { key: "product_variant", value: input.productVariantId },
                  { key: "destination", value: input.destination },
                ],
              },
            },
          },
        );
        if (result.metaobjectUpsert.userErrors.length > 0) {
          return yield* failUserError("Save QR code", result.metaobjectUpsert.userErrors);
        }
        if (result.metaobjectUpsert.metaobject === null) {
          return yield* Effect.fail(new ShopifyError({ message: "Save QR code returned no metaobject", cause: result }));
        }
        return yield* decodeSavedQrCode(result.metaobjectUpsert.metaobject);
      });

      const deleteById = Effect.fn("QrRepository.deleteById")(function* (id: Domain.QrCodeId) {
        const result = yield* admin.graphqlDecode(
          DeleteQrCodeResponse,
          `#graphql
          mutation DeleteQRCode($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors { field message }
            }
          }`,
          { variables: { id } },
        );
        if (result.metaobjectDelete.userErrors.length > 0) {
          return yield* failUserError("Delete QR code", result.metaobjectDelete.userErrors);
        }
      });

      const incrementScans = Effect.fn("QrRepository.incrementScans")(function* (
        id: Domain.QrCodeId,
        currentScans: Domain.QrCode["scans"],
      ) {
        const result = yield* admin.graphqlDecode(
          IncrementScansResponse,
          `#graphql
          mutation IncrementScans($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject { id }
              userErrors { field message }
            }
          }`,
          { variables: { id, metaobject: { fields: [{ key: "scans", value: String(currentScans + 1) }] } } },
        );
        if (result.metaobjectUpdate.userErrors.length > 0) {
          return yield* failUserError("Increment QR code scans", result.metaobjectUpdate.userErrors);
        }
      });

      return { findByHandle, list, save, deleteById, incrementScans };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
