import { FastifyRequest } from 'fastify';

/**
 * Get real client IP address from request
 * Handles reverse proxy scenarios (Nginx, Docker, 1Panel, etc.)
 */
export function getRealIP(req: FastifyRequest): string {
    // Priority order:
    // 1. X-Real-IP (most common in Nginx)
    // 2. X-Forwarded-For (standard, first IP is client)
    // 3. req.ip (Fastify's automatic detection with trustProxy)
    // 4. req.socket.remoteAddress (fallback)

    const xRealIP = req.headers['x-real-ip'] as string;
    if (xRealIP) {
        return xRealIP;
    }

    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    if (xForwardedFor) {
        // X-Forwarded-For can be: "client, proxy1, proxy2"
        // We want the first one (original client)
        return xForwardedFor.split(',')[0].trim();
    }

    // Fastify with trustProxy enabled will set req.ip correctly
    if (req.ip) {
        return req.ip;
    }

    // Fallback to socket address
    return req.socket.remoteAddress || '0.0.0.0';
}
