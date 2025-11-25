import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

export interface UserStats {
    totalBytes: number;
    totalRequests: number;
    dailyBytes: number;
    dailyRequests: number;
    monthlyBytes: number;
    monthlyRequests: number;
    lastRequestTime: number;
    history: { url: string; timestamp: number }[];
}

export const statsService = {
    // Check and reset daily stats if needed
    async checkAndResetDaily(ip: string) {
        const stats = await prisma.userStats.findUnique({
            where: { ip },
        });

        if (!stats) return;

        const now = new Date();
        const resetTime = new Date(stats.dailyResetAt);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Reset if last reset was before today
        if (resetTime < startOfToday) {
            await prisma.userStats.update({
                where: { ip },
                data: {
                    dailyBytes: 0,
                    dailyRequests: 0,
                    dailyResetAt: startOfToday,
                },
            });
        }
    },

    // Check and reset monthly stats if needed
    async checkAndResetMonthly(ip: string) {
        const stats = await prisma.userStats.findUnique({
            where: { ip },
        });

        if (!stats) return;

        const now = new Date();
        const resetTime = new Date(stats.monthlyResetAt);
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Reset if last reset was before this month
        if (resetTime < startOfThisMonth) {
            await prisma.userStats.update({
                where: { ip },
                data: {
                    monthlyBytes: 0,
                    monthlyRequests: 0,
                    monthlyResetAt: startOfThisMonth,
                },
            });
        }
    },

    async getStats(ip: string): Promise<UserStats> {
        // Check and reset if needed
        await this.checkAndResetDaily(ip);
        await this.checkAndResetMonthly(ip);

        const stats = await prisma.userStats.findUnique({
            where: { ip },
        });

        if (!stats) {
            return {
                totalBytes: 0,
                totalRequests: 0,
                dailyBytes: 0,
                dailyRequests: 0,
                monthlyBytes: 0,
                monthlyRequests: 0,
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
            totalRequests: stats.totalRequests,
            dailyBytes: Number(stats.dailyBytes),
            dailyRequests: stats.dailyRequests,
            monthlyBytes: Number(stats.monthlyBytes),
            monthlyRequests: stats.monthlyRequests,
            lastRequestTime: stats.lastRequestTime.getTime(),
            history: history.map(h => ({ url: h.url, timestamp: h.timestamp.getTime() })),
        };
    },

    async recordRequest(ip: string, url: string) {
        // Check and reset before recording
        await this.checkAndResetDaily(ip);
        await this.checkAndResetMonthly(ip);

        const now = new Date();
        await prisma.$transaction([
            prisma.userStats.upsert({
                where: { ip },
                update: {
                    dailyRequests: { increment: 1 },
                    monthlyRequests: { increment: 1 },
                    totalRequests: { increment: 1 },
                    lastRequestTime: now,
                },
                create: {
                    ip,
                    dailyRequests: 1,
                    monthlyRequests: 1,
                    totalRequests: 1,
                    lastRequestTime: now,
                    totalBytes: 0,
                    dailyBytes: 0,
                    monthlyBytes: 0,
                    dailyResetAt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    monthlyResetAt: new Date(now.getFullYear(), now.getMonth(), 1),
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

    // Record traffic to daily quota (base or custom)
    async recordDailyTraffic(ip: string, bytes: number) {
        await this.checkAndResetDaily(ip);
        await this.checkAndResetMonthly(ip);

        await prisma.userStats.upsert({
            where: { ip },
            update: {
                dailyBytes: { increment: bytes },
                monthlyBytes: { increment: bytes },
                totalBytes: { increment: bytes },
            },
            create: {
                ip,
                totalBytes: bytes,
                dailyBytes: bytes,
                monthlyBytes: bytes,
                totalRequests: 0,
                dailyRequests: 0,
                monthlyRequests: 0,
                lastRequestTime: new Date(),
                dailyResetAt: new Date(),
                monthlyResetAt: new Date(),
            },
        });
    },

    // Record traffic to packages (not included in daily)
    async recordPackageTraffic(ip: string, bytes: number) {
        await prisma.userStats.upsert({
            where: { ip },
            update: {
                monthlyBytes: { increment: bytes },
                totalBytes: { increment: bytes },
            },
            create: {
                ip,
                totalBytes: bytes,
                dailyBytes: 0,
                monthlyBytes: bytes,
                totalRequests: 0,
                dailyRequests: 0,
                monthlyRequests: 0,
                lastRequestTime: new Date(),
                dailyResetAt: new Date(),
                monthlyResetAt: new Date(),
            },
        });
    },

    // Legacy method for backward compatibility
    async recordTraffic(ip: string, bytes: number) {
        // Default to daily traffic
        await this.recordDailyTraffic(ip, bytes);
    },

    async getAllStats() {
        const allStats = await prisma.userStats.findMany();
        const result: Record<string, UserStats> = {};

        for (const stat of allStats) {
            result[stat.ip] = {
                totalBytes: Number(stat.totalBytes),
                totalRequests: stat.totalRequests,
                dailyBytes: Number(stat.dailyBytes),
                dailyRequests: stat.dailyRequests,
                monthlyBytes: Number(stat.monthlyBytes),
                monthlyRequests: stat.monthlyRequests,
                lastRequestTime: stat.lastRequestTime.getTime(),
                history: [], // Omit history for bulk fetch to save performance
            };
        }
        return result;
    },
};
