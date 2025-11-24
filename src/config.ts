import dotenv from 'dotenv';
dotenv.config();

export const config = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    ALLOWED_IPS: (process.env.ALLOWED_IPS || '127.0.0.1').split(',').map(ip => ip.trim()),
    PROXY_SECRET: process.env.PROXY_SECRET || '',
    MAX_REQ_PER_MIN: parseInt(process.env.MAX_REQ_PER_MIN || '60', 10),
    MAX_BYTES_PER_DAY: parseInt(process.env.MAX_BYTES_PER_DAY || '104857600', 10), // 100MB default
    BLOCKED_IPS: (process.env.BLOCKED_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
};
