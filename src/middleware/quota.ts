import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { statsService } from '../services/stats';
import { getIPLimitConfig } from '../config/ip-limits';
import { packageService } from '../services/package';

export async function quotaMiddleware(req: FastifyRequest, reply: FastifyReply) {
    // Skip quota for detect endpoint
    if (req.url.startsWith('/detect/')) {
        return;
    }
    const ip = (req.ip || req.socket.remoteAddress) as string;

    // Tier Priority: 3 (Packages) > 2 (Custom) > 1 (Default)
    let maxBytes = config.MAX_BYTES_PER_DAY;
    let usePackages = false;

    // Tier 3: Check user packages (recharged users)
    if (config.CARD_KEY_ENABLED) {
        const remaining = await packageService.getTotalRemainingBandwidth(ip);
        if (remaining > BigInt(0)) {
            // User has active packages with bandwidth
            usePackages = true;
            // No daily limit for package users, only check if package has bandwidth
        } else {
            // No active packages, fall back to Tier 2
            const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);
            maxBytes = ipConfig.maxBytesPerDay;
        }
    } else {
        // Tier 2: If card-key disabled, use IP config
        const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);
        maxBytes = ipConfig.maxBytesPerDay;
    }

    // For package users, check remaining bandwidth
    if (usePackages) {
        const remaining = await packageService.getTotalRemainingBandwidth(ip);
        if (remaining <= BigInt(0)) {
            req.log.warn(`Package bandwidth exceeded for IP: ${ip}`);
            reply.status(429).send({
                error: 'Bandwidth Quota Exceeded',
                message: 'All your packages have been used up. Please recharge or wait for tomorrow.',
                canRecharge: true
            });
            throw new Error('Bandwidth quota exceeded');
        }
    } else {
        // For non-package users, check daily quota
        const stats = await statsService.getStats(ip);

        // Get IP config to check total allowed bandwidth
        const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);

        // Total daily limit: base + custom (custom is additional)
        const totalDailyLimit = config.MAX_BYTES_PER_DAY + ipConfig.maxBytesPerDay;

        // Use dailyBytes from stats (resets automatically at midnight)
        const todayBytes = stats.dailyBytes;

        if (todayBytes >= totalDailyLimit) {
            req.log.warn(`Daily quota exceeded for IP: ${ip}`);
            reply.status(429).send({
                error: 'Daily Quota Exceeded',
                limit: totalDailyLimit,
                message: 'Daily bandwidth limit reached. Please recharge or wait until tomorrow.',
                canRecharge: true
            });
            throw new Error('Daily quota exceeded');
        }
    }
}
