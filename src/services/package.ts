import { prisma } from '../db';

export class PackageService {
    // Create package on recharge
    async createPackage(
        ip: string,
        bandwidth: bigint,
        rateLimit: number,
        validDays: number,
        cardCode?: string
    ) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

        return await prisma.userPackage.create({
            data: {
                ipAddress: ip,
                bandwidth,
                bandwidthUsed: BigInt(0),
                rateLimit,
                validDays,
                activatedAt: now,
                expiresAt,
                cardCode,
                active: true
            }
        });
    }

    // Get active packages for IP
    async getActivePackages(ip: string) {
        const now = new Date();

        // Get packages that are active and not expired
        const packages = await prisma.userPackage.findMany({
            where: {
                ipAddress: ip,
                active: true,
                expiresAt: { gt: now }
            },
            orderBy: {
                expiresAt: 'asc' // Use expiring-soon first
            }
        });

        // Deactivate expired packages
        await prisma.userPackage.updateMany({
            where: {
                ipAddress: ip,
                active: true,
                expiresAt: { lte: now }
            },
            data: { active: false }
        });

        return packages;
    }

    // Get total available rate limit
    async getTotalRateLimit(ip: string): Promise<number> {
        const packages = await this.getActivePackages(ip);
        if (packages.length === 0) return 0;

        // Return max rate from all packages
        return Math.max(...packages.map(p => p.rateLimit));
    }

    // Get total remaining bandwidth
    async getTotalRemainingBandwidth(ip: string): Promise<bigint> {
        const packages = await this.getActivePackages(ip);

        return packages.reduce((total, pkg) => {
            const remaining = pkg.bandwidth - pkg.bandwidthUsed;
            return total + (remaining > BigInt(0) ? remaining : BigInt(0));
        }, BigInt(0));
    }

    // Deduct bandwidth from packages (use expiring-soon first)
    async deductBandwidth(ip: string, bytes: bigint): Promise<boolean> {
        const packages = await this.getActivePackages(ip);

        let remaining = bytes;

        for (const pkg of packages) {
            if (remaining <= BigInt(0)) break;

            const available = pkg.bandwidth - pkg.bandwidthUsed;
            if (available <= BigInt(0)) continue;

            const toDeduct = remaining < available ? remaining : available;

            await prisma.userPackage.update({
                where: { id: pkg.id },
                data: {
                    bandwidthUsed: pkg.bandwidthUsed + toDeduct
                }
            });

            remaining -= toDeduct;
        }

        return remaining <= BigInt(0); // True if all bytes were deducted
    }

    // Get package summary for user
    async getPackagesSummary(ip: string) {
        const packages = await this.getActivePackages(ip);
        const { formatBandwidth, timeUntil } = await import('../utils/format');

        return packages.map((pkg: any) => {
            const remaining = pkg.bandwidth - pkg.bandwidthUsed;

            return {
                id: pkg.id,
                bandwidth: formatBandwidth(pkg.bandwidth),
                used: formatBandwidth(pkg.bandwidthUsed),
                remaining: formatBandwidth(remaining),
                rateLimit: pkg.rateLimit,
                validDays: pkg.validDays,
                expiresAt: pkg.expiresAt,
                expiresIn: timeUntil(pkg.expiresAt),
                cardCode: pkg.cardCode
            };
        });
    }
}

export const packageService = new PackageService();
