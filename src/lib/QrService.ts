import * as qrcode from "qrcode";
import { Config, Context, Effect, Layer, Option, Schema } from "effect";

import * as Domain from "@/lib/Domain";
import { QrRepository } from "@/lib/QrRepository";

export class QrServiceError extends Schema.TaggedErrorClass<QrServiceError>()(
  "QrServiceError",
  {
    message: Schema.String,
    cause: Schema.Defect,
  },
) {}

const appUrlConfig = Config.nonEmptyString("SHOPIFY_APP_URL").pipe(
  Config.orElse(() => Config.nonEmptyString("APP_URL")),
  Config.orElse(() => Config.nonEmptyString("HOST")),
  Config.map((value) =>
    value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`,
  ),
);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");

const decodeHandle = (value: string) =>
  Schema.decodeUnknownEffect(Domain.QrCodeHandle)(value).pipe(
    Effect.mapError((cause) => new QrServiceError({ message: "Invalid QR code handle", cause })),
  );

export class QrService extends Context.Service<QrService>()(
  "QrService",
  {
    make: Effect.gen(function* () {
      const repository = yield* QrRepository;
      const appUrl = yield* appUrlConfig;

      const generateHandle = Effect.fn("QrService.generateHandle")(function* (title: Domain.QrCodeUpsert["title"]) {
        return yield* decodeHandle(`${slugify(title)}-${Date.now().toString(36)}`);
      });

      const getScanUrl = Effect.fn("QrService.getScanUrl")((handle: Domain.QrCodeHandle, shop: Domain.Shop) => {
        const url = new URL(`/qrcodes/${handle}/scan`, appUrl);
        url.searchParams.set("shop", shop);
        return Effect.succeed(url.href);
      });

      const getQrCodeImage = Effect.fn("QrService.getQrCodeImage")(function* (
        handle: Domain.QrCodeHandle,
        shop: Domain.Shop,
      ) {
        const scanUrl = yield* getScanUrl(handle, shop);
        return yield* Effect.tryPromise({
          try: () => qrcode.toDataURL(scanUrl),
          catch: (cause) => new QrServiceError({ message: "QR code image generation failed", cause }),
        });
      });

      const getDestinationUrl = Effect.fn("QrService.getDestinationUrl")(function* (qrCode: Domain.QrCode, shop: Domain.Shop) {
        if (qrCode.productVariantLegacyId === null) {
          return yield* Effect.fail(new QrServiceError({ message: "QR code product variant is unavailable", cause: qrCode }));
        }
        if (qrCode.destination === "cart") return `https://${shop}/cart/${qrCode.productVariantLegacyId}:1`;
        if (qrCode.productHandle === null) {
          return yield* Effect.fail(new QrServiceError({ message: "QR code product is unavailable", cause: qrCode }));
        }
        return `https://${shop}/products/${qrCode.productHandle}?variant=${qrCode.productVariantLegacyId}`;
      });

      const recordScanAndGetDestination = Effect.fn("QrService.recordScanAndGetDestination")(function* (
        handle: Domain.QrCodeHandle,
        shop: Domain.Shop,
      ) {
        const qrCode = yield* repository.findByHandle(handle);
        if (Option.isNone(qrCode)) return Option.none();
        yield* repository.incrementScans(qrCode.value.id, qrCode.value.scans);
        return yield* getDestinationUrl(qrCode.value, shop).pipe(Effect.map(Option.some));
      });

      return { generateHandle, getScanUrl, getQrCodeImage, getDestinationUrl, recordScanAndGetDestination };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
