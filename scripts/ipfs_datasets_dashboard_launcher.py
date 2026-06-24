#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path

from jinja2 import ChoiceLoader, FileSystemLoader

from ipfs_datasets_py.dashboards.common_crawl_dashboard import (
    CommonCrawlDashboardIntegration,
    register_dashboard_routes as register_common_crawl_routes,
)
from ipfs_datasets_py.dashboards.discord_dashboard import create_discord_dashboard_blueprint
from ipfs_datasets_py.dashboards.mcp_dashboard import MCPDashboard, MCPDashboardConfig
from ipfs_datasets_py.dashboards.patent_dashboard import register_patent_routes


LOGGER = logging.getLogger("hallucinate.ipfs_datasets_dashboard_launcher")
REPO_ROOT = Path(__file__).resolve().parents[1]

DATASET_DASHBOARD_CATALOG = [
    {
        "id": "admin-overview",
        "label": "Admin Overview",
        "path": "/",
        "description": "Base admin status, metrics, logs, and configuration surface.",
    },
    {
        "id": "mcp-overview",
        "label": "MCP Overview",
        "path": "/mcp",
        "description": "Primary MCP dashboard with tool registry and workflow panels.",
    },
    {
        "id": "analytics",
        "label": "Analytics",
        "path": "/mcp/analytics",
        "description": "Advanced analytics and monitoring metrics.",
    },
    {
        "id": "rag-query",
        "label": "RAG Query",
        "path": "/mcp/rag",
        "description": "Interactive RAG query interface and result workflows.",
    },
    {
        "id": "investigation",
        "label": "Investigation",
        "path": "/mcp/investigation",
        "description": "Content investigation, geospatial, and entity analysis surface.",
    },
    {
        "id": "caselaw",
        "label": "Caselaw",
        "path": "/mcp/caselaw",
        "description": "Temporal deontic logic caselaw dashboard.",
    },
    {
        "id": "finance",
        "label": "Finance",
        "path": "/mcp/finance",
        "description": "Finance-oriented deontic analysis dashboard.",
    },
    {
        "id": "medicine",
        "label": "Medicine",
        "path": "/mcp/medicine",
        "description": "Medical and biochemical workflow dashboard.",
    },
    {
        "id": "software",
        "label": "Software",
        "path": "/mcp/software",
        "description": "Software engineering theorem and workflow dashboard.",
    },
    {
        "id": "patents",
        "label": "Patent Dashboard",
        "path": "/mcp/patents/",
        "description": "Patent search, dataset build, and GraphRAG ingestion workflows.",
    },
    {
        "id": "discord",
        "label": "Discord Dashboard",
        "path": "/mcp/discord/",
        "description": "Discord export, guild/channel browsing, and analytics dashboard.",
    },
    {
        "id": "common-crawl",
        "label": "Common Crawl",
        "path": "/subdashboard/common-crawl",
        "description": "Common Crawl search dashboard wrapper and health surface.",
    },
]


def _extend_template_search_path(dashboard: MCPDashboard) -> None:
    if not dashboard.app:
        return

    import ipfs_datasets_py

    package_root = Path(ipfs_datasets_py.__file__).resolve().parent
    extra_template_paths = [
        package_root / "templates",
        package_root / "templates" / "admin",
        package_root.parent / "templates",
        package_root.parent / "templates" / "admin",
    ]

    loaders = []
    if dashboard.app.jinja_loader is not None:
        loaders.append(dashboard.app.jinja_loader)

    for path in extra_template_paths:
        if path.exists():
            loaders.append(FileSystemLoader(str(path)))

    if loaders:
        choice_loader = ChoiceLoader(loaders)
        dashboard.app.jinja_loader = choice_loader
        dashboard.app.jinja_env.loader = choice_loader


def _candidate_package_roots() -> list[Path]:
    roots = [
        REPO_ROOT / "ipfs_datasets_py" / "ipfs_datasets_py",
        REPO_ROOT / "ipfs_accelerate_py" / "ipfs_datasets_py" / "ipfs_datasets_py",
    ]

    try:
        import ipfs_datasets_py
        roots.insert(0, Path(ipfs_datasets_py.__file__).resolve().parent)
    except Exception:
        pass

    unique_roots = []
    seen = set()
    for root in roots:
      key = str(root)
      if key not in seen:
        seen.add(key)
        unique_roots.append(root)
    return unique_roots


