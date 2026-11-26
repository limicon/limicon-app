/**
 * React Router's default server entry for Workers, plus the response's CSP nonce
 * (app/lib/security-headers.ts) on the inline scripts React and React Router write into the page.
 */
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

import { type RequestServices, servicesContext } from "~/context";
import { applySecurityHeaders, createNonce } from "~/lib/security-headers";

/** The root middleware's services, or null when it didn't run or failed before setting them. */
function servicesOf(loadContext: RouterContextProvider): RequestServices | null {
  try {
    return loadContext.get(servicesContext);
  } catch {
    return null;
  }
}

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  // React Router skips middleware for an address no route matches, so its 404 page gets a nonce
  // and the security headers here instead.
  const services = servicesOf(loadContext);
  const nonce = services?.nonce ?? createNonce();
  if (!services) applySecurityHeaders(responseHeaders, { nonce, csp: !import.meta.env.DEV });
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      signal: AbortSignal.timeout(streamTimeout + 1000),
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell. Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
