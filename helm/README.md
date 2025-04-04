# Hallucinate App Helm Chart

This Helm chart deploys the Hallucinate App along with Prometheus and Grafana for monitoring and visualization.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (for Prometheus and Grafana persistence)

## Getting Started

### Add the Dependency Repositories

```bash
# Add the Prometheus community Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Add the Grafana Helm repository
helm repo add grafana https://grafana.github.io/helm-charts

# Update repositories
helm repo update
```

### Install the Chart

To install the chart with the release name `hallucinate-app`:

```bash
helm install hallucinate-app ./helm
```

### Upgrading the Chart

To upgrade the chart:

```bash
helm upgrade hallucinate-app ./helm
```

## Configuration

The following table lists the configurable parameters of the Hallucinate App chart and their default values.

### General Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas for the application | `1` |
| `image.repository` | Image repository | `hallucinate-app` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `imagePullSecrets` | Image pull secrets | `[]` |
| `nameOverride` | Override the name of the chart | `""` |
| `fullnameOverride` | Override the full name of the chart | `""` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service HTTP port | `3000` |
| `service.metricsPort` | Service metrics port | `9090` |
| `resources.limits.cpu` | CPU resource limits | `1000m` |
| `resources.limits.memory` | Memory resource limits | `1Gi` |
| `resources.requests.cpu` | CPU resource requests | `500m` |
| `resources.requests.memory` | Memory resource requests | `512Mi` |

### Monitoring Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `prometheus.enabled` | Enable or disable Prometheus | `true` |
| `prometheus.alertmanager.enabled` | Enable or disable Alertmanager | `true` |
| `grafana.enabled` | Enable or disable Grafana | `true` |
| `grafana.adminPassword` | Grafana admin password | `admin` |

### ServiceMonitor Configuration (for Prometheus Operator)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceMonitor.enabled` | Enable the ServiceMonitor resource | `false` |
| `serviceMonitor.interval` | Scrape interval | `15s` |
| `serviceMonitor.scrapeTimeout` | Scrape timeout | `10s` |
| `serviceMonitor.path` | Metrics path | `/metrics` |
| `serviceMonitor.additionalLabels` | Additional labels for the ServiceMonitor | `{}` |

### NetworkPolicy Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `networkPolicy.enabled` | Enable the NetworkPolicy resource | `false` |
| `networkPolicy.metricsNamespaceSelector` | Namespace selector for metrics scraping | `{}` |
| `networkPolicy.metricsPodSelector` | Pod selector for metrics scraping | `{}` |

### Observability Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `observability.prometheusEnabled` | Enable Prometheus metrics collection | `true` |
| `observability.prometheusPort` | Prometheus metrics port | `9090` |
| `observability.systemMetricsEnabled` | Enable system metrics collection | `true` |
| `observability.systemMetricsInterval` | System metrics collection interval in seconds | `15` |
| `observability.logging.level` | Log level | `info` |
| `observability.logging.jsonFormat` | Enable JSON formatting for logs | `true` |
| `observability.logging.includeTimestamp` | Include timestamp in logs | `true` |
| `observability.logging.logFilePath` | Log file path (empty for stdout) | `""` |
| `observability.sdkGenerator.enabled` | Enable SDK Generator metrics | `true` |
| `observability.sdkGenerator.namespace` | SDK Generator metrics namespace | `sdk_generator` |
| `observability.sdkGenerator.collectLanguageMetrics` | Collect language-specific metrics | `true` |
| `observability.sdkGenerator.collectSizeMetrics` | Collect SDK size metrics | `true` |

## Prometheus Alerts

The chart comes with pre-configured Prometheus alerts:

