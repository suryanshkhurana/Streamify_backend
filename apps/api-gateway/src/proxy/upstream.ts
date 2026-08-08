/**
 * Proxy factory for the API Gateway.
 *
 * Wraps http-proxy-middleware v3 to create a pre-configured proxy for each
 * upstream service. Forwards the original path, injects gateway headers, and
 * returns a clean 502 on any upstream failure.
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { IncomingMessage } from 'node:http';
import { ServerResponse } from 'node:http';
import type { ClientRequest } from 'node:http';
import { Socket } from 'node:net';
import type { RequestHandler } from 'express';
import { logger } from '@streamify/shared-middleware';

// Augmented IncomingMessage to carry the userId attached by our authenticate middleware
interface AuthenticatedRequest extends IncomingMessage {
  userId?: string;
}

/**
 * Build a proxy middleware that forwards requests to `target`.
 *
 * @param target      Base URL of the upstream service, e.g. http://localhost:3001
 * @param service     Human-readable name for log messages
 * @param pathPrefix  The Express mount prefix (e.g. '/auth') — must be re-added
 *                    because Express strips it before passing to middleware.
 */
export function createUpstreamProxy(target: string, service: string, pathPrefix: string): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Express strips the mount prefix (e.g. '/auth') before calling middleware.
    // We rewrite it back so the upstream service receives the full path.
    pathRewrite: { '^': pathPrefix },

    on: {
      // ── Inject gateway headers ─────────────────────────────────────────
      proxyReq(proxyReq: ClientRequest, req: IncomingMessage) {
        const authReq = req as AuthenticatedRequest;

        // Tell the downstream service which gateway sent this request
        proxyReq.setHeader('X-Gateway-Service', 'api-gateway');

        const requestId =
          (Array.isArray(req.headers['x-request-id'])
            ? req.headers['x-request-id'][0]
            : req.headers['x-request-id']) ?? crypto.randomUUID();
        proxyReq.setHeader('X-Request-Id', requestId);

        // Forward authenticated user ID so downstream services don't re-verify JWT
        if (authReq.userId) {
          proxyReq.setHeader('X-User-Id', authReq.userId);
        }
      },

      // ── Error handler ──────────────────────────────────────────────────
      error(err: Error, _req: IncomingMessage, res: ServerResponse | Socket) {
        logger.error({ err, service }, '[proxy] upstream error');
        if (res instanceof ServerResponse && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              message: `${service} is temporarily unavailable. Please try again later.`,
            }),
          );
        }
      },
    },
  }) as RequestHandler;
}
