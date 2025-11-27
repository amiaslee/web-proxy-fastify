import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cardKeyService } from '../services/card-key';
import { prisma } from '../db';
import { config } from '../config';
import { parseSize } from '../utils/size';

export async function adminRoutes(fastify: FastifyInstance) {
    const prefix = config.ADMIN_API_PREFIX || '/admin';

    // Middleware to check admin secret
    const verifyAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
        const { secret } = req.query as any;
        if (!secret || secret !== config.ADMIN_SECRET) {
            reply.status(401).send({ error: 'Unauthorized', message: 'Invalid admin secret' });
            return false;
        }
        return true;
    };

    // Generate card keys
    // GET /admin/generate-cards?secret=xxx&count=10&bandwidth=10GB&rate=300&days=30
    fastify.get(`${prefix}/generate-cards`, async (req: FastifyRequest, reply: FastifyReply) => {
        if (!await verifyAdmin(req, reply)) return;

        const { count, bandwidth, rate, days } = req.query as any;

        const cardCount = parseInt(count) || 10;

        let bandwidthBytes: number;
        if (bandwidth === '*') {
            bandwidthBytes = -1;
        } else {
            bandwidthBytes = parseSize(bandwidth || config.CARD_KEY_DEFAULT_BANDWIDTH.toString());
        }

        let rateLimit: number;
        if (rate === '*') {
            rateLimit = -1;
        } else {
            rateLimit = parseInt(rate) || config.CARD_KEY_DEFAULT_RATE;
        }

        const validDays = parseInt(days) || config.CARD_KEY_DEFAULT_VALID_DAYS;

        try {
            const codes = await cardKeyService.getOrGenerateCards(
                cardCount,
                BigInt(bandwidthBytes),
                rateLimit,
                validDays
            );

            // Return as downloadable text file
            const text = codes.join('\n');
            reply.header('Content-Type', 'text/plain');
            reply.header('Content-Disposition', 'attachment; filename="card-keys.txt"');
            return reply.send(text);
        } catch (error: any) {
            req.log.error({ error }, 'Failed to generate cards');
            return reply.status(500).send({ error: 'Failed to generate cards', message: error.message });
        }
    });

    // Get system stats
    // GET /admin/stats?secret=xxx
    fastify.get(`${prefix}/stats`, async (req: FastifyRequest, reply: FastifyReply) => {
        if (!await verifyAdmin(req, reply)) return;

        try {
            const totalCards = await prisma.cardKey.count();
            const usedCards = await prisma.cardKey.count({ where: { used: true } });
            const activeUsers = await prisma.userBalance.count();
            const totalRecharges = await prisma.userRecharge.count();

            return {
                cards: {
                    total: totalCards,
                    used: usedCards,
                    unused: totalCards - usedCards
                },
                users: {
                    active: activeUsers
                },
                recharges: {
                    total: totalRecharges
                }
            };
        } catch (error: any) {
            req.log.error({ error }, 'Failed to fetch stats');
            return reply.status(500).send({ error: 'Failed to fetch stats', message: error.message });
        }
    });

    // List recent recharges
    // GET /admin/recharges?secret=xxx&limit=20
    fastify.get(`${prefix}/recharges`, async (req: FastifyRequest, reply: FastifyReply) => {
        if (!await verifyAdmin(req, reply)) return;

        const { limit } = req.query as any;
        const takeLimit = parseInt(limit) || 20;

        try {
            const recharges = await prisma.userRecharge.findMany({
                take: takeLimit,
                orderBy: { rechargedAt: 'desc' },
                select: {
                    ipAddress: true,
                    bandwidthAdded: true,
                    rateAdded: true,
                    cardCode: true,
                    rechargedAt: true
                }
            });

            return {
                recharges: recharges.map(r => ({
                    ip: r.ipAddress,
                    bandwidth: r.bandwidthAdded.toString(),
                    rate: r.rateAdded,
                    card: r.cardCode,
                    time: r.rechargedAt
                }))
            };
        } catch (error: any) {
            req.log.error({ error }, 'Failed to fetch recharges');
            return reply.status(500).send({ error: 'Failed to fetch recharges', message: error.message });
        }
    });
}
