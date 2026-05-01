import "@/lib/shopifyAppBridgeElements";
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect, Redacted } from "effect";

import { AppProvider } from "@/components/AppProvider";
import { CurrentRequest } from "@/lib/CurrentRequest";
import { Shopify } from "@/lib/Shopify";

/**
 * Route-boundary Shopify auth for `/app` document requests.
 *
 * Rebuilds an absolute app URL from router pathname/search, runs
 * `shopify.authenticateAdmin`, and preserves auth control flow via
 * `runEffect` failures.
 *
 * Redirect nuance:
 * - `Shopify.authenticateAdmin` returns plain `Response.redirect(...)` values.
 * - TanStack router redirect control flow only recognizes redirects created by
 *   `redirect(...)` (redirect `Response` with router metadata).
 * - So redirect Responses are mapped to `redirect({ href })`; non-redirect
 *   Responses are failed through unchanged.
 *
 * Successful auth returns route context with `apiKey` and authenticated `shop`.
 */
const authenticateAppRoute = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { readonly searchStr: string; readonly pathname: string }) => input,
  )
  .handler(({ data, context: { runEffect } }) =>
    runEffect(
      Effect.gen(function* () {
        const shopify = yield* Shopify;
        const request = yield* CurrentRequest;
        const appRequest = new Request(
          `${shopify.config.appUrl}${data.pathname}${data.searchStr}`,
          {
            method: request.method,
            headers: request.headers,
          },
        );
        yield* Effect.logDebug("authenticateAppRoute").pipe(
          Effect.annotateLogs({
            event: "start",
            source: "app-beforeLoad-serverfn",
            currentRequestUrl: request.url,
            appRequestUrl: appRequest.url,
            hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
          }),
        );
        const session = yield* shopify.authenticateAdmin(appRequest);

        if (session instanceof Response) {
          yield* Effect.logDebug("authenticateAppRoute").pipe(
            Effect.annotateLogs({
              event: "response",
              source: "app-beforeLoad-serverfn",
              currentRequestUrl: request.url,
              appRequestUrl: appRequest.url,
              status: session.status,
              location:
                session.headers.get("Location") ?? session.headers.get("location"),
            }),
          );
          const location =
            session.headers.get("Location") ?? session.headers.get("location");
          if (location) return yield* Effect.fail(redirect({ href: location }));
          return yield* Effect.fail(session);
        }

        yield* Effect.logDebug("authenticateAppRoute").pipe(
          Effect.annotateLogs({
            event: "session",
            source: "app-beforeLoad-serverfn",
            currentRequestUrl: request.url,
            appRequestUrl: appRequest.url,
            shop: session.shop,
          }),
        );

        return {
          apiKey: Redacted.value(shopify.config.apiKey),
          shop: session.shop,
        } as const;
      }),
    ),
  );

export const Route = createFileRoute("/app")({
  /**
   * Enforces auth at the `/app` layout boundary before child routes load.
   *
   * Throws TanStack `redirect(...)` when Shopify auth indicates a redirect
   * (login/embed/session-token bounce). Otherwise returns auth context for the
   * `/app` subtree.
   */
  beforeLoad: async ({ location }) => {
    return authenticateAppRoute({
      data: {
        searchStr: location.searchStr,
        pathname: location.pathname,
      },
    });
  },
  component: AppLayout,
});

function AppLayout() {
  const { apiKey } = Route.useRouteContext();
  const { searchStr } = useLocation();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={`/app${searchStr}`}>Home</s-link>
        <s-link href={`/app/template-demo${searchStr}`}>Template demo</s-link>
        <s-link href={`/app/additional${searchStr}`}>Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}
