import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { QrRepository } from "@/lib/QrRepository";
import { shopifyServerFnMiddleware } from "@/lib/ShopifyServerFnMiddleware";

const listQrCodes = createServerFn({ method: "GET" })
  .middleware([shopifyServerFnMiddleware])
  .handler(({ context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const repository = yield* QrRepository;
        return yield* repository.list();
      }),
    ),
  );

export const Route = createFileRoute("/app/")({
  loader: () => listQrCodes(),
  component: AppIndex,
});

const truncate = (value: string | null, length = 25) => {
  if (!value) return "";
  if (value.length <= length) return value;
  return `${value.slice(0, length)}...`;
};

function EmptyQrCodeState() {
  return (
    <s-section accessibilityLabel="Empty state section">
      <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
        <s-box maxInlineSize="200px" maxBlockSize="200px">
          <s-image
            aspectRatio="1/0.5"
            src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            alt="A stylized graphic of a document"
          />
        </s-box>
        <s-grid justifyItems="center" maxBlockSize="450px" maxInlineSize="450px">
          <s-heading>Create unique QR codes for your products</s-heading>
          <s-paragraph>Allow customers to scan codes and buy products using their phones.</s-paragraph>
          <s-stack gap="small-200" justifyContent="center" padding="base" paddingBlockEnd="none" direction="inline">
            <s-button href="/app/qrcodes/new" variant="primary">Create QR code</s-button>
          </s-stack>
        </s-grid>
      </s-grid>
    </s-section>
  );
}

function QrCodeTable({ qrCodes }: { readonly qrCodes: Awaited<ReturnType<typeof listQrCodes>> }) {
  return (
    <s-section padding="none" accessibilityLabel="QR code table">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Title</s-table-header>
          <s-table-header>Product</s-table-header>
          <s-table-header>Date created</s-table-header>
          <s-table-header>Scans</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {qrCodes.map((qrCode) => (
            <s-table-row key={qrCode.handle} id={qrCode.handle}>
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-clickable
                    href={`/app/qrcodes/${qrCode.handle}`}
                    accessibilityLabel={`Edit QR code for ${qrCode.productTitle ?? qrCode.title}`}
                    border="base"
                    borderRadius="base"
                    overflow="hidden"
                    inlineSize="20px"
                    blockSize="20px"
                  >
                    {qrCode.productImage ? <s-image objectFit="cover" src={qrCode.productImage} /> : <s-icon size="base" type="image" />}
                  </s-clickable>
                  <s-link href={`/app/qrcodes/${qrCode.handle}`}>{truncate(qrCode.title)}</s-link>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                {qrCode.productDeleted ? <s-badge icon="alert-diamond" tone="critical">Product has been deleted</s-badge> : truncate(qrCode.productTitle)}
              </s-table-cell>
              <s-table-cell>{new Date(qrCode.createdAt).toDateString()}</s-table-cell>
              <s-table-cell>{qrCode.scans}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}

function AppIndex() {
  const qrCodes = Route.useLoaderData();

  return (
    <s-page heading="QR codes">
      <s-link slot="primary-action" href="/app/qrcodes/new">Create QR code</s-link>
      {qrCodes.length === 0 ? <EmptyQrCodeState /> : <QrCodeTable qrCodes={qrCodes} />}
    </s-page>
  );
}
