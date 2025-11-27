// Format bytes to human-readable units (MB, GB, TB)
export function formatBandwidth(bytes: bigint | number): string {
    const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;

    if (num === -1) return 'Unlimited';

    const TB = 1024 * 1024 * 1024 * 1024;
    const GB = 1024 * 1024 * 1024;
    const MB = 1024 * 1024;
    const KB = 1024;

    if (num >= TB) {
        return `${(num / TB).toFixed(2)}TB`;
    } else if (num >= GB) {
        return `${(num / GB).toFixed(2)}GB`;
    } else if (num >= MB) {
        return `${(num / MB).toFixed(2)}MB`;
    } else if (num >= KB) {
        return `${(num / KB).toFixed(2)}KB`;
    } else {
        return `${num}B`;
    }
}

// Mask IP address for privacy
// Examples:
//   192.168.1.100 -> 192.168.*.**
//   2001:db8::1 -> 2001:db8::*
export function maskIP(ip: string): string {
    if (ip.includes(':')) {
        // IPv6 - show first 2 segments
        const parts = ip.split(':');
        if (parts.length > 2) {
            return `${parts[0]}:${parts[1]}::*`;
        }
        return ip;
    } else {
        // IPv4 - show first 2 octets
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.*.**`;
        }
        return ip;
    }
}

// Calculate time remaining until a date
export function timeUntil(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff <= 0) {
        return 'expired';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
}
