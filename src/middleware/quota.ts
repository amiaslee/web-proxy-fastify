import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { statsService } from '../services/stats';
import { getIPLimitConfig } from '../config/ip-limits';
import { packageService } from '../services/package';
import { formatBandwidth } from '../utils/format';

export async function quotaMiddleware(req: FastifyRequest, reply: FastifyReply) {
    // Skip quota for system paths
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
    let maxBytes = config.MAX_BYTES_PER_DAY;
    let usePackages = false;

    // Tier 3: Check user packages (recharged users)
    if (config.CARD_KEY_ENABLED) {
        const remaining = await packageService.getTotalRemainingBandwidth(ip);

        // Check if unlimited package exists (-1)
        if (remaining === BigInt(-1)) {
            return; // Unlimited bandwidth
        }

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

        // Double check for unlimited (should be caught above but safe to check)
        if (remaining === BigInt(-1)) return;

        if (remaining <= BigInt(0)) {
            req.log.warn(`Package bandwidth exceeded for IP: ${ip}`);
            return reply.status(429).send({
                error: 'Bandwidth Quota Exceeded',
                message: 'All your packages have been used up. Please recharge or wait for tomorrow.',
                canRecharge: true
            });
        }
    } else {
        // For non-package users, check daily quota
        const stats = await statsService.getStats(ip);

        // Get IP config to check total allowed bandwidth
        const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);

        // Total daily limit: use the IP-specific limit (which defaults to global limit if not customized)
        const totalDailyLimit = ipConfig.maxBytesPerDay;

        // Check if unlimited (-1)
        if (totalDailyLimit === -1) {
            return;
        }

        // Use dailyBytes from stats (resets automatically at midnight)
        const todayBytes = stats.dailyBytes;

        if (todayBytes >= totalDailyLimit) {
            req.log.warn(`Daily quota exceeded for IP: ${ip}`);
            return reply.status(429).send({
                error: 'Daily Quota Exceeded',
                limit: formatBandwidth(totalDailyLimit),
                message: 'Daily bandwidth limit reached. Please recharge or wait until tomorrow.',
                canRecharge: true
            });
        }
    }
}
