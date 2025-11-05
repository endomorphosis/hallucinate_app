# Deployment Guide

This guide covers deploying Hallucinate App in various environments.

## Table of Contents

- [Local Development](#local-development)
- [Production Desktop Application](#production-desktop-application)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Deployment](#cloud-deployment)

## Local Development

### Prerequisites

- Node.js 18.x or 20.x
- Python 3.8+
- IPFS daemon (optional)
- Git

### Installation

```bash
git clone https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app
npm install
```

### Running Locally

```bash
# Start in development mode
npm start

# With debugging
NODE_ENV=development DEBUG=* npm start
```

## Production Desktop Application

### Building Distributables

#### All Platforms

```bash
# Package for current platform
npm run package

# Create installers
npm run make
```

#### Platform-Specific Builds

**macOS:**
```bash
npm run make -- --platform=darwin --arch=x64,arm64
```

**Windows:**
```bash
npm run make -- --platform=win32 --arch=x64
```

**Linux:**
```bash
npm run make -- --platform=linux --arch=x64,arm64
```

### Distribution

Built applications are located in:
- `out/make/` - Installers
- `out/hallucinate_app-{platform}-{arch}/` - Packaged applications

## Docker Deployment

### Building Docker Image

```bash
# Build the image
docker build -t hallucinate_app:latest .

# Or use Docker Compose
docker-compose build
```

### Running with Docker

```bash
# Run with default configuration
docker run -p 3000:3000 -p 8000:8000 hallucinate_app:latest

# Run with volume mounts
docker run -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/config \
  -p 3000:3000 \
  hallucinate_app:latest
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Variables

```bash
# .env file for Docker
NODE_ENV=production
IPFS_API_URL=http://ipfs:5001
AUTO_START_DAEMONS=true
LOG_LEVEL=info
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.21+)
- kubectl configured
- Helm 3.x

### Using Helm

```bash
# Add Helm repository (if available)
helm repo add hallucinate https://charts.hallucinate.app
helm repo update

# Install with default values
helm install hallucinate hallucinate/hallucinate-app

# Install with custom values
helm install hallucinate hallucinate/hallucinate-app \
  -f custom-values.yaml
```

### Using Local Helm Chart

```bash
cd helm/

# Install
helm install hallucinate . \
  --namespace hallucinate-app \
  --create-namespace

# Upgrade
helm upgrade hallucinate . \
  --namespace hallucinate-app

# Uninstall
helm uninstall hallucinate --namespace hallucinate-app
```

### Configuration

Edit `helm/values.yaml`:

```yaml
replicaCount: 3

image:
  repository: hallucinate/hallucinate-app
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 3000

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 1000m
    memory: 2Gi

persistence:
  enabled: true
  size: 10Gi
  storageClass: standard

ipfs:
  enabled: true
  replicaCount: 3
```

### Accessing the Application

```bash
# Get service details
kubectl get svc -n hallucinate-app

# Port forward for local access
kubectl port-forward svc/hallucinate-app 3000:3000 -n hallucinate-app
```

## Cloud Deployment

### AWS

#### ECS/Fargate

```bash
# Create ECR repository
aws ecr create-repository --repository-name hallucinate-app

# Build and push image
aws ecr get-login-password | docker login --username AWS --password-stdin {account}.dkr.ecr.{region}.amazonaws.com
docker build -t hallucinate-app .
docker tag hallucinate-app:latest {account}.dkr.ecr.{region}.amazonaws.com/hallucinate-app:latest
docker push {account}.dkr.ecr.{region}.amazonaws.com/hallucinate-app:latest

# Deploy to ECS (use AWS Console or CLI)
```

#### EKS

```bash
# Create EKS cluster
eksctl create cluster --name hallucinate-cluster --region us-west-2

# Deploy using Helm
helm install hallucinate helm/ --namespace hallucinate-app --create-namespace
```

### Google Cloud Platform

#### GKE

```bash
# Create GKE cluster
gcloud container clusters create hallucinate-cluster \
  --zone us-central1-a \
  --num-nodes 3

# Get credentials
gcloud container clusters get-credentials hallucinate-cluster --zone us-central1-a

# Deploy
helm install hallucinate helm/ --namespace hallucinate-app --create-namespace
```

#### Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/{project}/hallucinate-app

# Deploy to Cloud Run
gcloud run deploy hallucinate-app \
  --image gcr.io/{project}/hallucinate-app \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Azure

#### AKS

```bash
# Create AKS cluster
az aks create \
  --resource-group hallucinate-rg \
  --name hallucinate-cluster \
  --node-count 3 \
  --enable-addons monitoring

# Get credentials
az aks get-credentials --resource-group hallucinate-rg --name hallucinate-cluster

# Deploy
helm install hallucinate helm/ --namespace hallucinate-app --create-namespace
```

## Configuration Management

### Environment Variables

```bash
# Required
NODE_ENV=production
IPFS_API_URL=http://localhost:5001

# Optional
AUTO_START_DAEMONS=true
LOG_LEVEL=info
PYTHON_PATH=/usr/bin/python3
USE_MOCK_AUTH=false
```

### Configuration Files

Configuration is managed through:
- `config/config.toml` - Main configuration
- `config/config.js` - JavaScript configuration
- `config/config.py` - Python configuration

### Secrets Management

#### Kubernetes Secrets

```bash
# Create secret
kubectl create secret generic hallucinate-secrets \
  --from-literal=api-key=your-key \
  --namespace hallucinate-app

# Use in deployment
env:
  - name: API_KEY
    valueFrom:
      secretKeyRef:
        name: hallucinate-secrets
        key: api-key
```

#### Docker Secrets

```bash
# Create secret
echo "your-api-key" | docker secret create api_key -

# Use in service
docker service create \
  --secret api_key \
  hallucinate_app:latest
```

## Monitoring & Observability

### Prometheus & Grafana

The application exposes Prometheus metrics on `/metrics`.

```bash
# Start monitoring stack
docker-compose -f docker/docker-compose.monitoring.yml up -d

# Access Grafana
# http://localhost:3000 (admin/admin)
```

### Health Checks

```bash
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

# Readiness probe
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Scaling

### Horizontal Pod Autoscaling (Kubernetes)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hallucinate-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hallucinate-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Load Balancing

Configure load balancing through:
- Kubernetes Service (type: LoadBalancer)
- Ingress controller (nginx, traefik)
- Cloud load balancers (ALB, GCP LB, Azure LB)

## Backup & Recovery

### Data Backup

```bash
# Backup IPFS data
ipfs repo fsck
tar -czf ipfs-backup.tar.gz ~/.ipfs

# Backup database
pg_dump hallucinate_db > hallucinate_backup.sql
```

### Configuration Backup

```bash
# Backup configuration
tar -czf config-backup.tar.gz config/
```

### Disaster Recovery

1. Restore IPFS data
2. Restore database
3. Restore configuration
4. Redeploy application

## Security Considerations

### HTTPS/TLS

```bash
# Generate certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem

# Use in production
# Configure reverse proxy (nginx, traefik) with certificates
```

### Network Policies

```yaml
# Kubernetes network policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: hallucinate-app
spec:
  podSelector:
    matchLabels:
      app: hallucinate-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 3000
```

### Resource Limits

Always set resource limits in production:

```yaml
resources:
  limits:
    cpu: "2"
    memory: 4Gi
  requests:
    cpu: "1"
    memory: 2Gi
```

## Troubleshooting Deployment

See [Troubleshooting Guide](TROUBLESHOOTING.md) for common deployment issues.

## Support

For deployment support:
- [GitHub Issues](https://github.com/endomorphosis/hallucinate_app/issues)
- [Discussions](https://github.com/endomorphosis/hallucinate_app/discussions)

---

*Last Updated: 2025-11-05*
