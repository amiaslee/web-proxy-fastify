import Fastify from 'fastify';
import net from 'net';
import { config } from './config';
import { ipFilter } from './middleware/ip-filter';
import { quotaMiddleware } from './middleware/quota';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { proxyRoutes } from './routes/proxy';
import { httpProxyRoutes } from './routes/http-proxy';
import { adminRoutes } from './routes/admin';
import { userRoutes } from './routes/user';

// Create Fastify instance with trust proxy enabled for Docker/reverse proxy environments
const fastify = Fastify({
    logger: true,
    trustProxy: true, // Trust X-Forwarded-For headers from reverse proxies
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
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
fastify.addHook('onRequest', rateLimitMiddleware);
fastify.addHook('onRequest', quotaMiddleware);

// Register Admin Routes (admin endpoints)
fastify.register(adminRoutes);

// Register User Routes (balance, recharge, root)
fastify.register(userRoutes);

// Register HTTP Proxy Routes (for CLI tools with absolute URLs)
fastify.register(httpProxyRoutes);

// Register Web Proxy Routes LAST (catches everything else)
fastify.register(proxyRoutes);

// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', service: 'Web Proxy' };
});

// Handle CONNECT method for HTTPS tunneling (required for curl -x with HTTPS)
fastify.server.on('connect', (req, clientSocket, head) => {
    const { hostname, port } = parseConnectUrl(req.url || '');

    fastify.log.info({ hostname, port }, 'CONNECT request received');

    // Connect to the target server
    const serverSocket = net.connect(parseInt(port) || 443, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
        fastify.log.error({ error: err, hostname, port }, 'CONNECT tunnel error');
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });

    clientSocket.on('error', (err) => {
        fastify.log.error({ error: err }, 'Client socket error');
        serverSocket.end();
    });
});

// Helper function to parse CONNECT URL
function parseConnectUrl(url: string): { hostname: string; port: string } {
    const parts = url.split(':');
    return {
        hostname: parts[0],
        port: parts[1] || '443'
    };
}

// Start Server
const start = async () => {
    try {
        await fastify.listen({ port: config.PORT, host: config.HOST });
        console.log(`Server listening on http://${config.HOST}:${config.PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