def _stage_dashboard_templates(dashboard: MCPDashboard) -> None:
    if not dashboard.app:
        return

    destination_root = Path(dashboard.app.template_folder)
    destination_root.mkdir(parents=True, exist_ok=True)
    destination_admin = destination_root / "admin"
    destination_admin.mkdir(parents=True, exist_ok=True)

    required_templates = [
        ("templates/software_dashboard_mcp.html", destination_root / "software_dashboard_mcp.html"),
        ("templates/admin/caselaw_dashboard_mcp.html", destination_root / "caselaw_dashboard_mcp.html"),
        ("templates/admin/finance_dashboard_mcp.html", destination_root / "finance_dashboard_mcp.html"),
        ("templates/admin/medicine_dashboard_mcp.html", destination_root / "medicine_dashboard_mcp.html"),
        ("templates/admin/patent_dashboard.html", destination_admin / "patent_dashboard.html"),
        ("templates/admin/discord_dashboard.html", destination_admin / "discord_dashboard.html"),
    ]

    for relative_source, destination in required_templates:
        if destination.exists():
            continue
        for package_root in _candidate_package_roots():
            source = package_root / relative_source
            if source.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                break


def _prepare_common_crawl_import_path() -> None:
    package_root = Path(__import__("ipfs_datasets_py").__file__).resolve().parent
    common_crawl_parent = package_root / "processors" / "web_archiving"
    if common_crawl_parent.exists():
        sys.path.insert(0, str(common_crawl_parent))


def _mount_additional_dashboards(dashboard: MCPDashboard) -> None:
    if not dashboard.app:
        return

    _extend_template_search_path(dashboard)
    _stage_dashboard_templates(dashboard)
    register_patent_routes(dashboard.app)

    discord_blueprint = create_discord_dashboard_blueprint()
    if discord_blueprint and discord_blueprint.name not in dashboard.app.blueprints:
        dashboard.app.register_blueprint(discord_blueprint)

    _prepare_common_crawl_import_path()
    try:
        integration = CommonCrawlDashboardIntegration()
        integration.start_embedded_dashboard()
    except Exception as exc:  # pragma: no cover - optional dependency path
        LOGGER.warning("Common Crawl embedded dashboard could not be started: %s", exc)
    register_common_crawl_routes(dashboard.app)

    @dashboard.app.route("/api/hallucinate/dashboard-catalog")
    def hallucinate_dashboard_catalog():
        return {
            "dashboards": DATASET_DASHBOARD_CATALOG,
            "total": len(DATASET_DASHBOARD_CATALOG),
        }


def _patch_analytics_defaults(dashboard: MCPDashboard) -> None:
    original_get_metrics = dashboard._get_current_analytics_metrics

    def get_metrics_with_defaults() -> dict:
        metrics = original_get_metrics() or {}
        metrics.setdefault("total_websites_processed", 0)
        metrics.setdefault("total_processing_time", 0.0)
        metrics.setdefault("success_rate", 0.0)
        metrics.setdefault("active_processing_sessions", 0)
        metrics.setdefault("total_rag_queries", 0)
        metrics.setdefault("average_query_time", 0.0)
        metrics.setdefault("last_updated", "not_available")
        return metrics

    dashboard._get_current_analytics_metrics = get_metrics_with_defaults


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the augmented IPFS Datasets dashboard for Hallucinate")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8899)
    parser.add_argument("--mcp-host", default="127.0.0.1")
    parser.add_argument("--mcp-port", type=int, default=3002)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    config = MCPDashboardConfig(
        host=args.host,
        port=args.port,
        mcp_server_host=args.mcp_host,
        mcp_server_port=args.mcp_port,
        enable_graphrag=True,
        enable_analytics=True,
        enable_rag_query=True,
        enable_investigation=True,
        enable_real_time_monitoring=True,
        enable_tool_execution=True,
        open_browser=False,
    )

    dashboard = MCPDashboard()
    dashboard.mcp_config = config
    dashboard.configure(config)
    dashboard._create_mcp_templates()
    _patch_analytics_defaults(dashboard)
    _mount_additional_dashboards(dashboard)

    print(f"Augmented IPFS Datasets dashboard running at http://{args.host}:{args.port}/mcp")
    print("Mounted datasets dashboard routes:")
    for entry in DATASET_DASHBOARD_CATALOG:
        print(f"  - {entry['label']}: http://{args.host}:{args.port}{entry['path']}")

    dashboard.app.run(host=args.host, port=args.port, debug=False, use_reloader=False, threaded=True)


if __name__ == "__main__":
    main()