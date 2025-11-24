export function encodeUrl(url: string): string {
    return Buffer.from(url).toString('base64');
}

export function decodeUrl(encoded: string): string {
    try {
        return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (e) {
        throw new Error('Invalid Base64 URL');
    }
}

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}
