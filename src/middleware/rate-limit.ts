import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { statsService } from '../services/stats';
import { getIPLimitConfig } from '../config/ip-limits';
import { packageService } from '../services/package';

export async function rateLimitMiddleware(req: FastifyRequest, reply: FastifyReply) {
    // Skip rate limiting for system paths
    if (
        req.url.startsWith('/detect/') ||
        req.url === '/' ||
        req.url.startsWith('/card-info') ||
        req.url.startsWith('/recharge') ||
        req.url.startsWith('/health') ||
        req.url.startsWith(config.ADMIN_API_PREFIX)
    ) {
        return;
    }

    const ip = (req.ip || req.socket.remoteAddress) as string;

    // Tier Priority: 3 (Packages) > 2 (Custom) > 1 (Default)
    let maxRequests = config.MAX_REQ_PER_MIN;

    // Tier 3: Check user packages (recharged users)
    if (config.CARD_KEY_ENABLED) {
        const packageRate = await packageService.getTotalRateLimit(ip);
        if (packageRate > 0) {
            maxRequests = packageRate;
        } else {
            // Tier 2: Check IP-specific configuration (custom users)
            const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);
            maxRequests = ipConfig.maxRequestsPerMin;
        }
    } else {
        // Tier 2: If card-key disabled, use IP config
        const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);
        maxRequests = ipConfig.maxRequestsPerMin;
    }

    // CRITICAL FIX: Query database directly for recent requests to avoid race conditions
    // This ensures we get the most up-to-date count, including concurrent requests
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentRequests = await statsService.countRecentRequests(ip, oneMinuteAgo);

    // Check if unlimited (-1)
    if (maxRequests === -1) {
        return;
    }

    if (recentRequests >= maxRequests) {
        req.log.warn(`Rate limit exceeded for IP: ${ip} (${recentRequests}/${maxRequests})`);
        return reply.status(429).send({
            error: 'Rate Limit Exceeded',
            limit: `${maxRequests} requests/minute`,
            current: recentRequests,
            message: 'You have exceeded the rate limit. Please try again later or recharge.'
        });
    }
}
