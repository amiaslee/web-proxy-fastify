# IP Limits Configuration Guide

## Simplified Format

Configure per-IP limits using simple comma-separated values.

### Format

```
IP_LIMITS1=IP_ADDRESS,REQUESTS_PER_MIN,BYTES_PER_DAY
IP_LIMITS2=IP_ADDRESS,REQUESTS_PER_MIN,BYTES_PER_DAY
...
```

### Fields

1. **IP Address**: Can be exact IP (e.g., `127.0.0.1`) or CIDR range (e.g., `192.168.1.0/24`)
2. **Requests Per Minute**: Integer (e.g., `1000`, `120`, `30`)
3. **Bytes Per Day**: Number with optional unit (e.g., `10GB`, `500MB`, `1gb`)

### Supported Units (Case Insensitive)

- `KB` - Kilobytes
- `MB` - Megabytes
- `GB` - Gigabytes
- `TB` - Terabytes
- No unit = bytes

## Examples

### Single IP with High Limits

```env
IP_LIMITS1=127.0.0.1,1000,10GB
```

### Multiple IPs

```env
IP_LIMITS1=127.0.0.1,1000,10GB
IP_LIMITS2=192.168.1.100,120,5GB
IP_LIMITS3=192.168.1.101,60,2GB
```

### CIDR Range

```env
IP_LIMITS1=192.168.2.0/24,30,1GB
```

### Mixed Units

```env
IP_LIMITS1=127.0.0.1,1000,10GB
IP_LIMITS2=192.168.1.100,200,5000MB
IP_LIMITS3=10.0.0.0/8,50,500mb
```

### No Custom Limits

Leave all IP_LIMITS* variables empty or unset to use global defaults from `MAX_REQ_PER_MIN` and `MAX_BYTES_PER_DAY`:

```env
# No custom IP limits - everyone uses global defaults
```

## Common Values

### Bandwidth Limits
- 100 MB = `100MB`
- 500 MB = `500MB`
- 1 GB = `1GB`
- 5 GB = `5GB`
- 10 GB = `10GB`
- 50 GB = `50GB`
- 100 GB = `100GB`

### Rate Limits
- Light users: `30-60` requests/min
- Regular users: `120-200` requests/min
- Power users: `500-1000` requests/min
- Localhost/Dev: `1000+` requests/min

## How It Works

1. **Startup**: Server reads all `IP_LIMITS*` environment variables
2. **Parsing**: Each line is parsed into IP, rate limit, and quota
3. **Matching**: When a request arrives, the server:
   - Checks for exact IP match
   - Checks for CIDR range match
   - Falls back to global defaults if no match

## Troubleshooting

### Configuration Not Working?

Check server startup logs for messages like:
```
✓ Loaded IP limit: 127.0.0.1 → 1000 req/min, 10GB
```

### Invalid Format Error?

Ensure your configuration follows the exact format:
- 3 fields separated by commas
- No extra spaces (they will be trimmed)
- Valid unit (KB, MB, GB, TB) or no unit

### CIDR Not Working?

Make sure you have `ip-range-check` package installed:
```bash
npm install ip-range-check
```
