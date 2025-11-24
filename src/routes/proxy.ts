import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fetchUpstream } from '../proxy/request';
import { rewriteHtml } from '../proxy/rewrite';
import { isValidUrl } from '../utils/url';

export async function proxyRoutes(fastify: FastifyInstance) {

    // Helper to add CORS headers inspired by cors-anywhere
    const addCorsHeaders = (reply: FastifyReply, req: FastifyRequest) => {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
        reply.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ||
            'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
        reply.header('Access-Control-Max-Age', '86400'); // 24 hours

        // Expose all headers to client
        reply.header('Access-Control-Expose-Headers', '*');

        return reply;
    };

    const handleProxy = async (req: FastifyRequest, reply: FastifyReply) => {
        const rawPath = req.raw.url || '/';

        // Handle CORS preflight requests
        if (req.method === 'OPTIONS') {
            addCorsHeaders(reply, req);
            return reply.status(204).send();
        }

        // 1. Check if it's a full URL path (e.g. /https://google.com)
        let targetUrl = rawPath.substring(1); // Strip leading slash

        // 2. If it doesn't start with http, it might be a relative resource request (e.g. /favicon.ico)
        // In a perfect world, we rewrote everything to be absolute.
        // But if we missed something, or if it's a root-relative request from a script...
        // We can't easily know the target without a Referer or a Session.
        // For now, if it's not http, we return 404 or try to guess from Referer?
        // Let's rely on Referer if available.
        if (!targetUrl.startsWith('http')) {
            const referer = req.headers['referer'];
            if (referer) {
                try {
                    // Referer: https://proxy.com/https://google.com/foo
                    const refererUrl = new URL(referer);
                    const refererPath = refererUrl.pathname.substring(1); // https://google.com/foo
                    if (refererPath.startsWith('http')) {
                        const refererTarget = new URL(refererPath);
                        // Resolve current path against referer target base
                        targetUrl = new URL(rawPath, refererTarget.origin).toString();
                    }
                } catch (e) {
                    // ignore
                }
            }
        }

        if (!targetUrl.startsWith('http')) {
            // If still not http, maybe it's the root / request -> Show Home or 404
            if (rawPath === '/' || rawPath === '') {
                return reply.send('Web Proxy Running');
            }
            return reply.status(404).send({ error: 'Not Found', hint: 'Format: /https://target.com' });
        }

        if (!isValidUrl(targetUrl)) {
            return reply.status(400).send({ error: 'Invalid Target URL' });
        }

        const proxyBase = `${req.protocol}://${req.hostname}${req.port ? `:${req.port}` : ''}`;

        try {
            const upstreamResponse = await fetchUpstream(
                targetUrl,
                req.method,
                req.headers,
                req.raw
            );

            // Add CORS headers first
            addCorsHeaders(reply, req);

            // Handle Redirects
            if (upstreamResponse.statusCode >= 300 && upstreamResponse.statusCode < 400) {
                const location = upstreamResponse.headers['location'];
                if (location) {
                    const resolvedLocation = new URL(location as string, targetUrl).toString();
                    reply.header('Location', `/${resolvedLocation}`);
                }
            }

            // Forward Headers (excluding some that shouldn't be forwarded)
            for (const [key, value] of Object.entries(upstreamResponse.headers)) {
                const lowerKey = key.toLowerCase();

                // Skip headers that we're handling specially or that can cause issues
                if (lowerKey === 'content-encoding' || lowerKey === 'content-length' || lowerKey === 'transfer-encoding') continue;
                if (lowerKey === 'location') continue;

                // Strip cookies for security (inspired by cors-anywhere)
                if (lowerKey === 'set-cookie' || lowerKey === 'set-cookie2') continue;

                // CRITICAL: Remove CSP headers that block our proxy functionality
                if (lowerKey === 'content-security-policy' || lowerKey === 'content-security-policy-report-only') continue;

                // Remove other security headers that might interfere
                if (lowerKey === 'x-frame-options' || lowerKey === 'x-content-type-options') continue;

                reply.header(key, value);
            }

            // Add X-Final-URL header for debugging
            reply.header('X-Final-URL', targetUrl);

            reply.status(upstreamResponse.statusCode);

            const contentType = upstreamResponse.headers['content-type'] || '';

            if (contentType.includes('text/html')) {
                const bodyBuffer = await upstreamResponse.body.text();
                const rewritten = rewriteHtml(bodyBuffer, targetUrl, proxyBase);
                return reply.send(rewritten);
            } else if (contentType.includes('text/css')) {
                // Rewrite CSS URLs
                let css = await upstreamResponse.body.text();
                css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match: string, quote: string, url: string) => {
                    if (url.startsWith('data:') || url.startsWith('#')) {
                        return match;
                    }
                    try {
                        const resolved = new URL(url, targetUrl).toString();
                        return `url(${quote}${proxyBase}/${resolved}${quote})`;
                    } catch {
                        return match;
                    }
                });
                return reply.type('text/css').send(css);
            } else if (contentType.includes('javascript') || contentType.includes('json')) {
                // For JS/JSON, send as text
                const text = await upstreamResponse.body.text();
                return reply.send(text);
            } else {
                // For binary content (images, fonts, etc.), read as Buffer
                const buffer = Buffer.from(await upstreamResponse.body.arrayBuffer());
                return reply.send(buffer);
            }

        } catch (error: any) {
            req.log.error(error);
            addCorsHeaders(reply, req); // Add CORS headers even for errors
            return reply.status(502).send({
                error: 'Proxy Error',
                message: error.message,
                target: targetUrl
            });
        }
    };

    // Match everything
    fastify.all('/*', handleProxy);
}
