import { prisma } from '../db';
import { packageService } from './package';
import crypto from 'crypto';

export class CardKeyService {
    // Generate random card code
    private generateCode(): string {
        return crypto.randomBytes(16).toString('hex').toUpperCase();
    }

    // Generate card keys with validDays
    async generateCards(
        count: number,
        bandwidth: bigint,
        rateLimit: number,
        validDays: number = 30
    ): Promise<string[]> {
        const codes: string[] = [];

        for (let i = 0; i < count; i++) {
            const code = this.generateCode();
            await prisma.cardKey.create({
                data: {
                    code,
                    bandwidth,
                    rateLimit,
                    validDays,
                    used: false
                }
            });
            codes.push(code);
        }

        return codes;
    }

    // Get unused cards or generate if insufficient
    async getOrGenerateCards(
        requiredCount: number,
        bandwidth: bigint,
        rateLimit: number,
        validDays: number = 30
    ): Promise<string[]> {
        // Get unused cards with matching specs
        const existingCards = await prisma.cardKey.findMany({
            where: {
                used: false,
                bandwidth,
                rateLimit,
                validDays
            },
            take: requiredCount,
            select: { code: true }
        });

        const existing = existingCards.map((c: any) => c.code);

        // If insufficient, generate more
        if (existing.length < requiredCount) {
            const needed = requiredCount - existing.length;
            const newCodes = await this.generateCards(needed, bandwidth, rateLimit, validDays);
            return [...existing, ...newCodes];
        }

        return existing;
    }

    // Get card info (without redeeming)
    async getCardInfo(code: string) {
        const card = await prisma.cardKey.findUnique({
            where: { code }
        });

        if (!card) {
            return {
                valid: false,
                error: 'Card not found'
            };
        }

        if (card.used) {
            const { maskIP } = await import('../utils/format');
            return {
                valid: false,
                error: 'Card already used',
                usedBy: card.usedBy ? maskIP(card.usedBy) : undefined,
                usedAt: card.usedAt
            };
        }

        if (card.expiresAt && new Date() > card.expiresAt) {
            return {
                valid: false,
                error: 'Card expired'
            };
        }

        const { formatBandwidth } = await import('../utils/format');
        return {
            valid: true,
            bandwidth: formatBandwidth(card.bandwidth),
            rateLimit: card.rateLimit,
            validDays: card.validDays
        };
    }

    // Recharge using card key (creates package)
    async rechargeWithCard(ip: string, code: string): Promise<{
        success: boolean;
        bandwidth?: bigint;
        rateLimit?: number;
        validDays?: number;
        error?: string;
    }> {
        // Find card
        const card = await prisma.cardKey.findUnique({
            where: { code }
        });

        if (!card) {
            return { success: false, error: 'Invalid card code' };
        }

        if (card.used) {
            return { success: false, error: 'Card already used' };
        }

        if (card.expiresAt && new Date() > card.expiresAt) {
            return { success: false, error: 'Card expired' };
        }

        // Mark card as used
        await prisma.cardKey.update({
            where: { code },
            data: {
                used: true,
                usedBy: ip,
                usedAt: new Date()
            }
        });

        // Record recharge
        await prisma.userRecharge.create({
            data: {
                ipAddress: ip,
                bandwidthAdded: card.bandwidth,
                rateAdded: card.rateLimit,
                cardCode: code
            }
        });

        // Create package for user
        await packageService.createPackage(
            ip,
            card.bandwidth,
            card.rateLimit,
            card.validDays,
            code
        );

        return {
            success: true,
            bandwidth: card.bandwidth,
            rateLimit: card.rateLimit,
            validDays: card.validDays
        };
    }
}

export const cardKeyService = new CardKeyService();
