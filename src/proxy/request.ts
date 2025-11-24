import { request } from 'undici';
import { IncomingHttpHeaders } from 'http';
import { Readable } from 'stream';

export async function fetchUpstream(
    targetUrl: string,
    method: string,
    headers: IncomingHttpHeaders,
    body: Readable | Buffer | string | null
) {
    // Filter headers that shouldn't be forwarded
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (key.startsWith('cf-') || key === 'host' || key === 'connection' || key === 'accept-encoding') continue;
        if (typeof value === 'string') {
            forwardHeaders[key] = value;
        } else if (Array.isArray(value)) {
            forwardHeaders[key] = value.join(', ');
        }
    }

    // Add User-Agent if missing (optional, but good for some sites)
    if (!forwardHeaders['user-agent']) {
        forwardHeaders['user-agent'] = 'Mozilla/5.0 (Compatible; WebProxy/1.0)';
    }

    try {
        const response = await request(targetUrl, {
            method: method as any,
            headers: forwardHeaders,
            body: body || undefined,
            maxRedirections: 0, // We handle redirects manually to rewrite them
        } as any);
        return response;
    } catch (error: any) {
        throw new Error(`Upstream Error: ${error.message}`);
    }
}
