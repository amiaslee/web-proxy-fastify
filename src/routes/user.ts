import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cardKeyService } from '../services/card-key';
import { packageService } from '../services/package';
import { statsService } from '../services/stats';
import { config } from '../config';
import { getIPLimitConfig } from '../config/ip-limits';
import { formatBandwidth, timeUntil } from '../utils/format';

export async function userRoutes(fastify: FastifyInstance) {
    // Root endpoint - show user info, quotas, and packages
    // GET /
    fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
        const ip = (req.ip || req.socket.remoteAddress) as string;

        try {
            // Get IP-specific configuration
            const ipConfig = getIPLimitConfig(ip, config.MAX_REQ_PER_MIN, config.MAX_BYTES_PER_DAY);

            // Check if has custom limits
            const hasCustomLimits = ipConfig.maxRequestsPerMin !== config.MAX_REQ_PER_MIN ||
                ipConfig.maxBytesPerDay !== config.MAX_BYTES_PER_DAY;

            // Determine tier
            let tier = 'tier1';
            const packages = await packageService.getPackagesSummary(ip);
            if (packages.length > 0) {
                tier = 'tier3';
            } else if (hasCustomLimits) {
                tier = 'tier2';
            }

            // Get usage stats (with automatic daily/monthly reset)
            const stats = await statsService.getStats(ip);
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

            // Use dailyBytes (automatically resets at midnight)
            const todayBytes = stats.dailyBytes;

            // Calculate base quota usage (consumed first)
            const baseLimit = config.MAX_BYTES_PER_DAY;
            const baseUsed = Math.min(todayBytes, baseLimit);
            const baseRemaining = Math.max(0, baseLimit - todayBytes);

            // Calculate custom quota usage (consumed after base)
            // Custom bandwidth is ADDITIONAL to base (not included in total)
            let customLimit = 0;
            let customUsed = 0;
            let customRemaining = 0;
            if (hasCustomLimits) {
                // Custom limit is the configured value itself (additional)
                customLimit = ipConfig.maxBytesPerDay;

                const remainingAfterBase = Math.max(0, todayBytes - baseLimit);
                customUsed = Math.min(remainingAfterBase, customLimit);
                customRemaining = Math.max(0, customLimit - remainingAfterBase);
            }

            // Get package totals
            const packageRate = await packageService.getTotalRateLimit(ip);
            const packageBandwidth = await packageService.getTotalRemainingBandwidth(ip);

            // Build daily quota response
            const dailyQuota: any = {
                base: {
                    rate: config.MAX_REQ_PER_MIN,
                    bandwidth: formatBandwidth(baseLimit),
                    used: formatBandwidth(baseUsed),
                    remaining: formatBandwidth(baseRemaining)
                }
            };

            // Add custom quota if applicable
            if (hasCustomLimits) {
                dailyQuota.custom = {
                    rate: ipConfig.maxRequestsPerMin,
                    bandwidth: formatBandwidth(customLimit),
                    used: formatBandwidth(customUsed),
                    remaining: formatBandwidth(customRemaining)
                };
            }

            dailyQuota.resetsIn = timeUntil(new Date(endOfDay));

            // Calculate effective limits
            const allRates = [config.MAX_REQ_PER_MIN];
            if (hasCustomLimits) allRates.push(ipConfig.maxRequestsPerMin);
            if (packageRate > 0) allRates.push(packageRate);

            const totalDailyRemaining = baseRemaining + customRemaining;

            // Build response
            const response: any = {
                message: 'Web Proxy Server',
                yourIP: ip,
                tier,
                dailyQuota
            };


            // Add packages if any
            if (packages.length > 0) {
                response.packages = packages;
                response.effective = {
                    maxRate: Math.max(...allRates),
                    totalBandwidth: formatBandwidth(
                        BigInt(totalDailyRemaining) + packageBandwidth
                    )
                };
            } else {
                response.effective = {
                    maxRate: Math.max(...allRates),
                    totalBandwidth: formatBandwidth(totalDailyRemaining)
                };
            }

            response.endpoints = {
                proxy: '/https://example.com',
                cardInfo: '/card-info?code=YOUR_CARD_CODE',
                recharge: '/recharge?code=YOUR_CARD_CODE',
                health: '/health'
            };

            // Add usage statistics
            response.statistics = {
                daily: {
                    bytes: formatBandwidth(stats.dailyBytes),
                    requests: stats.dailyRequests
                },
                monthly: {
                    bytes: formatBandwidth(stats.monthlyBytes),
                    requests: stats.monthlyRequests
                },
                total: {
                    bytes: formatBandwidth(stats.totalBytes),
                    requests: stats.totalRequests
                }
            };

            return response;
        } catch (error: any) {
            req.log.error({ error, ip }, 'Failed to fetch user info');
            return {
                message: 'Web Proxy Server',
                yourIP: ip,
                error: 'Failed to load user info'
            };
        }
    });

    // Get card info (before redeeming)
    // GET /card-info?code=XXXXX
    fastify.get('/card-info', async (req: FastifyRequest, reply: FastifyReply) => {
        const { code } = req.query as { code?: string };

        if (!code) {
            return reply.status(400).send({
                error: 'Card code required',
                message: 'Please provide a card code in the query parameter'
            });
        }

        try {
            const info = await cardKeyService.getCardInfo(code.toUpperCase());
            return info;
        } catch (error: any) {
            req.log.error({ error, code }, 'Failed to get card info');
            return reply.status(500).send({ error: 'Failed to get card info', message: error.message });
        }
    });

    // Recharge with card key
    // GET /recharge?code=XXXXX
    fastify.get('/recharge', async (req: FastifyRequest, reply: FastifyReply) => {
        const ip = (req.ip || req.socket.remoteAddress) as string;
        const { code } = req.query as { code?: string };

        if (!code) {
            return reply.status(400).send({
                error: 'Card code required',
                message: 'Please provide a card code in the query parameter'
            });
        }

        try {
            const result = await cardKeyService.rechargeWithCard(ip, code.toUpperCase());

            if (!result.success) {
                return reply.status(400).send({ success: false, error: result.error });
            }

            return {
                success: true,
                message: 'Recharged successfully! Package activated.',
                package: {
                    bandwidth: result.bandwidth ? formatBandwidth(result.bandwidth) : '0B',
                    rateLimit: result.rateLimit,
                    validDays: result.validDays,
                    expiresIn: `${result.validDays} days`
                }
            };
        } catch (error: any) {
            req.log.error({ error, ip, code }, 'Recharge failed');
            return reply.status(500).send({ error: 'Recharge failed', message: error.message });
        }
    });
}
