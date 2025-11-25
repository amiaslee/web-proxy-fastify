import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { statsService } from '../services/stats';
import { getIPLimitConfig } from '../config/ip-limits';
import { packageService } from '../services/package';

export async function rateLimitMiddleware(req: FastifyRequest, reply: FastifyReply) {
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

    const stats = await statsService.getStats(ip);
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Count requests in the last minute
    const recentRequests = stats.history.filter((h: any) => h.timestamp > oneMinuteAgo).length;

    if (recentRequests >= maxRequests) {
        req.log.warn(`Rate limit exceeded for IP: ${ip}`);
        reply.status(429).send({
            error: 'Rate Limit Exceeded',
            limit: maxRequests,
            message: 'You have exceeded the rate limit. Please try again later or recharge.'
        });
        // CRITICAL: Throw error to halt request processing
        throw new Error('Rate limit exceeded');
    }
}
