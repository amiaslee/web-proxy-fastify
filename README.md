# Web Proxy with Fastify

A high-performance, feature-rich web proxy server built with Fastify, Undici, and PostgreSQL. This proxy enables seamless browsing of any website through your own server with advanced features like traffic statistics, IP filtering, rate limiting, and CORS support.

## 🌟 Features

### Core Proxy Functionality
- **Universal Web Proxy**: Access any website through your proxy server
- **Smart URL Rewriting**: Automatically rewrites HTML, CSS, and JavaScript to route all resources through the proxy
- **Binary Content Support**: Properly handles images, fonts, videos, and other binary assets
- **Dynamic Content Handling**: MutationObserver-based interception for dynamically loaded content
- **CORS Support**: Inspired by `cors-anywhere`, enables cross-origin resource access

### Security & Access Control
- **IP Whitelisting**: Restrict access to specific IP addresses or ranges
- **IP Blacklisting**: Block malicious IPs from accessing the proxy
- **Rate Limiting**: Configurable requests-per-minute limits per IP
- **Daily Quota**: Set maximum bytes per day per IP address

### Traffic Management
- **PostgreSQL Integration**: Persistent storage for statistics and logs
- **Real-time Statistics**: Track bandwidth usage, request counts, and request history
- **Request Logging**: Complete audit trail of all proxied requests

### Performance
- **HTTP/2 Support**: Via Undici for upstream requests
- **Efficient Bundling**: Uses Rspack for optimized server bundle
- **Stream Processing**: Handles large responses efficiently

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/amiaslee/web-proxy-fastify.git
cd web-proxy-fastify

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Setup database
npx prisma generate
npx prisma db push

# Build the project
npm run build

# Start the server
npm start
```

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
PORT=3001
ALLOWED_IPS=127.0.0.1,::1,192.168.1.0/24
BLOCKED_IPS=  
PROXY_SECRET=your-secret-key
MAX_REQ_PER_MIN=60
MAX_BYTES_PER_DAY=1073741824
DATABASE_URL=postgresql://user:password@localhost:5433/proxy_db
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `ALLOWED_IPS` | Comma-separated list of allowed IPs/ranges | Required |
| `BLOCKED_IPS` | Comma-separated list of blocked IPs | Optional |
| `PROXY_SECRET` | Secret key for authentication | Required |
| `MAX_REQ_PER_MIN` | Maximum requests per minute per IP | `60` |
| `MAX_BYTES_PER_DAY` | Maximum bytes per day per IP | `1073741824` (1GB) |
| `DATABASE_URL` | PostgreSQL connection string | Required |

## 📖 Usage

### Basic Proxy Access

To proxy a website, simply prefix the target URL with your proxy server URL:

```
http://localhost:3001/https://example.com
http://localhost:3001/https://github.com
http://localhost:3001/https://news.ycombinator.com
```

### API Endpoints

Currently, the proxy uses a wildcard route that handles all requests. Future versions may include dedicated API endpoints for statistics and management.

## 🏗️ Architecture

### Technology Stack

- **Server Framework**: [Fastify](https://www.fastify.io/) - High-performance web framework
- **HTTP Client**: [Undici](https://undici.nodejs.org/) - HTTP/1.1 and HTTP/2 client
- **HTML Parser**: [Cheerio](https://cheerio.js.org/) - jQuery-like HTML manipulation
- **Database ORM**: [Prisma](https://www.prisma.io/) - Type-safe database client
- **Build Tool**: [Rspack](https://www.rspack.dev/) via Rslib - Fast bundler
- **Database**: PostgreSQL - Reliable data persistence

### Project Structure

```
web-proxy-fastify/
├── src/
│   ├── config.ts              # Configuration management
│   ├── index.ts               # Application entry point
│   ├── server.ts              # Fastify server setup
│   ├── middleware/
│   │   ├── ip-filter.ts       # IP whitelist/blacklist
│   │   ├── logger.ts          # Request logging
│   │   ├── quota.ts           # Daily quota enforcement
│   │   └── rate-limit.ts      # Rate limiting
│   ├── proxy/
│   │   ├── request.ts         # Upstream request handling
│   │   ├── rewrite.ts         # HTML/CSS URL rewriting
│   │   └── shim.ts            # Client-side JavaScript injection
│   ├── routes/
│   │   └── proxy.ts           # Main proxy route handler
│   ├── services/
│   │   └── stats.ts           # Statistics service
│   └── utils/
│       └── url.ts             # URL validation utilities
├── prisma/
│   └── schema.prisma          # Database schema
├── .env                       # Environment configuration
├── package.json
├── tsconfig.json
└── rslib.config.ts            # Build configuration
```

### Key Components

#### 1. **Proxy Handler** (`src/routes/proxy.ts`)
- Handles all incoming proxy requests
- Adds CORS headers
- Removes interfering security headers (CSP, X-Frame-Options)
- Routes requests based on content type

#### 2. **URL Rewriter** (`src/proxy/rewrite.ts`)
- Rewrites HTML attributes (`href`, `src`, `srcset`, etc.)
- Processes CSS `url()` references
- Injects client-side shim script
- Removes CSP meta tags

#### 3. **Client Shim** (`src/proxy/shim.ts`)
- Intercepts `fetch()` and `XMLHttpRequest`
- Handles dynamically added DOM elements via MutationObserver
- Prevents double-proxying with URL detection
- Resolves relative URLs correctly

#### 4. **Middleware Chain**
- **IP Filter**: Validates against whitelist/blacklist
- **Rate Limiter**: Enforces request-per-minute limits
- **Quota Checker**: Validates daily bandwidth usage
- **Logger**: Records all requests to database

## 🔧 Development

```bash
# Install dependencies
npm install

# Run in development mode (with auto-rebuild)
npm run dev

# Build for production
npm run build

# Run tests (if available)
npm test

# Database operations
npx prisma generate    # Generate Prisma client
npx prisma db push     # Push schema to database
npx prisma studio      # Open database GUI
```

## 🛡️ Security Considerations

1. **Content Security Policy**: The proxy removes CSP headers to function properly. This is necessary but means proxied content has reduced security constraints.

2. **Cookie Handling**: Cookies from proxied sites are stripped for security.

3. **HTTPS**: Consider running the proxy behind a reverse proxy (nginx, Caddy) with HTTPS.

4. **Access Control**: Always use IP whitelisting in production environments.

5. **Rate Limiting**: Configure appropriate rate limits to prevent abuse.

## 🚧 Known Limitations

1. **WebSocket Support**: Currently not supported
2. **Service Workers**: May conflict with proxy mechanism
3. **Complex SPAs**: Some modern web applications (e.g., YouTube) may have limited functionality due to:
   - Advanced API authentication
   - WebSocket requirements
   - Service Worker usage
   - Anti-proxy measures

4. **ALPN Negotiation**: Some HTTP/2-only endpoints may fail

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Inspired by [cors-anywhere](https://github.com/Rob--W/cors-anywhere) for CORS handling
- Built with amazing open-source tools from the Node.js ecosystem

## 📧 Contact

For questions and support, please open an issue on GitHub.

---

**Note**: This proxy is intended for development and personal use. Be mindful of rate limits, terms of service, and legal restrictions when proxying third-party websites.
