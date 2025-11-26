import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Stream Detection API
 * 
 * Provides an endpoint to detect the final URL and media type of a stream
 * after following all redirects, without actually proxying the content.
 * 
 * This allows clients to:
 * 1. Discover the real streaming URL behind redirects
 * 2. Detect the media format (HLS, FLV, DASH, etc.)
 * 3. Play the stream directly without using proxy bandwidth
 */

interface DetectRequest {
    Params: {
        '*': string; // Catch-all for the URL
    };
}

export async function detectRoutes(fastify: FastifyInstance) {
    // GET /detect/* - Detect stream URL and format
    fastify.get<DetectRequest>('/detect/*', async (req: FastifyRequest<DetectRequest>, reply: FastifyReply) => {
        // Extract target URL from request URL (preserves query parameters)
        // Format: /detect/http://example.com/path?query=value
        const fullUrl = req.url; // e.g., "/detect/http://example.com/path?query=value"
        const targetUrl = fullUrl.substring('/detect/'.length); // Remove "/detect/" prefix

        if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
            return reply.status(400).send({
                error: 'Invalid URL',
                message: 'Please provide a valid HTTP/HTTPS URL'
            });
        }

        req.log.info({ url: targetUrl }, 'Detection request');

        try {
            let finalUrl = targetUrl;
            let contentType = '';
            let statusCode = 0;
            let redirectCount = 0;
            const maxRedirects = 10; // Prevent infinite loops

            // Follow redirect chain
            while (redirectCount < maxRedirects) {
                req.log.info({ currentUrl: finalUrl, redirectCount }, 'Fetching URL');

                const getResponse = await fetch(finalUrl, {
                    method: 'GET',
                    redirect: 'manual', // Handle redirects manually
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                    }
                });

                statusCode = getResponse.status;

                // Check for redirect status codes
                if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) {
                    const location = getResponse.headers.get('Location');
                    if (location) {
                        const newUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
                        req.log.info({ from: finalUrl, to: newUrl, statusCode }, 'Following redirect');
                        finalUrl = newUrl;
                        redirectCount++;
                        continue; // Continue following redirects
                    } else {
                        req.log.warn('Got redirect status but no Location header');
                        break;
                    }
                } else if (statusCode >= 200 && statusCode < 300) {
                    // Success response, get content type and check Content-Disposition
                    contentType = getResponse.headers.get('Content-Type') || '';
                    const contentDisposition = getResponse.headers.get('Content-Disposition') || '';

                    // Extract filename from Content-Disposition header
                    // Format: attachment; filename="file.m3u8" or attachment; filename=file.m3u8
                    let downloadFilename = '';
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                        if (filenameMatch && filenameMatch[1]) {
                            downloadFilename = filenameMatch[1].replace(/['"]/g, '');
                            req.log.info({ downloadFilename, contentDisposition }, 'Content-Disposition detected');

                            // If we got a download filename with media extension, update contentType
                            const lower = downloadFilename.toLowerCase();
                            if (lower.endsWith('.m3u8')) {
                                contentType = 'application/vnd.apple.mpegurl';
                                req.log.info('Detected HLS from download filename');
                            } else if (lower.endsWith('.flv')) {
                                contentType = 'video/x-flv';
                                req.log.info('Detected FLV from download filename');
                            } else if (lower.endsWith('.mpd')) {
                                contentType = 'application/dash+xml';
                                req.log.info('Detected DASH from download filename');
                            } else if (lower.endsWith('.mp4')) {
                                contentType = 'video/mp4';
                                req.log.info('Detected MP4 from download filename');
                            } else if (lower.endsWith('.mp3')) {
                                contentType = 'audio/mpeg';
                                req.log.info('Detected MP3 from download filename');
                            } else if (lower.endsWith('.aac')) {
                                contentType = 'audio/aac';
                                req.log.info('Detected AAC from download filename');
                            }
                        }
                    }

                    // Read first 1KB to check format (if contentType still not determined)
                    const reader = getResponse.body?.getReader();
                    if (reader) {
                        try {
                            const { value } = await reader.read();
                            reader.releaseLock();

                            if (value) {
                                const firstBytes = new TextDecoder().decode(value.slice(0, 1024));

                                // Check for FLV signature
                                if (firstBytes.startsWith('FLV')) {
                                    contentType = 'video/x-flv';
                                }
                                // Check for M3U8
                                else if (firstBytes.trim().startsWith('#EXTM3U') || firstBytes.includes('#EXTINF')) {
                                    contentType = 'application/vnd.apple.mpegurl';
                                }
                            }
                        } catch (readErr) {
                            req.log.warn({ error: readErr }, 'Failed to read response body');
                        }
                    }

                    // Store downloadFilename for later use in response
                    (req as any).downloadFilename = downloadFilename;
                    break; // Success, stop following redirects
                } else {
                    // Error status, stop
                    req.log.warn({ statusCode }, 'Got error status, stopping');
                    break;
                }
            }

            if (redirectCount >= maxRedirects) {
                req.log.warn('Max redirects reached');
            }

            req.log.info({ finalUrl, contentType, statusCode, redirectCount }, 'Detection completed');

            // Detect media type from URL
            const detectFromUrl = (url: string): string => {
                const lower = url.toLowerCase();
                if (lower.includes('.m3u8') || lower.includes('m3u')) return 'hls';
                if (lower.includes('.flv')) return 'flv';
                if (lower.includes('.mpd')) return 'dash';
                if (lower.includes('.mp4')) return 'mp4';
                if (lower.includes('.mp3') || lower.includes('.aac')) return 'audio';
                return 'unknown';
            };

            // Detect from Content-Type
            let mediaType = 'unknown';
            const lowerContentType = contentType.toLowerCase();
            if (lowerContentType.includes('m3u8') || lowerContentType.includes('mpegurl')) {
                mediaType = 'hls';
            } else if (lowerContentType.includes('flv') || lowerContentType.includes('video/x-flv')) {
                mediaType = 'flv';
            } else if (lowerContentType.includes('dash')) {
                mediaType = 'dash';
            } else if (lowerContentType.includes('mp4')) {
                mediaType = 'mp4';
            } else if (lowerContentType.includes('audio/')) {
                mediaType = 'audio';
            }

            // Fallback to URL-based detection
            if (mediaType === 'unknown') {
                mediaType = detectFromUrl(finalUrl);
            }

            return reply.send({
                success: true,
                originalUrl: targetUrl,
                finalUrl: finalUrl,
                redirected: finalUrl !== targetUrl,
                mediaType: mediaType,
                contentType: contentType,
                statusCode: statusCode,
                downloadFilename: (req as any).downloadFilename || undefined
            });

        } catch (error: any) {
            req.log.error({ error, url: targetUrl }, 'Detection error');
            return reply.status(502).send({
                success: false,
                error: 'Detection Failed',
                message: error.message,
                originalUrl: targetUrl
            });
        }
    });
}
