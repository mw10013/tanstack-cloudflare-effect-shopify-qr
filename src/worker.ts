import { isNotFound, isRedirect } from "@tanstack/react-router";
import serverEntry from "@tanstack/react-start/server-entry";
import { Cause, Effect, Layer, Context, ManagedRuntime } from "effect";
import * as Exit from "effect/Exit";

import { D1 } from "@/lib/D1";
import { makeEnvLayer, makeLoggerLayer } from "@/lib/LayerEx";
import { Repository } from "@/lib/Repository";
import { CurrentRequest } from "@/lib/CurrentRequest";
import { Shopify } from "@/lib/Shopify";

const makeAppLayer = (env: Env, request: Request) => {
  const envLayer = makeEnvLayer(env);
  const d1Layer = Layer.provideMerge(D1.layer, envLayer);
  const repositoryLayer = Layer.provideMerge(Repository.layer, d1Layer);
  const requestLayer = Layer.succeedContext(
    Context.make(CurrentRequest, request),
  );
  const shopifyLayer = Layer.provideMerge(
    Shopify.layer,
    Layer.merge(repositoryLayer, requestLayer),
  );
  return Layer.mergeAll(
    d1Layer,
    repositoryLayer,
    shopifyLayer,
    requestLayer,
    makeLoggerLayer(env),
  );
};

const formatErrorMessage = (error: Error): string => {
  const message = error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message;
  return error.cause instanceof Error ? `${message}\n[cause]: ${formatErrorMessage(error.cause)}` : message;
};

/**
 * Builds a per-request `ManagedRuntime` and returns a `runEffect` function for
 * HTTP request handlers (fetch, server functions).
 *
 * `ManagedRuntime` memoizes the layer build so services (`D1`,
 * `Repository`, `Shopify`, …) are constructed once per request and reused
 * across every `runEffect` call within that request, rather than being rebuilt
 * on each invocation.
 *
 * `runEffect` converts Effect failures to throwable values compatible with
 * TanStack Start's server-function error serialization. Uses `runPromiseExit`
 * instead of `runPromise` so HTTP control-flow values can be preserved before
 * ordinary failures are normalized to a plain `Error` instance that TanStack
 * Start can serialize via seroval.
 *
 * Raw `Response` values, TanStack `redirect`, and TanStack `notFound` objects
 * are thrown as-is after `Cause.squash` so TanStack Start can route them
 * correctly: a raw `Response` gets `X_TSS_RAW_RESPONSE` set by
 * `server-functions-handler` and returned to the client unchanged; redirect
 * and notFound objects go through TanStack's serialization/control-flow paths.
 * `Cause.squash` priority (first `Fail` → first `Die`) aligns with HTTP
 * control flow because there is exactly one HTTP-relevant value in the Cause
 * for these cases.
 *
 * **Error message preservation:** TanStack Start server functions serialize
 * thrown `Error`s through the router-core `ShallowErrorPlugin`, which keeps
 * ONLY `.message`. `.name`, `._tag`, `.stack`, `.cause`, and custom properties
 * are stripped, then the client reconstructs `new Error(message)`. Effect v4
 * app errors intentionally carry useful root detail in `.cause`, while
 * `UnknownError` from unannotated `Effect.tryPromise` is just a generic wrapper
 * whose cause is usually the useful part. To keep the client boundary useful,
 * non-control-flow failures are converted to a fresh `Error` whose message is a
 * compact rendering of `Cause.prettyErrors(exit.cause)`: error names/messages
 * plus nested `[cause]` chains, but not server stacks. This preserves details
 * like schema paths without duplicating stack output in the browser/runtime.
 */
const makeRunEffect = (env: Env, request: Request) => {
  const appLayer = makeAppLayer(env, request);
  const managedRuntime = ManagedRuntime.make(appLayer);
  const runEffect = async <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof appLayer>>,
  ): Promise<A> => {
    const exit = await managedRuntime.runPromiseExit(effect);
    if (Exit.isSuccess(exit)) return exit.value;
    const squashed = Cause.squash(exit.cause);
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- redirect is a Response, notFound is a plain object; TanStack expects these thrown as-is
    if (squashed instanceof Response || isRedirect(squashed) || isNotFound(squashed)) throw squashed;
    const message = Cause.prettyErrors(exit.cause).map(formatErrorMessage).join("\n");
    throw new Error(message);
  };
  return { runEffect, managedRuntime };
};

/**
 * Per-request context injected by `serverEntry.fetch` and typed via Start's
 * `Register.server.requestContext`.
 *
 * Server functions consume this through `context` in handlers
 * (`createServerFn(...).handler(({ context }) => ...)`), so per-request
 * runtime data is available without importing
 * `@tanstack/react-start/server`.
 *
 * Why avoid that import in route modules: `@tanstack/react-start/server` is a
 * barrel that re-exports SSR stream/runtime modules, which pull Node builtins
 * (`node:stream`, `node:stream/web`, `node:async_hooks`) into the client build
 * graph and can trigger Rollup errors like:
 * `"Readable" is not exported by "__vite-browser-external"`.
 *
 * References:
 * - Import Protection (why imports can stay alive):
 *   https://tanstack.com/start/latest/docs/framework/react/guide/import-protection#common-pitfall-why-some-imports-stay-alive
 * - Server Entry Point request context (this pattern):
 *   https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point#request-context
 */
export interface ServerContext {
  runEffect: ReturnType<typeof makeRunEffect>["runEffect"];
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ServerContext };
  }
}

export default {
  fetch(request, env, ctx) {
    const { runEffect, managedRuntime } = makeRunEffect(env, request);
    const responsePromise = runEffect(
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: async () =>
            serverEntry.fetch(request, {
              context: {
                runEffect,
              },
            }),
          catch: (cause) => cause,
        });
        /**
         * Shopify encapsulates document response policy here: HTML gate,
         * shop-param sanitization, and the Cloudflare immutable-response
         * clone/new-Response pattern for header updates.
         */
        const shopify = yield* Shopify;
        return yield* shopify.withShopifyDocumentHeaders(request, response);
      }),
    );
    // Keep the isolate alive until services are torn down after the response is sent.
    // Ideally: responsePromise.finally(() => managedRuntime.dispose()), but finally's callback
    // is typed () => void and dispose() returns Promise<void>, triggering no-misused-promises.
    // .then(dispose, dispose) is equivalent and returns Promise<void> so waitUntil types correctly.
    const dispose = () => managedRuntime.dispose();
    ctx.waitUntil(responsePromise.then(dispose, dispose));
    return responsePromise;
  },
} satisfies ExportedHandler<Env>;
