import { FastifyRequest, FastifyReply } from 'fastify';
import ipRangeCheck from 'ip-range-check';
import { config } from '../config';

export async function ipFilter(req: FastifyRequest, reply: FastifyReply) {
    const clientIp = req.ip;

    // Check Blacklist
    if (config.BLOCKED_IPS.includes(clientIp)) {
        reply.status(403).send({
            error: 'Access Denied',
            message: `Your IP (${clientIp}) is blacklisted.`,
        });
        return;
    }

    const allowed = ipRangeCheck(clientIp, config.ALLOWED_IPS);

    if (!allowed) {
        reply.status(403).send({
            error: 'Access Denied',
            message: `Your IP (${clientIp}) is not allowed to use this proxy.`,
        });
        return;
    }
}
