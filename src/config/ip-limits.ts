import { parseSize } from '../utils/size';

export interface IPLimitConfig {
    maxRequestsPerMin: number;
    maxBytesPerDay: number;
}

/**
 * Load IP limit configurations from environment variables
 * Format: IP_LIMITS1=127.0.0.1,1000,10GB
 *         IP_LIMITS2=192.168.1.100,120,5GB
 * 
 * Fields: IP,maxRequestsPerMin,maxBytesPerDay
 */
function loadIPLimitConfigs(): Record<string, IPLimitConfig> {
    const configs: Record<string, IPLimitConfig> = {};

    // Find all IP_LIMITS* environment variables
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('IP_LIMITS') && value) {
            const parts = value.split(',').map(p => p.trim());

            if (parts.length !== 3) {
                console.error(`Invalid IP_LIMITS format in ${key}: ${value}`);
                console.error(`Expected format: IP,requests_per_min,bytes_per_day (e.g., 127.0.0.1,1000,10GB)`);
                continue;
            }

            const [ip, reqPerMin, bytesPerDay] = parts;
            const maxRequestsPerMin = parseInt(reqPerMin, 10);
            const maxBytesPerDay = parseSize(bytesPerDay);

            if (isNaN(maxRequestsPerMin) || maxRequestsPerMin <= 0) {
                console.error(`Invalid requests per minute in ${key}: ${reqPerMin}`);
                continue;
            }

            if (maxBytesPerDay <= 0) {
                console.error(`Invalid bytes per day in ${key}: ${bytesPerDay}`);
                continue;
            }

            configs[ip] = {
                maxRequestsPerMin,
                maxBytesPerDay
            };

            console.log(`✓ Loaded IP limit: ${ip} → ${maxRequestsPerMin} req/min, ${bytesPerDay}`);
        }
    }

    return configs;
}

// Load configurations from environment
export const ipLimitConfigs = loadIPLimitConfigs();

/**
 * Get rate limit configuration for a specific IP
 * Falls back to global config if no specific config exists
 */
export function getIPLimitConfig(ip: string, globalMaxReqPerMin: number, globalMaxBytesPerDay: number): {
    maxRequestsPerMin: number;
    maxBytesPerDay: number;
} {
    // Check for exact IP match first
    if (ipLimitConfigs[ip]) {
        return ipLimitConfigs[ip];
    }

    // Check for CIDR range match
    for (const [range, config] of Object.entries(ipLimitConfigs)) {
        if (range.includes('/')) {
            try {
                const ipRangeCheck = require('ip-range-check');
                if (ipRangeCheck(ip, range)) {
                    return config;
                }
            } catch (error) {
                // ip-range-check not available, skip CIDR matching
            }
        }
    }

    // Return global defaults
    return {
        maxRequestsPerMin: globalMaxReqPerMin,
        maxBytesPerDay: globalMaxBytesPerDay
    };
}