| Alert | Description | Threshold | Severity |
|-------|-------------|-----------|----------|
| HighErrorRate | High error rate in IPFS Kit operations | >10% error rate for 2m | warning |
| SlowOperations | Slow IPFS operations detected | 95th percentile >1s for 2m | warning |
| HighMemoryUsage | High memory usage | >1GB for 5m | warning |
| HighCPUUsage | High CPU usage | >80% for 5m | warning |
| SDKGenerationFailure | SDK generation failures detected | Any failures in 15m | warning |
| SlowSDKGeneration | Slow SDK generation detected | 95th percentile >5m for 5m | warning |
| ObservabilityComponentDown | Metrics endpoint unavailable | Absent for 5m | critical |
| PersistentHighErrorRate | Error rate remains high | >5% for 30m | critical |
| MetadataIndexNotGrowing | Metadata index not growing | No additions for 6h | info |
| LongUptimeWithoutRestart | Process running for a long time | >24h for 1h | info |

## Grafana Dashboards

The chart includes two pre-configured Grafana dashboards:

1. **IPFS Kit Metrics Dashboard** - Visualizes IPFS Kit operations, error rates, durations, memory usage, and more.
2. **SDK Generator Dashboard** - Visualizes SDK generation operations, durations, error rates, and language distribution.

## Examples

### Basic Installation

```bash
helm install hallucinate-app ./helm
```

### Installation with Custom Values

```bash
helm install hallucinate-app ./helm --set replicaCount=2 --set resources.limits.memory=2Gi
```

### Using a Custom Values File

```bash
helm install hallucinate-app ./helm -f custom-values.yaml
```

### Installation with Prometheus Operator Integration

To install with ServiceMonitor for Prometheus Operator:

```bash
helm install hallucinate-app ./helm --set serviceMonitor.enabled=true
```

### Installation with NetworkPolicy

To install with NetworkPolicy:

```bash
helm install hallucinate-app ./helm --set networkPolicy.enabled=true
```

## Accessing the Dashboards

### Grafana Dashboard

To access the Grafana dashboard:

```bash
# Get the Grafana password
export GRAFANA_PASSWORD=$(kubectl get secret --namespace default hallucinate-app-grafana -o jsonpath="{.data.admin-password}" | base64 --decode)

# Port forward to access Grafana
kubectl port-forward svc/hallucinate-app-grafana 3000:80

# Access Grafana at http://localhost:3000 with username: admin and password: $GRAFANA_PASSWORD
```

### Prometheus Dashboard

To access Prometheus:

```bash
# Port forward to access Prometheus
kubectl port-forward svc/hallucinate-app-prometheus-server 9090:80

# Access Prometheus at http://localhost:9090
```

### Application Dashboard

After deploying the chart, you can access the application by forwarding the service port:

```bash
kubectl port-forward svc/hallucinate-app 3000:3000

# Then access the application at http://localhost:3000
```

## Uninstalling the Chart

To uninstall/delete the `hallucinate-app` deployment:

```bash
helm delete hallucinate-app
```

## Development

### Testing the Chart

To test the chart without installing:

```bash
helm template hallucinate-app ./helm
```

### Linting the Chart

To lint the chart:

```bash
helm lint ./helm
```

## Troubleshooting

### Pod is Pending

Check if there are enough resources in your cluster:

```bash
kubectl describe pod <pod-name>
```

### Cannot Access Grafana or Prometheus

Ensure port-forwarding is active:

```bash
kubectl get pods
kubectl port-forward svc/hallucinate-app-grafana 3000:80
```

### Metrics Not Showing Up

Verify that the metrics endpoint is accessible:

```bash
kubectl port-forward svc/hallucinate-app 9090:9090
curl http://localhost:9090/metrics
```

### Using with Existing Prometheus

If you're using an existing Prometheus installation:

```bash
helm install hallucinate-app ./helm --set prometheus.enabled=false --set serviceMonitor.enabled=true
```

## Integrating with CI/CD

### GitHub Actions Example

```yaml
name: Deploy to Kubernetes

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
      
    - name: Set up Kubernetes tools
      uses: azure/setup-kubectl@v3
      
    - name: Set up Helm
      uses: azure/setup-helm@v3
      
    - name: Configure kubeconfig
      uses: azure/k8s-set-context@v3
      with:
        kubeconfig: ${{ secrets.KUBE_CONFIG }}
        
    - name: Deploy Application
      run: |
        helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
        helm repo add grafana https://grafana.github.io/helm-charts
        helm repo update
        helm upgrade --install hallucinate-app ./helm
```