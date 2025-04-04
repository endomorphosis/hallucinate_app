# Hallucinate App Observability Guide

This guide provides information on how to use the monitoring and observability features integrated into the Hallucinate App.

## Overview

The Hallucinate App includes comprehensive observability capabilities, including:

1. **Metrics Collection**: Prometheus-based metrics for operations, errors, and resource usage
2. **Structured Logging**: JSON-formatted logs with contextual information
3. **Performance Tracking**: Timing of operations and identification of bottlenecks
4. **System Resource Monitoring**: CPU, memory, and disk usage metrics
5. **Dashboards**: Pre-configured Grafana dashboards for visualization
6. **Alerting**: Prometheus alerts for critical conditions

## Quick Start

### Starting the Monitoring Stack

The simplest way to start using the observability features is with Docker Compose:

```bash
# Start the monitoring stack (Prometheus, Grafana, and AlertManager)
make start-monitoring

# Access Grafana at http://localhost:3000 (username: admin, password: admin)
# Access Prometheus at http://localhost:9091
# Access AlertManager at http://localhost:9093
```

### Kubernetes Deployment

For Kubernetes deployments:

```bash
# Deploy the application with the Helm chart
make helm-install

# If you're using the Prometheus Operator
make k8s-deploy-helm
```

## Using the Observability Features

### Metrics

The application exposes metrics at the `/metrics` endpoint on port 9090 by default. Here are some key metrics available:

#### IPFS Kit Metrics

- `ipfs_kit_bridge_operations_total`: Counter of operations performed
- `ipfs_kit_bridge_errors_total`: Counter of errors encountered
- `ipfs_kit_bridge_operation_duration_seconds`: Histogram of operation durations
- `ipfs_kit_bridge_system_memory_usage_bytes`: Gauge of memory usage
- `ipfs_kit_bridge_system_cpu_usage_percent`: Gauge of CPU usage
- `ipfs_kit_bridge_metadata_index_entries`: Gauge of metadata index size
- `ipfs_kit_bridge_metadata_index_operations_total`: Counter of metadata operations
- `ipfs_kit_bridge_process_uptime_seconds`: Counter of process uptime

#### SDK Generator Metrics

- `sdk_generator_operations_total`: Counter of SDK generation operations
- `sdk_generator_operation_duration_seconds`: Histogram of SDK generation durations
- `sdk_generator_size_bytes`: Gauge of generated SDK size

### Structured Logging

The application uses structured logging with the following configuration:

```python
from hallucinate_app.observability import info, warning, error, debug, set_context

# Set context for a request
set_context(
    request_id="abc123",
    user_id="user456",
    operation="fetch_data"
)

# Log with context
info("Processing data", data_size=1024, file_count=5)
```

### Performance Tracking

You can use timing decorators and context managers:

```python
from hallucinate_app.observability import timer, timed

# As a decorator
@timed("process_file")
def process_file(file_path):
    # Processing logic...
    pass

# As a context manager
def process_batch(files):
    for file in files:
        with timer("process_single_file"):
            # Processing logic...
            pass
```

## Grafana Dashboards

### IPFS Kit Dashboard

The IPFS Kit dashboard provides visibility into:

- Operation rates and error rates
- Operation durations (95th and 50th percentiles)
- Memory and CPU usage
- Metadata index operations
- Content type distribution

### SDK Generator Dashboard

The SDK Generator dashboard shows:

- SDK generation operations by language
- Error rates
- Generation durations
- Total SDKs generated
- Language distribution

## Alerts

The following alerts are configured:

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

## Configuration

### Environment Variables

You can configure observability features using environment variables:

- `OBSERVABILITY_PROMETHEUS_ENABLED`: Enable Prometheus metrics (true/false)
- `OBSERVABILITY_PROMETHEUS_PORT`: Port for Prometheus metrics (default: 9090)
- `OBSERVABILITY_SYSTEM_METRICS_ENABLED`: Enable system metrics collection (true/false)
- `OBSERVABILITY_SYSTEM_METRICS_INTERVAL`: System metrics collection interval in seconds
- `OBSERVABILITY_LOGGING_LEVEL`: Logging level (debug, info, warning, error)
- `OBSERVABILITY_LOGGING_JSON_FORMAT`: Enable JSON formatting for logs (true/false)
- `OBSERVABILITY_LOGGING_INCLUDE_TIMESTAMP`: Include timestamp in logs (true/false)
- `OBSERVABILITY_LOGGING_FILE_PATH`: Log file path (empty for stdout)

### Configuration File

You can also configure via `config.json`:

```json
{
  "observability": {
    "namespace": "ipfs_kit",
    "subsystem": "bridge",
    "logger_name": "ipfs_kit_bridge",
    "collect_system_metrics": true,
    "prometheus": {
      "enable_server": true,
      "port": 9090
    },
    "system_metrics_interval": 15,
    "logging": {
      "level": "info",
      "json_format": true,
      "include_timestamp": true
    },
    "sdkGenerator": {
      "enabled": true,
      "namespace": "sdk_generator",
      "collectLanguageMetrics": true,
      "collectSizeMetrics": true
    }
  }
}
```

## Integrating with Custom Monitoring Systems

### External Prometheus Server

If you have an existing Prometheus server:

1. Configure it to scrape metrics from `http://<your-app>:9090/metrics`
2. Import the Grafana dashboards from `python/hallucinate_app/docs/grafana_dashboard.json`

### Custom Logging Systems

The structured logs can be forwarded to systems like ELK (Elasticsearch, Logstash, Kibana) or a cloud-based logging service.

## Advanced Usage

### Custom Metrics

You can add custom metrics to your code:

```python
from hallucinate_app.observability import get_observability

# Get the observability manager
obs = get_observability()

# Create a counter
my_counter = obs.register_counter(
    name="custom_operation",
    description="Count of custom operations",
    labels=["operation_type", "status"]
)

# Increment the counter
my_counter.labels(operation_type="process", status="success").inc()
```

### Custom Timing Metrics

```python
from hallucinate_app.observability import get_observability

# Get the observability manager
obs = get_observability()

# Create a histogram
my_histogram = obs.register_histogram(
    name="custom_operation_duration",
    description="Duration of custom operations",
    labels=["operation_type"],
    buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0]
)

# Use as a context manager
with obs.timer("custom_operation_duration", {"operation_type": "process"}):
    # Operation to time
    pass
```

## Troubleshooting

### Metrics Not Appearing

1. Check if the metrics endpoint is accessible: `curl http://localhost:9090/metrics`
2. Verify Prometheus configuration: `curl http://localhost:9091/config`
3. Check for errors in the application logs

### Dashboard Issues

1. Ensure the Prometheus data source is properly configured in Grafana
2. Verify that the dashboard JSON is imported correctly
3. Check that the metrics exist in Prometheus: go to the "Explore" section in Grafana

### Alert Firing Issues

1. Check AlertManager configuration
2. Verify that alerts are properly defined in Prometheus
3. Check the AlertManager UI for suppressed or silenced alerts

## References

- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Kubernetes Monitoring Best Practices](https://kubernetes.io/docs/tasks/debug-application-cluster/resource-usage-monitoring/)
