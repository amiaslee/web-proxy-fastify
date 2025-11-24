import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

export interface UserStats {
    totalBytes: number;
    requests: number;
    lastRequestTime: number;
    history: { url: string; timestamp: number }[];
}

export const statsService = {
    async getStats(ip: string): Promise<UserStats> {
        const stats = await prisma.userStats.findUnique({
            where: { ip },
        });

        if (!stats) {
            return {
                totalBytes: 0,
                requests: 0,
                lastRequestTime: 0,
                history: [],
            };
        }

        // Fetch recent history (limit 50)
        const history = await prisma.requestLog.findMany({
            where: { ip },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });

        return {
            totalBytes: Number(stats.totalBytes),
            requests: stats.requests,
            lastRequestTime: stats.lastRequestTime.getTime(),
            history: history.map(h => ({ url: h.url, timestamp: h.timestamp.getTime() })),
        };
    },

    async recordRequest(ip: string, url: string) {
        await prisma.$transaction([
            prisma.userStats.upsert({
                where: { ip },
                update: {
                    requests: { increment: 1 },
                    lastRequestTime: new Date(),
                },
                create: {
                    ip,
                    requests: 1,
                    lastRequestTime: new Date(),
                    totalBytes: 0,
                },
            }),
            prisma.requestLog.create({
                data: {
                    ip,
                    url,
                },
            }),
        ]);
    },

    async recordTraffic(ip: string, bytes: number) {
        await prisma.userStats.upsert({
            where: { ip },
            update: {
                totalBytes: { increment: bytes },
            },
            create: {
                ip,
                totalBytes: bytes,
                requests: 0, // Should exist if recordRequest called first, but safe fallback
            },
        });
    },

    async getAllStats() {
        const allStats = await prisma.userStats.findMany();
        const result: Record<string, UserStats> = {};

        for (const stat of allStats) {
            result[stat.ip] = {
                totalBytes: Number(stat.totalBytes),
                requests: stat.requests,
                lastRequestTime: stat.lastRequestTime.getTime(),
                history: [], // Omit history for bulk fetch to save performance
            };
        }
        return result;
    }
};
