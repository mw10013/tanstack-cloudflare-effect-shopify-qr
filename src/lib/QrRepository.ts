import { Context, Effect, Layer, Option, Schema, SchemaTransformation } from "effect";

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

const JsonValue = <S extends Schema.Top>(inner: S) =>
  Schema.Struct({ jsonValue: inner }).pipe(
    Schema.decodeTo(
      inner,
      SchemaTransformation.transform({
        decode: (field: { readonly jsonValue: S["Type"] }) => field.jsonValue,
        encode: (value: S["Type"]) => ({ jsonValue: value }),
      }) as never,
    ),
  );

const NullableJsonValue = <S extends Schema.Top>(inner: S, fallback: S["Type"]) =>
  Schema.NullOr(Schema.Struct({ jsonValue: inner })).pipe(
    Schema.decodeTo(
      inner,
      SchemaTransformation.transform({
        decode: (field: { readonly jsonValue: S["Type"] } | null) =>
          field === null ? fallback : field.jsonValue,
        encode: (value: S["Type"]) => ({ jsonValue: value }),
      }) as never,
    ),
  );

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

const ProductFlat = Schema.Struct({
  productId: Schema.String,
  productHandle: Schema.NullOr(Schema.String),
  productTitle: Schema.NullOr(Schema.String),
  productImage: Schema.NullOr(Schema.String),
  productAlt: Schema.NullOr(Schema.String),
  productDeleted: Schema.Boolean,
});

const ProductFieldShape = Schema.NullOr(
  Schema.Struct({
    jsonValue: Schema.String,
    reference: Schema.NullOr(ProductReference),
  }),
);

const ProductBlock = ProductFieldShape.pipe(
  Schema.decodeTo(
    ProductFlat,
    SchemaTransformation.transform<typeof ProductFlat.Type, typeof ProductFieldShape.Type>({
      decode: (field) => {
        const productId = field?.jsonValue ?? "";
        const reference = field?.reference ?? null;
        const image = reference?.media.nodes[0]?.preview.image ?? null;
        return {
          productId,
          productHandle: reference?.handle ?? null,
          productTitle: reference?.title ?? null,
          productImage: image?.url ?? null,
          productAlt: image?.altText ?? null,
          productDeleted: productId !== "" && reference === null,
        };
      },
      encode: () => null,
    }),
  ),
);

const VariantReference = Schema.Struct({
  id: Schema.String,
  legacyResourceId: Schema.String,
});

const VariantFlat = Schema.Struct({
  productVariantId: Schema.String,
  productVariantLegacyId: Schema.NullOr(Schema.String),
});

const VariantFieldShape = Schema.NullOr(
  Schema.Struct({ reference: Schema.NullOr(VariantReference) }),
);

const VariantBlock = VariantFieldShape.pipe(
  Schema.decodeTo(
    VariantFlat,
    SchemaTransformation.transform<typeof VariantFlat.Type, typeof VariantFieldShape.Type>({
      decode: (field) => {
        const reference = field?.reference ?? null;
        return {
          productVariantId: reference?.id ?? "",
          productVariantLegacyId: reference?.legacyResourceId ?? null,
        };
      },
      encode: () => null,
    }),
  ),
);

/**
 * Transport schema for a Shopify QR code metaobject. Decodes the raw GraphQL
 * response shape into a cleaned-up form that is one symmetric spread away from
 * `Domain.QrCode`.
 *
 * Most of the work happens in the field schemas, not at the struct level:
 *
 * - `JsonValue(inner)` and `NullableJsonValue(inner, fallback)` unwrap Shopify's
 *   ubiquitous `{ jsonValue: T }` field wrappers at the field. `destination`
 *   uses `JsonValue(Domain.QrCodeDestination)` so the literal-union check runs
 *   at the field; a bad value fails at `["destination", "jsonValue"]` rather
 *   than later. `title` and `scans` use `NullableJsonValue` because GraphQL
 *   returns `null` for unset metaobject fields (e.g. a freshly created QR code
 *   has no `scans` yet) and the existing behaviour falls back to `""` / `0`.
 * - `ProductBlock` and `VariantBlock` are field-scoped sub-schemas that decode
 *   the whole `product` / `productVariant` field (its `jsonValue` *and* its
 *   `reference`) into a flat block of domain keys (`productHandle`,
 *   `productImage`, `productDeleted`, etc.). Cross-field rules like
 *   `productDeleted = (productId set && reference resolved to null)` live next
 *   to the data they read instead of in a top-level adapter.
 *
 * After all field-level decoding, the struct's `Type` already matches the keys
 * `Domain.QrCode` expects — the second stage in `QrCodeFromMetaobject` is just
 * a spread of `m.product` and `m.productVariant` into the surrounding scalars.
 *
 * `Schema.encodeKeys({ createdAt: "updatedAt" })` is the rename. It is *not*
 * symmetric with what its name suggests:
 *
 *   - The mapping is `{ decodedKey: encodedKey }`. The schema's *decoded*
 *     `Type` exposes `createdAt` (matching `Domain.QrCode`); its *encoded*
 *     wire shape uses `updatedAt` (matching the GraphQL response).
 *   - Internally `encodeKeys` builds a renamed struct as the new "from" schema
 *     and uses `decodeTo(self, …)` to map it back to `self`'s field names. So
 *     the wire shape (`updatedAt`) decodes into the domain shape (`createdAt`)
 *     and encoding goes the other way.
 *   - The Shopify metaobject API has no `createdAt` field on a metaobject —
 *     `updatedAt` is the closest analogue (set on creation and last update).
 *     The reference Shopify QR app surfaces this as `createdAt` to users; we
 *     keep that contract via `encodeKeys` instead of repeating the rename in
 *     adapter code.
 *   - See `refs/effect4/packages/effect/SCHEMA.md:951`–`979` and the source
 *     at `refs/effect4/packages/effect/src/Schema.ts:2566`.
 *
 * `id` and `handle` stay as `Schema.String` here. Domain branding
 * (`Domain.QrCodeId`, `Domain.QrCodeHandle`) is enforced in the second stage
 * (`QrCodeFromMetaobject`), so this transport schema can be reused in
 * read-only paths that don't need branded values.
 *
 * GraphQL aliases (`title: field(key: "title") { jsonValue }`) always emit the
 * alias key when requested, so `Schema.NullOr` is sufficient — no
 * `Schema.optional`.
 */
