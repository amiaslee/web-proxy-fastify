# Nginx Configuration for Proxy Server

## SSL Termination Example

```nginx
upstream proxy_backend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name proxy.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name proxy.yourdomain.com;
    
    # SSL Certificate (Let's Encrypt or your own)
    ssl_certificate /etc/letsencrypt/live/proxy.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxy.yourdomain.com/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    
    # Proxy Settings
    location / {
        proxy_pass http://proxy_backend;
        proxy_http_version 1.1;
        
        # Forward client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for large files
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Disable buffering for streaming
        proxy_buffering off;
        proxy_request_buffering off;
        
        # Support WebSocket (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # Increase max body size for large uploads
    client_max_body_size 100M;
}
```

## Cloudflare Setup

If using Cloudflare:

1. **DNS Settings**: 
   - Add A record: `proxy.yourdomain.com` → Your server IP
   - Enable Cloudflare proxy (orange cloud)

2. **SSL/TLS Settings**:
   - Mode: Full (strict) or Flexible
   - Generate Cloudflare Origin Certificate

3. **Nginx Config**:
   ```nginx
   # Use Cloudflare Origin Certificate
   ssl_certificate /path/to/cloudflare-cert.pem;
   ssl_certificate_key /path/to/cloudflare-key.pem;
   
   # Trust Cloudflare IPs
   set_real_ip_from 103.21.244.0/22;
   # ... (add all Cloudflare IP ranges)
   real_ip_header CF-Connecting-IP;
   ```

## Usage Examples

### Browser
```
https://proxy.yourdomain.com/https://github.com
```

### npm
```bash
npm config set proxy https://proxy.yourdomain.com
npm config set https-proxy https://proxy.yourdomain.com
npm install express
```

### curl
```bash
curl -x https://proxy.yourdomain.com https://api.github.com
```

### docker
```json
{
  "proxies": {
    "http-proxy": "https://proxy.yourdomain.com",
    "https-proxy": "https://proxy.yourdomain.com"
  }
}
```
