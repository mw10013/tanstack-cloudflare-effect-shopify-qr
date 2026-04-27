import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Layer, Option, Schema } from "effect";

import * as Domain from "@/lib/Domain";
import { CurrentSession } from "@/lib/CurrentSession";
import { QrRepository } from "@/lib/QrRepository";
import { QrService } from "@/lib/QrService";
import { Shopify } from "@/lib/Shopify";
import { ShopifyAdmin } from "@/lib/ShopifyAdmin";

const ScanInput = Schema.Struct({
  id: Schema.NonEmptyString,
  shop: Schema.NonEmptyString,
});

/**
 * Handles customer-facing QR scans with the shop's stored offline session.
 *
 * This server function is intentionally not using `shopifyServerFnMiddleware`:
 * that middleware authenticates embedded `/app` admin requests with App Bridge
 * session-token semantics. QR scans are public document requests from customers,
 * so there is no current admin iframe/session token to authenticate. Instead,
 * the `shop` query param selects the installed shop, `unauthenticatedAdmin`
 * loads its offline session, and the QR service uses that session to increment
 * scans before redirecting to the product/cart destination.
 */
const scanQrCode = createServerFn({ method: "GET" })
  .inputValidator(Schema.toStandardSchemaV1(ScanInput))
  .handler(({ data, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const handle = yield* Schema.decodeUnknownEffect(Domain.QrCodeHandle)(data.id);
        const shop = yield* Schema.decodeUnknownEffect(Domain.Shop)(data.shop);
        const shopify = yield* Shopify;
        const session = yield* shopify.unauthenticatedAdmin(shop);
        const currentSessionLayer = Layer.succeed(CurrentSession, session);
        const shopifyAdminLayer = Layer.provide(ShopifyAdmin.layer, currentSessionLayer);
        const qrRepositoryLayer = Layer.provide(QrRepository.layer, shopifyAdminLayer);
        const qrServiceLayer = Layer.provide(QrService.layer, qrRepositoryLayer);
        const destination = yield* Effect.gen(function* () {
          const service = yield* QrService;
          return yield* service.recordScanAndGetDestination(handle, shop);
        }).pipe(Effect.provide(qrServiceLayer));
        if (Option.isNone(destination)) return yield* Effect.fail(notFound());
        return yield* Effect.fail(redirect({ href: destination.value }));
      }),
    ),
  );

export const Route = createFileRoute("/qrcodes/$id/scan")({
  loader: ({ params, location }) => scanQrCode({ data: { id: params.id, shop: new URLSearchParams(location.searchStr).get("shop") ?? "" } }),
  component: () => null,
});
