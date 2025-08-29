# Zulu Team Self-Hosted Infrastructure Plan

## Overview
This document outlines a cost-effective plan for deploying Zulu Team projects using a dedicated server with **Traefik** as the load balancer, handling SSL certificates via **Let's Encrypt** with wildcard support. All deployments will be to the dedicated server to minimize costs while maintaining scalability.

## Load Balancer Comparison: Traefik vs HAProxy vs Nginx

| Feature | Traefik | HAProxy | Nginx |
|---------|---------|---------|--------|
| **SSL/TLS Automation** | ✅ Native Let's Encrypt | ❌ Manual setup | ⚠️ Requires certbot |
| **Docker Integration** | ✅ Auto-discovery | ❌ Manual config | ⚠️ Manual config |
| **Wildcard Certificates** | ✅ Built-in | ⚠️ Complex setup | ⚠️ Complex setup |
| **Configuration** | ✅ Simple YAML | ⚠️ Complex config | ⚠️ Complex config |
| **Performance** | ⚠️ Good | ✅ Excellent | ✅ Excellent |
| **Learning Curve** | ✅ Easy | ⚠️ Steep | ⚠️ Moderate |
| **Dashboard** | ✅ Built-in | ❌ None | ⚠️ Separate module |

**Recommendation: Traefik** - Best choice for this use case due to native Docker integration, automatic SSL management, and simple configuration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dedicated Server                          │
│                    (Single Physical Machine)                     │
│                    ┌─────────────────────┐                       │
│                    │   Traefik           │                       │
│                    │   Load Balancer     │                       │
│                    │   + Wildcard SSL    │                       │
│                    └─────────────────────┘                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│              Docker Containers (Single Server)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Dev       │  │   Staging   │  │ Production  │             │
│  │ Instances   │  │  Instances  │  │  Instances  │             │
│  │ (Local)     │  │ (Local)     │  │ (Local)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                  Security Layer                                  │
│              (OAuth2 Proxy + Basic Auth)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Environments

### 1. Development Environment (Dedicated Server)
- **Purpose**: Individual bot instances for active development
- **Location**: Dedicated server Docker containers
- **Access**: Restricted to developers via OAuth2
- **URL Pattern**: `dev-{bot-name}-{project}.zulu-team.dev`
- **Characteristics**:
  - Auto-deploy on git push to feature branches
  - Direct Docker volume mounts for live code editing
  - Debug logging enabled
  - Resource sharing with staging containers

### 2. Staging Environment (Dedicated Server)
- **Purpose**: Pre-production testing and integration
- **Location**: Dedicated server Docker containers
- **Access**: Team members via OAuth2
- **URL Pattern**: `staging-{project}.zulu-team.dev`
- **Characteristics**:
  - Persistent containers
  - Production-like configuration
  - Database seeding with test data
  - Isolated from dev containers

### 3. Production Environment (Dedicated Server)
- **Purpose**: Live user-facing applications
- **Location**: Dedicated server Docker containers
- **Access**: Public (with optional authentication)
- **URL Pattern**: `{project}.zulu-team.dev`
- **Characteristics**:
  - Persistent containers
  - Production-grade monitoring
  - Resource limits and health checks
  - Blue-green deployment support

## Infrastructure Components

### 1. Dedicated Server Setup
**Hardware Requirements**:
- **CPU**: 8-16 cores (for concurrent dev/staging containers)
- **RAM**: 32-64GB (allows multiple containers + overhead)
- **Storage**: 1TB+ SSD (for Docker images, code repos, databases)
- **Network**: 1Gbps+ connection with static IP

**Software Stack**:
- **OS**: Ubuntu 22.04 LTS
- **Docker**: Latest stable with Docker Compose
- **Traefik**: Reverse proxy with automatic SSL
- **Portainer**: Docker management UI
- **Watchtower**: Automatic container updates

### 2. DNS and SSL Configuration
**Let's Encrypt with Wildcard Support via Traefik**:

```yaml
# traefik.yml (Traefik configuration)
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@zulu-team.dev
      storage: /acme.json
      dnsChallenge:
        provider: cloudflare  # or your DNS provider
        delayBeforeCheck: 0
```

**DNS Configuration**:
```bash
# Add wildcard DNS record
*.zulu-team.dev A YOUR_SERVER_IP
zulu-team.dev A YOUR_SERVER_IP
```

