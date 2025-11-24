import { FastifyRequest, FastifyReply } from 'fastify';
import { statsService } from '../services/stats';

export async function loggerMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const ip = req.ip;
    const url = req.raw.url || 'unknown';

    // Record Request
    await statsService.recordRequest(ip, url);
    req.log.info({ msg: 'Incoming Request', ip, url, method: req.method });

    // Hook into response to record traffic
    reply.raw.on('finish', async () => {
        let size = 0;
        const contentLength = reply.getHeader('content-length');
        if (contentLength) {
            size = parseInt(contentLength as string, 10);
        }
        size += 500; // Header overhead
        await statsService.recordTraffic(ip, size);
    });
}
