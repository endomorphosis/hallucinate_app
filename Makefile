.PHONY: start-monitoring stop-monitoring install-deps install-all-deps install-submodule-deps test generate-sdks run-observability-demo helm-install helm-uninstall helm-upgrade k8s-deploy k8s-deploy-monitoring

# Start monitoring stack with Prometheus and Grafana
start-monitoring:
	@echo "Starting Prometheus and Grafana monitoring stack..."
	@mkdir -p docker/prometheus docker/grafana/provisioning/datasources docker/grafana/provisioning/dashboards docker/alertmanager
	@docker-compose -f docker/docker-compose.monitoring.yml up -d
	@echo "Monitoring stack started!"
	@echo "Prometheus available at: http://localhost:9091"
	@echo "Grafana available at: http://localhost:3000 (admin/admin)"
	@echo "AlertManager available at: http://localhost:9093"

# Stop monitoring stack
stop-monitoring:
	@echo "Stopping monitoring stack..."
	@docker-compose -f docker/docker-compose.monitoring.yml down
	@echo "Monitoring stack stopped!"

# Install dependencies
install-deps:
	@echo "Installing JavaScript dependencies..."
	@npm install
	@echo "Installing Python dependencies..."
	@pip install -r python/hallucinate_app/python/requirements.txt
	@pip install prometheus_client structlog psutil
	@echo "Dependencies installed!"

# Install all dependencies including submodules
install-all-deps: install-deps install-submodule-deps
	@echo "All dependencies installed!"

# Install submodule dependencies
install-submodule-deps:
	@echo "Installing submodule dependencies..."
	@bash scripts/install_submodule_deps.sh
	@echo "Submodule dependencies installed!"

# Run all tests
test:
	@echo "Running tests..."
	@npm test
	@python python/hallucinate_app/test/test_observability.py
	@echo "Tests completed!"

# Generate SDKs
generate-sdks:
	@echo "Generating SDKs for all languages..."
	@python python/hallucinate_app/sdk_generator.py --all
	@echo "SDKs generated!"

# Run observability demo
run-observability-demo:
	@echo "Running observability demo..."
	@python python/hallucinate_app/examples/observability_example.py
	@echo "Demo completed!"

# Install Helm chart
helm-install:
	@echo "Installing hallucinate-app Helm chart..."
	@helm dependency update helm/
	@helm install hallucinate-app helm/
	@echo "Helm chart installed!"

# Upgrade Helm chart
helm-upgrade:
	@echo "Upgrading hallucinate-app Helm chart..."
	@helm dependency update helm/
	@helm upgrade hallucinate-app helm/
	@echo "Helm chart upgraded!"

# Uninstall Helm chart
helm-uninstall:
	@echo "Uninstalling hallucinate-app Helm chart..."
	@helm uninstall hallucinate-app
	@echo "Helm chart uninstalled!"

# Deploy to Kubernetes with monitoring enabled
k8s-deploy:
	@echo "Deploying to Kubernetes..."
	@kubectl apply -f kubernetes/namespace.yaml
	@kubectl apply -f kubernetes/configmap.yaml
	@kubectl apply -f kubernetes/deployment.yaml
	@kubectl apply -f kubernetes/service.yaml
	@echo "Application deployed to Kubernetes!"

# Deploy monitoring stack to Kubernetes
k8s-deploy-monitoring:
	@echo "Deploying monitoring stack to Kubernetes..."
	@helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
	@helm repo add grafana https://grafana.github.io/helm-charts
	@helm repo update
	@helm install prometheus prometheus-community/prometheus --namespace monitoring --create-namespace
	@helm install grafana grafana/grafana --namespace monitoring
	@kubectl apply -f kubernetes/servicemonitor.yaml
	@echo "Monitoring stack deployed to Kubernetes!"
	@echo "To access Grafana:"
	@echo "  kubectl port-forward svc/grafana 3000:80 -n monitoring"
	@echo "  Visit http://localhost:3000 with username 'admin' and get password with:"
	@echo "  kubectl get secret --namespace monitoring grafana -o jsonpath="{.data.admin-password}" | base64 --decode"

# Build the Docker image
docker-build:
	@echo "Building Docker image..."
	@docker build -t hallucinate-app:latest .
	@echo "Docker image built!"

# Push the Docker image
docker-push:
	@echo "Pushing Docker image..."
	@docker tag hallucinate-app:latest ${DOCKER_REGISTRY}/hallucinate-app:latest
	@docker push ${DOCKER_REGISTRY}/hallucinate-app:latest
	@echo "Docker image pushed!"

# Deploy to Kubernetes with Helm chart and monitoring enabled
k8s-deploy-helm:
	@echo "Deploying to Kubernetes with Helm and monitoring..."
	@helm dependency update helm/
	@helm install hallucinate-app helm/ --set serviceMonitor.enabled=true
	@echo "Application deployed to Kubernetes with Helm and monitoring enabled!"

# Help command
help:
	@echo "Available commands:"
	@echo "  make start-monitoring       - Start Prometheus and Grafana monitoring stack"
	@echo "  make stop-monitoring        - Stop monitoring stack"
	@echo "  make install-deps           - Install main project dependencies"
	@echo "  make install-submodule-deps - Install submodule dependencies"
	@echo "  make install-all-deps       - Install all dependencies (main + submodules)"
	@echo "  make test                   - Run all tests"
	@echo "  make generate-sdks          - Generate SDKs for all languages"
	@echo "  make run-observability-demo - Run observability demo"
	@echo "  make helm-install           - Install Helm chart"
	@echo "  make helm-upgrade           - Upgrade Helm chart"
	@echo "  make helm-uninstall         - Uninstall Helm chart"
	@echo "  make k8s-deploy             - Deploy to Kubernetes"
	@echo "  make k8s-deploy-monitoring  - Deploy monitoring stack to Kubernetes"
	@echo "  make docker-build           - Build the Docker image"
	@echo "  make docker-push            - Push the Docker image"
	@echo "  make k8s-deploy-helm        - Deploy to Kubernetes with Helm and monitoring"
	@echo "  make help                   - Show this help message"