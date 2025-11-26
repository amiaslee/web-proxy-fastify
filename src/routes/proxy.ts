import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Readable, Transform } from 'stream';
import { fetchUpstream } from '../proxy/request';
import { rewriteHtml } from '../proxy/rewrite';
import { isValidUrl } from '../utils/url';
import { statsService } from '../services/stats';
import { getRealIP } from '../utils/ip';

// Transform stream to count traffic while piping
class TrafficCounterStream extends Transform {
    private bytesTransferred = 0;
    private ip: string;

    constructor(ip: string) {
        super();
        this.ip = ip;
    }

    _transform(chunk: any, encoding: string, callback: Function) {
        this.bytesTransferred += chunk.length;
        this.push(chunk);
        callback();
    }

    _final(callback: Function) {
        // Record traffic when stream ends
        statsService.recordTraffic(this.ip, this.bytesTransferred)
            .then(() => callback())
            .catch(err => {
                console.error('Failed to record traffic:', err);
                callback();
            });
    }

    getBytesTransferred() {
        return this.bytesTransferred;
    }
}

// Check if content should be streamed (media files)
const isStreamingContent = (contentType: string, url: string): boolean => {
    const lower = contentType.toLowerCase();
    const urlLower = url.toLowerCase();

    // HLS segments and playlists
    if (lower.includes('mpegurl') || urlLower.includes('.m3u8') || urlLower.includes('.ts')) {
        return true;
    }

    // FLV streams
    if (lower.includes('flv') || lower.includes('video/x-flv')) {
        return true;
    }

    // DASH segments
    if (lower.includes('dash') || urlLower.includes('.mpd')) {
        return true;
    }

    // Video files (MP4, WebM, etc.)
    if (lower.includes('video/')) {
        return true;
    }

    // Audio files
    if (lower.includes('audio/')) {
        return true;
    }

    // Application octet-stream that might be media
    if (lower.includes('octet-stream') && (
        urlLower.includes('.mp4') ||
        urlLower.includes('.flv') ||
        urlLower.includes('.ts') ||
        urlLower.includes('.m3u8')
    )) {
        return true;
    }

    return false;
};

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
        const ip = getRealIP(req);
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

        // Record request
        await statsService.recordRequest(ip, targetUrl);

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

            // CRITICAL: Check URL pattern first for m3u8 files
            // Some servers send wrong Content-Type (like text/html) for m3u8 files
            const isM3u8Url = targetUrl.toLowerCase().includes('.m3u8');

            if (isM3u8Url || contentType.includes('mpegurl') || contentType.includes('m3u8')) {
                // HLS Playlist (.m3u8) - Rewrite segment URLs to use proxy
                if (isM3u8Url && !contentType.includes('mpegurl') && !contentType.includes('m3u8')) {
                    req.log.info({ contentType, url: targetUrl }, 'M3U8 detected in URL but Content-Type is wrong, treating as HLS');
                } else {
                    req.log.info({ contentType, url: targetUrl }, 'M3U8 content type detected, rewriting URLs');
                }

                let m3u8Content = await upstreamResponse.body.text();

                // Rewrite URLs in m3u8 playlist
                const lines = m3u8Content.split('\n');
                const rewrittenLines = lines.map(line => {
                    const trimmed = line.trim();

                    // Skip comments and empty lines
                    if (trimmed.startsWith('#') || trimmed === '') {
                        return line;
                    }

                    // This is a URL line (segment or sub-playlist)
                    try {
                        let segmentUrl;
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            // Absolute URL
                            segmentUrl = trimmed;
                        } else {
                            // Relative URL - resolve against current m3u8 URL
                            segmentUrl = new URL(trimmed, targetUrl).toString();
                        }

                        // Wrap with proxy
                        return `${proxyBase}/${segmentUrl}`;
                    } catch (err) {
                        req.log.warn({ line: trimmed, error: err }, 'Failed to rewrite m3u8 URL');
                        return line;
                    }
                });

                const rewrittenM3u8 = rewrittenLines.join('\n');
                req.log.info({ originalLines: lines.length, url: targetUrl }, 'Rewrote m3u8 playlist URLs');
                await statsService.recordTraffic(ip, Buffer.byteLength(rewrittenM3u8, 'utf-8'));
                return reply.type('application/vnd.apple.mpegurl').send(rewrittenM3u8);
            } else if (contentType.includes('text/html')) {
                const html = await upstreamResponse.body.text();
                const rewritten = rewriteHtml(html, targetUrl, proxyBase);
                await statsService.recordTraffic(ip, Buffer.byteLength(rewritten, 'utf-8'));
                return reply.type('text/html').send(rewritten);
            } else if (contentType.includes('text/css')) {
                // Rewrite CSS URLs
                let css = await upstreamResponse.body.text();
                const rewrittenCss = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match: string, quote: string, url: string) => {
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
                await statsService.recordTraffic(ip, Buffer.byteLength(rewrittenCss, 'utf-8'));
                return reply.type('text/css').send(rewrittenCss);
            } else if (contentType.includes('javascript') || contentType.includes('application/javascript')) {
                const js = await upstreamResponse.body.text();
                await statsService.recordTraffic(ip, Buffer.byteLength(js, 'utf-8'));
                return reply.type('application/javascript').send(js);
            } else if (contentType.includes('json') || contentType.includes('application/json')) {
                const json = await upstreamResponse.body.text();
                await statsService.recordTraffic(ip, Buffer.byteLength(json, 'utf-8'));
                return reply.type('application/json').send(json);
            } else {
                // For binary content, check if it should be streamed
                const contentTypeHeader = upstreamResponse.headers['content-type'];
                const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : (contentTypeHeader || '');

                if (isStreamingContent(contentType, targetUrl)) {
                    // Stream media content directly
                    req.log.info({ contentType, url: targetUrl }, 'Streaming content detected, using pipe');

                    try {
                        // Hijack the reply to manually handle the response
                        reply.hijack();

                        // Manually write response headers since we hijacked the response
                        const headers: Record<string, string> = {
                            'Content-Type': contentType,
                            'X-Final-URL': targetUrl,
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
                            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range',
                            'Access-Control-Expose-Headers': '*'
                        };

                        // Copy upstream headers (except ones we skip)
                        for (const [key, value] of Object.entries(upstreamResponse.headers)) {
                            const lowerKey = key.toLowerCase();

                            // Skip problematic headers
                            if (lowerKey === 'content-encoding' || lowerKey === 'transfer-encoding') continue;
                            if (lowerKey === 'content-type') continue; // Skip, we already set it manually above
                            if (lowerKey === 'set-cookie' || lowerKey === 'set-cookie2') continue;
                            if (lowerKey === 'content-security-policy' || lowerKey === 'content-security-policy-report-only') continue;
                            if (lowerKey === 'x-frame-options' || lowerKey === 'x-content-type-options') continue;
                            if (lowerKey.startsWith('access-control-')) continue; // Skip, we set our own

                            // Include Content-Length if present (important for seeking)
                            if (typeof value === 'string') {
                                headers[key] = value;
                            } else if (Array.isArray(value)) {
                                headers[key] = value[0];
                            }
                        }

                        // Write headers
                        reply.raw.writeHead(upstreamResponse.statusCode, headers);

                        // Use undici's body stream directly (it's already a Node.js Readable)
                        const upstreamStream = upstreamResponse.body;

                        // Create traffic counter
                        const counter = new TrafficCounterStream(ip);

                        // Handle stream errors
                        upstreamStream.on('error', (err) => {
                            req.log.error({ error: err }, 'Upstream stream error');
                            reply.raw.destroy();
                        });

                        counter.on('error', (err) => {
                            req.log.error({ error: err }, 'Counter stream error');
                        });

                        // Handle stream end
                        counter.on('finish', () => {
                            req.log.info({ bytes: counter.getBytesTransferred(), url: targetUrl }, 'Stream completed successfully');
                        });

                        // Pipe: upstream → counter → client
                        upstreamStream.pipe(counter).pipe(reply.raw);
                    } catch (streamErr: any) {
                        req.log.error({ error: streamErr }, 'Failed to setup stream');
                        if (!reply.sent) {
                            return reply.status(502).send({ error: 'Stream Setup Error' });
                        }
                    }
                } else {
                    // For non-streaming binary content (images, fonts, etc.), use buffer
                    const buffer = Buffer.from(await upstreamResponse.body.arrayBuffer());
                    await statsService.recordTraffic(ip, buffer.length);
                    return reply.send(buffer);
                }
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
