import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fetchUpstream } from '../proxy/request';

/**
 * HTTP Proxy Protocol Support
 * 
 * Handles standard HTTP proxy requests where the URL is absolute:
 * Example: GET http://registry.npmjs.org/package
 * 
 * This allows CLI tools (npm, docker, curl) to use this server as a proxy.
 * 
 * Implemented as a preHandler hook to intercept absolute URLs before web proxy.
 */
export async function httpProxyRoutes(fastify: FastifyInstance) {
    // Add a preHandler hook to intercept absolute URL requests
    fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
        const url = req.url;

        // Only handle absolute URLs (http:// or https://)
        // Relative URLs will pass through to web proxy
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return; // Pass through to next handler
        }

        req.log.info({ url, method: req.method }, 'HTTP Proxy request');

        try {
            // Prepare request body for POST/PUT/PATCH
            let body = undefined;
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                const contentType = req.headers['content-type'] || '';

                if (contentType.includes('application/json')) {
                    body = req.body ? JSON.stringify(req.body) : undefined;
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    if (req.body && typeof req.body === 'object') {
                        const params = new URLSearchParams();
                        for (const [key, value] of Object.entries(req.body)) {
                            params.append(key, String(value));
                        }
                        body = params.toString();
                    }
                } else {
                    // For binary/multipart, use raw stream
                    body = req.raw;
                }
            }

            // Fetch from upstream
            const response = await fetchUpstream(url, req.method, req.headers, body || null);

            // Forward all headers except encoding-related
            for (const [key, value] of Object.entries(response.headers)) {
                const lowerKey = key.toLowerCase();

                // Skip these headers to avoid conflicts
                if (lowerKey === 'content-encoding' ||
                    lowerKey === 'content-length' ||
                    lowerKey === 'transfer-encoding') {
                    continue;
                }

                reply.header(key, value);
            }

            reply.status(response.statusCode);

            // Stream response as binary buffer
            const buffer = Buffer.from(await response.body.arrayBuffer());

            // Send response and return true to prevent further processing
            reply.send(buffer);

        } catch (error: any) {
            req.log.error({ error, url }, 'HTTP Proxy error');
            reply.status(502).send({
                error: 'Proxy Error',
                message: error.message,
                url: url
            });
        }
    });
}
