import { FastifyRequest, FastifyReply } from 'fastify';
import { statsService } from '../services/stats';
import { config } from '../config';

export async function quotaMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const ip = req.ip;
    const stats = await statsService.getStats(ip);

    if (stats.totalBytes > config.MAX_BYTES_PER_DAY) {
        reply.status(403).send({
            error: 'Quota Exceeded',
            message: `You have exceeded your daily traffic limit of ${config.MAX_BYTES_PER_DAY} bytes.`,
            usage: stats.totalBytes
        });
        return;
    }
}
