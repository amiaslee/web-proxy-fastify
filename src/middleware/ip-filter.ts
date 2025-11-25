import { FastifyRequest, FastifyReply } from 'fastify';
import ipRangeCheck from 'ip-range-check';
import { config } from '../config';

export async function ipFilter(req: FastifyRequest, reply: FastifyReply) {
    const clientIp = req.ip;

    // Check Blacklist first (always enforced)
    if (config.BLOCKED_IPS.includes(clientIp)) {
        reply.status(403).send({
            error: 'Access Denied',
            message: `Your IP (${clientIp}) is blacklisted.`,
        });
        return;
    }

    // Allow all IPs if ALLOWED_IPS contains '*' or is empty
    if (config.ALLOWED_IPS.includes('*') || config.ALLOWED_IPS.length === 0) {
        return; // Skip IP whitelist check
    }

    // Check IP whitelist
    const allowed = ipRangeCheck(clientIp, config.ALLOWED_IPS);

    if (!allowed) {
        reply.status(403).send({
            error: 'Access Denied',
            message: `Your IP (${clientIp}) is not allowed to use this proxy.`,
        });
        return;
    }
}