### 3. Docker Orchestration
**Docker Compose for Environment Management**:

```yaml
# docker-compose.yml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    command:
      - --api.dashboard=true
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=admin@zulu-team.dev
      - --certificatesresolvers.letsencrypt.acme.storage=/acme.json
      - --certificatesresolvers.letsencrypt.acme.dnschallenge=true
      - --certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./acme.json:/acme.json
    environment:
      - CF_API_EMAIL=your-cloudflare-email
      - CF_API_KEY=your-cloudflare-api-key
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.zulu-team.dev`)"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=admin:$$2y$$10$$8K1p/kVGKpDH0WJ8XP5MWeKjINhQXr6TRN8rDv5X7GRosF1uIsEDC"

  portainer:
    image: portainer/portainer-ce:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.portainer.rule=Host(`docker.zulu-team.dev`)"
      - "traefik.http.routers.portainer.tls=true"
      - "traefik.http.routers.portainer.tls.certresolver=letsencrypt"
      - "traefik.http.routers.portainer.middlewares=oauth-auth"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:
```

### 4. Security Layer
**OAuth2 Proxy with GitHub Authentication**:

```yaml
# oauth-proxy.yml
version: '3.8'

services:
  oauth-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:latest
    environment:
      - OAUTH2_PROXY_PROVIDER=github
      - OAUTH2_PROXY_CLIENT_ID=your-github-client-id
      - OAUTH2_PROXY_CLIENT_SECRET=your-github-client-secret
      - OAUTH2_PROXY_COOKIE_SECRET=your-cookie-secret
      - OAUTH2_PROXY_EMAIL_DOMAINS=*
      - OAUTH2_PROXY_GITHUB_ORG=zulu-team
      - OAUTH2_PROXY_UPSTREAMS=http://traefik:80
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.oauth.rule=Host(`auth.zulu-team.dev`)"
      - "traefik.http.routers.oauth.tls=true"
      - "traefik.http.routers.oauth.tls.certresolver=letsencrypt"
```

### 5. Bot Instance Management
**Docker Labels for Traefik Routing**:

```yaml
# Example bot instance configuration
version: '3.8'

services:
  alpha-dev:
    image: zulu-bot:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.alpha-dev.rule=Host(`dev-alpha.zulu-team.dev`)"
      - "traefik.http.routers.alpha-dev.tls=true"
      - "traefik.http.routers.alpha-dev.tls.certresolver=letsencrypt"
      - "traefik.http.routers.alpha-dev.middlewares=oauth-auth"
    volumes:
      - ./bot-instances/alpha-dev:/workspace
    environment:
      - NODE_ENV=development
      - DISCORD_TOKEN=${ALPHA_DISCORD_TOKEN}

  bravo-dev:
    image: zulu-bot:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bravo-dev.rule=Host(`dev-bravo.zulu-team.dev`)"
      - "traefik.http.routers.bravo-dev.tls=true"
      - "traefik.http.routers.bravo-dev.tls.certresolver=letsencrypt"
    volumes:
      - ./bot-instances/bravo-dev:/workspace
    environment:
      - NODE_ENV=development
      - DISCORD_TOKEN=${BRAVO_DISCORD_TOKEN}
```

## Deployment Automation

### 1. Git-Based Deployment
**Webhook-based deployment script**:

```bash
#!/bin/bash
# deploy.sh - Triggered by git webhooks

PROJECT_NAME=$1
ENVIRONMENT=$2
BRANCH=$3

# Build and deploy based on environment
case $ENVIRONMENT in
  "dev")
    docker-compose -f docker-compose.dev.yml up -d --build $PROJECT_NAME
    ;;
  "staging")
    docker-compose -f docker-compose.staging.yml up -d --build $PROJECT_NAME
    ;;
  "production")
    docker-compose -f docker-compose.prod.yml up -d --build $PROJECT_NAME
    ;;
esac
```

### 2. Environment Configuration
**Environment-specific compose files**:

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  dev-template:
    image: zulu-bot:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dev-template.rule=HostRegexp(\`dev-{bot:[a-z-]+}.zulu-team.dev\`)"
      - "traefik.http.routers.dev-template.tls=true"
      - "traefik.http.routers.dev-template.tls.certresolver=letsencrypt"
    volumes:
      - ./bot-instances/${BOT_NAME}:/workspace
    environment:
      - NODE_ENV=development
```

