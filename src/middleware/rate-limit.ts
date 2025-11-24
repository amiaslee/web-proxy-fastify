import { FastifyRequest, FastifyReply } from 'fastify';
import { statsService } from '../services/stats';
import { config } from '../config';

// Simple window based rate limiting
// For production, use a sliding window or token bucket
export async function rateLimitMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const ip = req.ip;
    const stats = await statsService.getStats(ip);

    // Check requests in last minute
    // Since our stats.history is limited, we can count timestamps > now - 60s
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequests = stats.history.filter(h => h.timestamp > oneMinuteAgo).length;

    if (recentRequests >= config.MAX_REQ_PER_MIN) {
        reply.status(429).send({
            error: 'Too Many Requests',
            message: `Rate limit exceeded (${config.MAX_REQ_PER_MIN} req/min).`,
            retryAfter: 60
        });
        return;
    }
}
