/**
 * Parse size string with units (e.g., "10GB", "500MB", "1gb", "1073741824")
 * Supports: KB, MB, GB, TB (case insensitive)
 * No unit = bytes
 */
export function parseSize(sizeStr: string): number {
    const str = sizeStr.trim().toUpperCase();
    const match = str.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)?$/);

    if (!match) {
        console.error(`Invalid size format: ${sizeStr}`);
        return 0;
    }

    const value = parseFloat(match[1]);
    const unit = match[2] || 'B';

    const multipliers: Record<string, number> = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024
    };

    return Math.floor(value * multipliers[unit]);
}