## Monitoring and Observability

### 1. System Monitoring
- **Traefik Dashboard**: Real-time traffic and routing
- **Portainer**: Container management and monitoring
- **Prometheus + Grafana**: System metrics and alerting
- **Log aggregation**: ELK stack or Loki

### 2. Health Checks
- **Container health**: Docker health checks
- **Service endpoints**: `/health` for each service
- **SSL certificate monitoring**: Expiration alerts
- **Resource usage**: CPU, memory, disk monitoring

## Security Considerations

### 1. Network Security
- **Firewall**: UFW or iptables for port management
- **Fail2ban**: Brute force protection
- **Rate limiting**: Traefik middleware
- **VPN access**: Optional for admin access

### 2. Container Security
- **Non-root containers**: Security best practices
- **Resource limits**: CPU and memory constraints
- **Network isolation**: Docker networks
- **Secret management**: Docker secrets or environment variables

### 3. Access Control
- **OAuth2 Proxy**: GitHub/Google authentication
- **Basic auth**: For Traefik dashboard
- **SSH keys**: Server access management
- **API keys**: Service-to-service authentication

## Implementation Timeline

### Phase 1: Server Setup (Week 1)
- [ ] Provision dedicated server with Ubuntu 22.04 [Currently CentOs7]
- [X] Install Docker and Docker Compose [Installed]
- [X] Configure firewall and security [Secure]
- [ ] Set up DNS records for wildcard domain

### Phase 2: Traefik Configuration (Week 2)
- [ ] Install and configure Traefik
- [ ] Set up Let's Encrypt with wildcard certificates
- [ ] Configure Docker integration
- [ ] Set up Traefik dashboard with authentication

### Phase 3: Security Layer (Week 3)
- [ ] Deploy OAuth2 Proxy for GitHub authentication
- [ ] Configure access control for different environments
- [ ] Set up monitoring and alerting
- [ ] Test SSL certificate renewal

### Phase 4: Bot Migration (Week 4)
- [ ] Migrate existing bot instances to new infrastructure
- [ ] Update bot configurations for new URLs
- [ ] Test deployment automation
- [ ] Document deployment procedures

### Phase 5: Project Deployment (Week 5)
- [ ] Create project deployment templates
- [ ] Set up CI/CD integration
- [ ] Add monitoring for new projects
- [ ] Train team on new deployment process

## Cost Analysis

### Monthly Costs (Self-Hosted)
- **Dedicated Server**: $50-100/month (Hetzner, OVH, or similar)
- **Domain**: $10-15/year
- **DNS**: $0-5/month (Cloudflare free tier)
- **Total**: ~$55-105/month

### Comparison with Cloud Run
- **Cloud Run**: $200-500/month
- **Self-hosted savings**: ~$150-400/month
- **Trade-off**: Manual scaling vs automatic scaling

## Required Services
- **DNS Provider**: Cloudflare (recommended for wildcard SSL)
- **Server Provider**: Hetzner, OVH, or DigitalOcean
- **Domain Registrar**: Any registrar supporting DNS management
- **GitHub**: OAuth2 authentication

## Next Steps

1. **Immediate**: Choose server provider and provision server
2. **Week 1**: Begin Phase 1 implementation
3. **Week 2**: Start Traefik configuration
4. **Week 3**: Begin security layer setup
5. **Week 4**: Complete bot migration
6. **Week 5**: Full deployment pipeline ready

## Quick Start Commands

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create acme.json for Traefik
touch acme.json
chmod 600 acme.json

# Start Traefik
docker-compose up -d traefik
```

## Troubleshooting

### Common Issues
- **SSL Certificate Issues**: Check DNS propagation and API credentials
- **Container Networking**: Verify Docker networks and labels
- **Authentication**: Test OAuth2 proxy configuration
- **Performance**: Monitor resource usage and adjust limits

### Debug Commands
```bash
# Check Traefik logs
docker-compose logs traefik

# Test SSL certificate
curl -v https://dev-alpha.zulu-team.dev

# Check container status
docker-compose ps

# Monitor resource usage
docker stats
```