const QrMetaobject = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
  createdAt: Schema.String,
  title: NullableJsonValue(Schema.String, ""),
  destination: JsonValue(Domain.QrCodeDestination),
  scans: NullableJsonValue(Schema.Number, 0),
  product: ProductBlock,
  productVariant: VariantBlock,
}).pipe(Schema.encodeKeys({ createdAt: "updatedAt" }));

/**
 * Decodes an already-validated `QrMetaobject` value into a `Domain.QrCode`.
 *
 * The decoding pipeline is two-stage on purpose:
 *
 * 1. `ShopifyAdmin.graphqlDecode(GetQrCodeResponse | ListQrCodesResponse, ...)`
 *    runs `QrMetaobject` against the raw GraphQL JSON. That stage does the
 *    Shopify-specific work: `Schema.encodeKeys` renames `updatedAt -> createdAt`,
 *    `JsonValue` / `NullableJsonValue` unwrap `{ jsonValue: T }` wrappers, and
 *    `ProductBlock` / `VariantBlock` flatten cross-field rules (productDeleted,
 *    image url, variant ids) inside their own field schemas.
 * 2. This schema runs against the already-decoded `QrMetaobject.Type` and
 *    produces the flat `Domain.QrCode` shape by spreading the product/variant
 *    blocks. Branding (`QrCodeId`, `QrCodeHandle`, `QrCodeDestination`) is
 *    enforced here.
 *
 * The `Schema.toType(QrMetaobject)` wrapper is load-bearing. Without it, the
 * source schema's `Encoded` would be the GraphQL wire shape (with `updatedAt`
 * and `{ jsonValue }` wrappers), and decoding would re-demand that shape from
 * an input that has already been transformed by stage 1 — producing
 * `Missing key at ["updatedAt"]`. `toType` collapses `Encoded === Type` so the
 * second stage accepts what stage 1 produced.
 *
 * Encode is implemented symmetrically (split the flat shape back into
 * product/variant blocks) but is not exercised — the app never calls
 * `Schema.encode` on a `Domain.QrCode`. Saving uses `Domain.QrCodeUpsert` and
 * a separate GraphQL mutation.
 */
const QrCodeFromMetaobject = Schema.toType(QrMetaobject).pipe(
  Schema.decodeTo(
    Domain.QrCode,
    SchemaTransformation.transform<typeof Domain.QrCode.Encoded, typeof QrMetaobject.Type>({
      decode: (m) => ({
        id: m.id,
        handle: m.handle,
        createdAt: m.createdAt,
        title: m.title,
        destination: m.destination,
        scans: m.scans,
        ...m.product,
        ...m.productVariant,
      }),
      encode: (q) => ({
        id: q.id,
        handle: q.handle,
        createdAt: q.createdAt,
        title: q.title,
        destination: q.destination,
        scans: q.scans,
        product: {
          productId: q.productId,
          productHandle: q.productHandle,
          productTitle: q.productTitle,
          productImage: q.productImage,
          productAlt: q.productAlt,
          productDeleted: q.productDeleted,
        },
        productVariant: {
          productVariantId: q.productVariantId,
          productVariantLegacyId: q.productVariantLegacyId,
        },
      }),
    }),
  ),
);

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
  Schema.decodeUnknownEffect(QrCodeFromMetaobject)(input).pipe(
    Effect.tapError((cause) =>
      Effect.sync(() => {
        console.error("[QrRepository] Invalid QR code metaobject", { cause: String(cause), input });
      }),
    ),
    Effect.mapError(
      (cause) => new QrRepositoryError({ message: `Invalid QR code metaobject: ${String(cause)}`, cause }),
    ),
  );

const decodeSavedQrCode = (input: unknown) =>
  Schema.decodeUnknownEffect(Schema.Struct({ id: Domain.QrCodeId, handle: Domain.QrCodeHandle }))(input).pipe(
    Effect.tapError((cause) =>
      Effect.sync(() => {
        console.error("[QrRepository] Invalid saved QR code metaobject", { cause: String(cause), input });
      }),
    ),
    Effect.mapError(
      (cause) =>
        new QrRepositoryError({ message: `Invalid saved QR code metaobject: ${String(cause)}`, cause }),
    ),
  );

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
        return yield* decodeQrCode(result.metaobjectByHandle).pipe(Effect.map(Option.some));
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
        return yield* Effect.all(result.metaobjects.nodes.map(decodeQrCode));
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
