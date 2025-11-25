import dotenv from 'dotenv';
import { parseSize } from './utils/size';

dotenv.config();

export const config = {
    PORT: parseInt(process.env.PORT || '3001', 10),
    ALLOWED_IPS: (process.env.ALLOWED_IPS || '').split(',').filter(Boolean),
    MAX_REQ_PER_MIN: parseInt(process.env.MAX_REQ_PER_MIN || '60', 10),
    MAX_BYTES_PER_DAY: parseSize(process.env.MAX_BYTES_PER_DAY || '1073741824'),
    BLOCKED_IPS: (process.env.BLOCKED_IPS || '').split(',').filter(Boolean),

    // Admin System
    ADMIN_SECRET: process.env.ADMIN_SECRET || '',
    ADMIN_API_PREFIX: process.env.ADMIN_API_PREFIX || '/admin',

    // Card-Key System
    CARD_KEY_ENABLED: process.env.CARD_KEY_ENABLED === 'true',
    CARD_KEY_DEFAULT_BANDWIDTH: parseSize(process.env.CARD_KEY_DEFAULT_BANDWIDTH || '10GB'),
    CARD_KEY_DEFAULT_RATE: parseInt(process.env.CARD_KEY_DEFAULT_RATE || '300', 10),
    CARD_KEY_DEFAULT_VALID_DAYS: parseInt(process.env.CARD_KEY_DEFAULT_VALID_DAYS || '30', 10),
};
