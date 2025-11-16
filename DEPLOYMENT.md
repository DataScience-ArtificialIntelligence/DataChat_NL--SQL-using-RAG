# Local Deployment Guide

This guide covers various methods to run DataChat locally without any Vercel dependencies.

## Table of Contents

1. [Quick Start (Development)](#quick-start-development)
2. [Production Build (Local)](#production-build-local)
3. [Docker Deployment](#docker-deployment)
4. [PM2 Process Manager](#pm2-process-manager)
5. [Nginx Reverse Proxy](#nginx-reverse-proxy)
6. [Systemd Service](#systemd-service)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start (Development)

Perfect for local development and testing.

### Prerequisites
- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- Database setup complete (see README.md)

### Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Create environment file
cp env.example .env.local

# 3. Edit .env.local with your credentials
nano .env.local  # or use your favorite editor

# 4. Run development server
pnpm dev

# 5. Open browser
# Visit http://localhost:3000
```

**Development Features:**
- Hot reload on file changes
- Detailed error messages
- Source maps for debugging

---

## Production Build (Local)

Run an optimized production build on your local machine.

### Steps

```bash
# 1. Build the application
pnpm build

# 2. Start production server
pnpm start

# Server runs on http://localhost:3000
```

### Custom Port

```bash
# Set custom port
PORT=8080 pnpm start

# Or add to .env.local
echo "PORT=8080" >> .env.local
```

### Keep Running in Background

```bash
# Using nohup
nohup pnpm start > datachat.log 2>&1 &

# Check if running
ps aux | grep node

# Stop the process
kill <PID>
```

---

## Docker Deployment

Containerized deployment for consistency and portability.

### Option A: Docker Compose (Recommended)

```bash
# 1. Create .env file for Docker
cp env.example .env

# 2. Edit .env with your credentials
nano .env

# 3. Build and start
docker-compose up -d

# 4. View logs
docker-compose logs -f datachat

# 5. Stop
docker-compose down
```

### Option B: Docker Only

```bash
# 1. Build image
docker build -t datachat:latest .

# 2. Run container
docker run -d \
  --name datachat \
  -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL="your-url" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="your-key" \
  -e SUPABASE_SERVICE_ROLE_KEY="your-key" \
  -e GROQ_API_KEY="your-key" \
  datachat:latest

# 3. View logs
docker logs -f datachat

# 4. Stop and remove
docker stop datachat
docker rm datachat
```

### Docker with Environment File

```bash
# Create .env file
cat > .env << EOF
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
GROQ_API_KEY=gsk_your-groq-key
EOF

# Run with env file
docker run -d \
  --name datachat \
  -p 3000:3000 \
  --env-file .env \
  datachat:latest
```

---

## PM2 Process Manager

Production-grade process manager for Node.js applications.

### Install PM2

```bash
npm install -g pm2
```

### Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'datachat',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_file: '.env.local',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
```

### PM2 Commands

```bash
# Start application
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs datachat

# Restart
pm2 restart datachat

# Stop
pm2 stop datachat

# Delete from PM2
pm2 delete datachat

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

---

## Nginx Reverse Proxy

Set up Nginx as a reverse proxy for better performance and SSL support.

### Install Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### Configure Nginx

Create `/etc/nginx/sites-available/datachat`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or localhost

    # Increase upload size for CSV files
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running queries
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### Enable and Start

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/datachat /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable on boot
sudo systemctl enable nginx
```

### Add SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

---

## Systemd Service

Run DataChat as a system service on Linux.

### Create Service File

Create `/etc/systemd/system/datachat.service`:

```ini
[Unit]
Description=DataChat Application
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/AI Project
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/path/to/AI Project/.env.local
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=datachat

[Install]
WantedBy=multi-user.target
```

### Service Commands

```bash
# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start datachat

# Enable on boot
sudo systemctl enable datachat

# Check status
sudo systemctl status datachat

# View logs
sudo journalctl -u datachat -f

# Restart
sudo systemctl restart datachat

# Stop
sudo systemctl stop datachat
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000
# or
netstat -tulpn | grep 3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=8080 pnpm start
```

### Permission Denied

```bash
# Fix file permissions
chmod +x node_modules/.bin/next

# Or run with sudo (not recommended)
sudo pnpm start
```

### Database Connection Issues

```bash
# Test Supabase connection
curl -I https://your-project.supabase.co

# Check environment variables
env | grep SUPABASE

# Verify .env.local is loaded
cat .env.local
```

### Build Failures

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules
rm -rf node_modules
pnpm install

# Rebuild
pnpm build
```

### Out of Memory

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Or add to package.json scripts
"build": "NODE_OPTIONS='--max-old-space-size=4096' next build"
```

### Docker Issues

```bash
# View container logs
docker logs datachat

# Access container shell
docker exec -it datachat sh

# Rebuild without cache
docker build --no-cache -t datachat .

# Remove all stopped containers
docker container prune
```

---

## Performance Optimization

### 1. Enable Compression

Add to `next.config.mjs`:

```javascript
const nextConfig = {
  compress: true,
  // ... other config
}
```

### 2. Optimize Images

Already configured with `unoptimized: true` for local deployment.

### 3. Database Connection Pooling

For high traffic, consider using PgBouncer with your PostgreSQL database.

### 4. Caching

Add Redis for session and query caching (advanced).

---

## Monitoring

### Basic Monitoring

```bash
# CPU and Memory usage
top
# or
htop

# Disk usage
df -h

# Application logs
tail -f datachat.log
```

### Advanced Monitoring

Consider setting up:
- **Prometheus + Grafana** for metrics
- **PM2 Plus** for process monitoring
- **Sentry** for error tracking
- **New Relic** or **DataDog** for APM

---

## Backup and Restore

### Database Backup (Supabase)

```bash
# Automatic backups are included in Supabase
# Manual backup via Dashboard: Database > Backups

# Or use pg_dump if you have direct access
pg_dump -h your-host -U postgres -d postgres > backup.sql
```

### Application Backup

```bash
# Backup configuration
cp .env.local .env.local.backup

# Backup uploaded data (if stored locally)
tar -czf datachat-backup.tar.gz .env.local logs/
```

---

## Security Checklist

- [ ] Environment variables are not committed to Git
- [ ] `.env.local` has proper permissions (600)
- [ ] Firewall is configured (only port 80/443 open)
- [ ] SSL certificate is installed and auto-renewing
- [ ] Database credentials are rotated regularly
- [ ] Application is running as non-root user
- [ ] Nginx security headers are configured
- [ ] Rate limiting is enabled (if needed)
- [ ] Regular security updates applied

---

## Need Help?

- Check the main [README.md](README.md)
- Review [SECURITY_FIXES.md](SECURITY_FIXES.md)
- Open an issue on GitHub
- Check Next.js documentation: https://nextjs.org/docs

---

**Happy Deploying! 🚀**

