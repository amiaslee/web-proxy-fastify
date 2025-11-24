import Fastify from 'fastify';
import { config } from './config';
import { ipFilter } from './middleware/ip-filter';

const fastify = Fastify({
    logger: true,
});

// Global Error Handler
fastify.setErrorHandler((error: any, request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
        error: error.name,
        message: error.message,
        statusCode: error.statusCode || 500,
    });
});

// Middleware
fastify.addHook('onRequest', ipFilter);

import { loggerMiddleware } from './middleware/logger';
import { quotaMiddleware } from './middleware/quota';
import { rateLimitMiddleware } from './middleware/rate-limit';

fastify.addHook('onRequest', loggerMiddleware);
fastify.addHook('onRequest', quotaMiddleware);
fastify.addHook('onRequest', rateLimitMiddleware);

// Register Routes
import { proxyRoutes } from './routes/proxy';

fastify.register(proxyRoutes);

// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', service: 'Web Proxy' };
});

// Start Server
const start = async () => {
    try {
        await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
        console.log(`Server listening on http://0.0.0.0:${config.PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
