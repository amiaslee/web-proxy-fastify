# Web Proxy with Card-Key Recharge System

A high-performance web proxy server built with Fastify, featuring a three-tier user management system with card-key based bandwidth recharge functionality.

## Features

- 🚀 **High-Performance Proxy**: Built on Fastify for optimal performance
- 👥 **Three-Tier User System**: Default, Custom IP, and Recharged users
- 💳 **Card-Key Recharge**: Independent package-based recharge with expiry dates
- 📊 **Advanced Statistics**: Automatic daily/monthly/total usage tracking with auto-reset
- 🔒 **IP-Based Authentication**: Secure access control via IP whitelisting
- 🎯 **Smart Quota Management**: Separated daily quotas and time-limited packages
- 🛡️ **Privacy Protection**: Masked IP addresses in public responses
- 📦 **Multiple Package Stacking**: Support for multiple active recharge packages
- ⏰ **Intelligent Expiry**: Packages expire after configured days, prioritizes expiring-soon packages
- 📈 **Consumption Priority**: Smart consumption order (base → custom → packages)
- 🔄 **Automatic Resets**: Daily quotas reset at midnight, monthly stats reset on 1st

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [User Tiers](#user-tiers)
- [Usage](#usage)
  - [Basic Proxy Usage](#basic-proxy-usage)
  - [Admin Operations](#admin-operations)
  - [User Operations](#user-operations)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Examples](#examples)

---

## Installation

### Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- npm or yarn

### Setup

```bash
# Clone repository
git clone <your-repo-url>
cd web-proxy-fastify

# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma db push

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Build and start
npm run build
npm start
```

---

## Configuration

### Environment Variables

Edit `.env` file:

```env
# Server Configuration
PORT=3001
ALLOWED_IPS=127.0.0.1,::1,192.168.1.0/24

# Global Limits (Tier 1 - Default Users)
MAX_REQ_PER_MIN=60
MAX_BYTES_PER_DAY=1GB

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/proxy_db

# IP Blocking
BLOCKED_IPS=

# Custom IP Limits (Tier 2)
# Format: IP,rate,bandwidth or IP,rate or IP,,bandwidth
IP_LIMITS_1=192.168.1.100,120,5GB
IP_LIMITS_2=10.0.0.0/24,200,10GB
IP_LIMITS_3=2001:db8::1,300

# Admin System
ADMIN_SECRET=your-secure-admin-secret-change-this
ADMIN_API_PREFIX=/admin

# Card-Key System (Tier 3)
CARD_KEY_ENABLED=true
CARD_KEY_DEFAULT_BANDWIDTH=10GB
CARD_KEY_DEFAULT_RATE=300
CARD_KEY_DEFAULT_VALID_DAYS=30
```

### IP Limits Configuration

See [`IP_LIMITS_EXAMPLES.md`](./IP_LIMITS_EXAMPLES.md) for detailed examples.

---

## User Tiers

### Tier 1: Default Users
- **Applies to**: Any IP in `ALLOWED_IPS` without custom config
- **Rate Limit**: `MAX_REQ_PER_MIN` (default: 60 req/min)
- **Bandwidth**: `MAX_BYTES_PER_DAY` (default: 1GB/day)
- **Reset**: Daily at midnight

### Tier 2: Custom IP Users
- **Applies to**: IPs configured in `IP_LIMITS_*`
- **Rate Limit**: Custom per IP
- **Bandwidth**: Custom per IP
- **Reset**: Daily at midnight
- **Example**: VIP users, internal services

### Tier 3: Recharged Users
- **Applies to**: Users who redeemed card keys
- **Rate Limit**: Max of all active packages
- **Bandwidth**: Sum of all package remaining bandwidth
- **Reset**: No daily reset, packages expire after configured days
- **Priority**: Highest tier, packages stack with daily quota

### Tier Priority

```
Tier 3 (Packages) > Tier 2 (Custom IP) > Tier 1 (Default)
```

**Rate Calculation**: `max(dailyRate, allPackageRates)`
**Bandwidth Calculation**: `dailyRemaining + sum(allPackageRemaining)`

---

## Usage

### Basic Proxy Usage

#### Browser Proxy

Access any website through the proxy:

```
http://localhost:3001/https://example.com
http://localhost:3001/http://example.com/path?query=value
```

#### CLI Tools (curl, wget)

```bash
# Set proxy
export http_proxy="http://localhost:3001"
export https_proxy="http://localhost:3001"

# Use curl
curl http://example.com
curl https://api.github.com/users/octocat

# Or direct
curl -x http://localhost:3001 https://example.com
```

#### npm, Docker, etc.

```bash
npm config set proxy http://localhost:3001
npm config set https-proxy http://localhost:3001
```

---

### Admin Operations

All admin endpoints require `?secret=YOUR_ADMIN_SECRET`.

#### Generate Card Keys

```bash
# Generate 10 cards with default settings
curl "http://localhost:3001/admin/generate-cards?secret=YOUR_SECRET&count=10" -o cards.txt

# Generate with custom specs
curl "http://localhost:3001/admin/generate-cards?secret=YOUR_SECRET&count=5&bandwidth=20GB&rate=500&days=7" -o cards-7day.txt
```

**Response**: Text file with card codes (one per line)

#### Get System Statistics

```bash
curl "http://localhost:3001/admin/stats?secret=YOUR_SECRET" | jq
```

**Response**:
```json
{
  "totalCards": 100,
  "usedCards": 45,
  "unusedCards": 55,
  "activeUsers": 12,
  "totalRecharges": 45
}
```

#### View Recharge History

```bash
curl "http://localhost:3001/admin/recharges?secret=YOUR_SECRET&limit=20" | jq
```

---

### User Operations

#### Check Your Status

```bash
curl "http://localhost:3001/" | jq
```

**Example Response (Tier 3 User)**:
```json
{
  "message": "Web Proxy Server",
  "yourIP": "192.168.1.100",
  "tier": "tier3",
  
  "dailyQuota": {
    "rate": 120,
    "bandwidth": "5.00GB",
    "used": "1.25GB",
    "remaining": "3.75GB",
    "resetsIn": "12 hours"
  },
  
  "packages": [
    {
      "id": 1,
      "bandwidth": "10.00GB",
      "used": "2.50GB",
      "remaining": "7.50GB",
      "rateLimit": 300,
      "expiresIn": "25 days"
    }
  ],
  
  "effective": {
    "maxRate": 300,
    "totalBandwidth": "11.25GB"
  },
  
  "statistics": {
    "daily": {
      "bytes": "1.25GB",
      "requests": 50
    },
    "monthly": {
      "bytes": "15.50GB",
      "requests": 1200
    },
    "total": {
      "bytes": "152.45GB",
      "requests": 8500
    }
  },
  
  "endpoints": {
    "proxy": "/https://example.com",
    "cardInfo": "/card-info?code=YOUR_CARD_CODE",
    "recharge": "/recharge?code=YOUR_CARD_CODE",
    "health": "/health"
  }
}
```

### Statistics Explained

- **Daily**: Resets automatically at midnight (00:00)
  - Tracks usage from base and custom quotas only
  - Package consumption is NOT included in daily stats
  
- **Monthly**: Resets automatically on the 1st of each month
  - Includes all usage (daily quotas + packages)
  
- **Total**: Never resets
  - Cumulative usage since account creation
  - Useful for billing and analytics

#### Query Card Information

Check a card before redeeming:

```bash
curl "http://localhost:3001/card-info?code=ABCD1234..." | jq
```

**Valid Card Response**:
```json
{
  "valid": true,
  "bandwidth": "10.00GB",
  "rateLimit": 300,
  "validDays": 30
}
```

**Used Card Response** (with privacy protection):
```json
{
  "valid": false,
  "error": "Card already used",
  "usedBy": "192.168.*.**",
  "usedAt": "2025-11-25T08:00:00Z"
}
```

#### Recharge Account

```bash
curl "http://localhost:3001/recharge?code=ABCD1234..." | jq
```

**Success Response**:
```json
{
  "success": true,
  "message": "Recharged successfully! Package activated.",
  "package": {
    "bandwidth": "10.00GB",
    "rateLimit": 300,
    "validDays": 30,
    "expiresIn": "30 days"
  }
}
```

---

## API Reference

### Public Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | Get user status, quotas, and packages | IP |
| GET | `/card-info?code=XXX` | Query card information | None |
| GET | `/recharge?code=XXX` | Redeem card key | IP |
| GET | `/health` | Health check | None |
| ALL | `/:targetUrl` | Proxy request | IP |

### Admin Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/generate-cards` | Generate card keys | Secret |
| GET | `/admin/stats` | System statistics | Secret |
| GET | `/admin/recharges` | Recharge history | Secret |

**Query Parameters**:
- `generate-cards`: `count`, `bandwidth`, `rate`, `days`
- `recharges`: `limit` (default: 50)

---

## Deployment

### Production Setup with Nginx

1. **SSL Termination**: Use Nginx for HTTPS
2. **Reverse Proxy**: Nginx → Fastify

See [`docs/nginx.conf.md`](./docs/nginx.conf.md) for complete Nginx configuration example.

**Quick Nginx Config**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

---

## Examples

### Example 1: Personal Proxy with Card System

```bash
# 1. Setup
export ADMIN_SECRET="my-secret-123"
export CARD_KEY_ENABLED=true

# 2. Generate 5 monthly cards (30 days, 10GB each)
curl "http://localhost:3001/admin/generate-cards?secret=my-secret-123&count=5&bandwidth=10GB&days=30" -o cards.txt

# 3. Distribute cards to users
cat cards.txt
# ABCD1234...
# EFGH5678...
# ...

# 4. User redeems card
curl "http://localhost:3001/recharge?code=ABCD1234..." | jq

# 5. User checks status
curl "http://localhost:3001/" | jq
```

### Example 2: Multi-Tier Company Proxy

```env
# .env configuration
ALLOWED_IPS=10.0.0.0/8

# Default employees: 1GB/day, 60 req/min
MAX_BYTES_PER_DAY=1GB
MAX_REQ_PER_MIN=60

# VIP Team: 10GB/day, 300 req/min
IP_LIMITS_1=10.0.1.0/24,300,10GB

# Executives: Can purchase additional packages
CARD_KEY_ENABLED=true
CARD_KEY_DEFAULT_BANDWIDTH=50GB
CARD_KEY_DEFAULT_RATE=1000
CARD_KEY_DEFAULT_VALID_DAYS=90
```

### Example 3: Rate Limiting Strategy

```bash
# Tier 1 (Default): 60 req/min
# Tier 2 (VIP IP): 200 req/min
# Tier 3 (Package A): 300 req/min
# Tier 3 (Package B): 500 req/min

# Effective Rate = max(60, 200, 300, 500) = 500 req/min
```

---

## Troubleshooting

### Issue: "Rate Limit Exceeded"

**Check your tier**:
```bash
curl "http://localhost:3001/" | jq '.tier, .effective.maxRate'
```

**Solutions**:
- Wait for daily quota reset
- Purchase and redeem card key
- Contact admin for custom IP limits

### Issue: "Bandwidth Quota Exceeded"

**Check remaining bandwidth**:
```bash
curl "http://localhost:3001/" | jq '.dailyQuota.remaining, .packages'
```

**Solutions**:
- Wait until tomorrow (daily quota resets)
- Recharge with card key

### Issue: Card Already Used

Cards are single-use. Check card info to see who used it:
```bash
curl "http://localhost:3001/card-info?code=XXX" | jq
```

---

## License

MIT License - see LICENSE file for details

---

## Support

For issues and questions:
- GitHub Issues: [your-repo]/issues
- Documentation: [your-repo]/docs
