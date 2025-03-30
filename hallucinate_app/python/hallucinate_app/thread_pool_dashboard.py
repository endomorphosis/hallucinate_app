"""
Thread Pool Dashboard

This module provides a dashboard for visualizing the performance of thread pools.
It integrates with the Thread Pool Monitor to display real-time metrics,
resource usage, and performance recommendations.
"""

import os
import sys
import time
import json
import logging
import threading
import asyncio
from typing import Dict, List, Any, Optional, Union, Tuple

from .thread_pool_manager import ThreadPoolManager, TaskType, TaskPriority
from .thread_pool_monitor import ThreadPoolMonitor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ThreadPoolDashboard:
    """
    Dashboard for thread pool monitoring and visualization
    
    This class provides a dashboard interface for monitoring thread pool
    performance, visualizing metrics, and providing recommendations for
    optimizing thread pool configuration.
    """
    
    def __init__(
        self,
        thread_pool_manager: ThreadPoolManager,
        thread_pool_monitor: Optional[ThreadPoolMonitor] = None,
        resources: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None
    ):
        """
        Initialize the thread pool dashboard
        
        Args:
            thread_pool_manager: The thread pool manager to monitor
            thread_pool_monitor: Optional existing thread pool monitor
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.thread_pool_manager = thread_pool_manager
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Create or use existing monitor
        if thread_pool_monitor:
            self.monitor = thread_pool_monitor
        else:
            self.monitor = ThreadPoolMonitor(
                thread_pool_manager=thread_pool_manager,
                resources=self.resources,
                metadata={
                    "poll_interval": self.metadata.get("poll_interval", 2.0),
                    "metrics_window": self.metadata.get("metrics_window", 60)
                }
            )
        
        # Configuration
        self.config = {
            "update_interval": self.metadata.get("update_interval", 2.0),
            "max_history_points": self.metadata.get("max_history_points", 100),
            "dashboard_port": self.metadata.get("dashboard_port", 8080),
            "enable_web_dashboard": self.metadata.get("enable_web_dashboard", False)
        }
        
        # State tracking
        self.running = False
        self.start_time = None
        self.metrics_history = []
        self.health_history = []
        self.recommendation_history = []
        
        # Update thread
        self.update_thread = None
        self.stop_event = threading.Event()
        
        # Web server (if enabled)
        self.web_server = None
        
        logger.info(f"ThreadPoolDashboard initialized with config: {self.config}")
    
    def start(self):
        """
        Start the dashboard
        """
        if self.running:
            logger.warning("Thread Pool Dashboard already running")
            return
        
        # Start the monitor if it's not already running
        if not self.monitor.running:
            self.monitor.start()
        
        # Initialize state
        self.running = True
        self.start_time = time.time()
        self.stop_event.clear()
        
        # Start the update thread
        self.update_thread = threading.Thread(
            target=self._update_loop,
            name="dashboard-updater",
            daemon=True
        )
        self.update_thread.start()
        
        # Start the web server if enabled
        if self.config["enable_web_dashboard"]:
            self._start_web_server()
        
        logger.info("Thread Pool Dashboard started")
    
    def stop(self):
        """
        Stop the dashboard
        """
        if not self.running:
            logger.warning("Thread Pool Dashboard not running")
            return
        
        # Signal threads to stop
        self.running = False
        self.stop_event.set()
        
        # Stop the update thread
        if self.update_thread:
            self.update_thread.join(timeout=5.0)
            self.update_thread = None
        
        # Stop the web server if running
        if self.web_server:
            self._stop_web_server()
        
        logger.info("Thread Pool Dashboard stopped")
    
    def _update_loop(self):
        """
        Main update loop for the dashboard
        """
        logger.info("Dashboard update thread started")
        
        try:
            while not self.stop_event.is_set():
                try:
                    # Collect metrics
                    metrics = self.monitor.get_metrics()
                    health = self.monitor.get_health_report()
                    recommendations = self.monitor.get_optimization_recommendations()
                    
                    # Update history
                    self._update_history(metrics, health, recommendations)
                    
                    # Update dashboard UI (if there were any real UI components)
                    self._update_ui()
                    
                except Exception as e:
                    logger.error(f"Error in dashboard update loop: {e}")
                
                # Wait for the next update
                self.stop_event.wait(self.config["update_interval"])
        
        except Exception as e:
            logger.error(f"Fatal error in dashboard update thread: {e}")
        
        finally:
            logger.info("Dashboard update thread stopped")
    
    def _update_history(self, metrics: Dict[str, Any], health: Dict[str, Any], recommendations: Dict[str, Any]):
        """
        Update the metrics history
        
        Args:
            metrics: Current metrics
            health: Current health report
            recommendations: Current optimization recommendations
        """
        # Add to history
        self.metrics_history.append(metrics)
        self.health_history.append(health)
        self.recommendation_history.append(recommendations)
        
        # Trim history if needed
        max_points = self.config["max_history_points"]
        if len(self.metrics_history) > max_points:
            self.metrics_history = self.metrics_history[-max_points:]
        if len(self.health_history) > max_points:
            self.health_history = self.health_history[-max_points:]
        if len(self.recommendation_history) > max_points:
            self.recommendation_history = self.recommendation_history[-max_points:]
    
    def _update_ui(self):
        """
        Update the dashboard UI
        
        This would usually update UI components, but since this is a CLI-based
        implementation, we'll just log some information.
        """
        # Get the latest metrics
        if not self.metrics_history:
            return
        
        metrics = self.metrics_history[-1]
        health = self.health_history[-1]
        
        # Log some basic information
        system_utilization = 0
        system_queue_depth = 0
        
        if metrics["system"]["time_series"]["worker_utilization"]:
            system_utilization = metrics["system"]["time_series"]["worker_utilization"][-1]
        
        if metrics["system"]["time_series"]["queue_depth"]:
            system_queue_depth = metrics["system"]["time_series"]["queue_depth"][-1]
        
        logger.debug(
            f"Thread Pools: {len(metrics['pools'])} | "
            f"Utilization: {system_utilization:.2f} | "
            f"Queue: {system_queue_depth} | "
            f"Status: {health['status']}"
        )
    
    def _start_web_server(self):
        """
        Start the web server for the dashboard
        
        Note: This is just a placeholder method. In a real implementation,
        this would start a web server (e.g., using Flask or FastAPI) to
        serve the dashboard UI.
        """
        logger.info(f"Web dashboard would be started on port {self.config['dashboard_port']}")
        
        # Placeholder for web server initialization
        self.web_server = True
    
    def _stop_web_server(self):
        """
        Stop the web server for the dashboard
        
        Note: This is just a placeholder method. In a real implementation,
        this would stop the web server.
        """
        logger.info("Web dashboard would be stopped")
        
        # Placeholder for web server shutdown
        self.web_server = None
    
    def get_current_metrics(self) -> Dict[str, Any]:
        """
        Get the current metrics
        
        Returns:
            Dict[str, Any]: Current metrics
        """
        if not self.metrics_history:
            return self.monitor.get_metrics()
        
        return self.metrics_history[-1]
    
    def get_current_health(self) -> Dict[str, Any]:
        """
        Get the current health report
        
        Returns:
            Dict[str, Any]: Current health report
        """
        if not self.health_history:
            return self.monitor.get_health_report()
        
        return self.health_history[-1]
    
    def get_current_recommendations(self) -> Dict[str, Any]:
        """
        Get the current optimization recommendations
        
        Returns:
            Dict[str, Any]: Current optimization recommendations
        """
        if not self.recommendation_history:
            return self.monitor.get_optimization_recommendations()
        
        return self.recommendation_history[-1]
    
    def get_metrics_history(self) -> List[Dict[str, Any]]:
        """
        Get the metrics history
        
        Returns:
            List[Dict[str, Any]]: Metrics history
        """
        return self.metrics_history
    
    def get_health_history(self) -> List[Dict[str, Any]]:
        """
        Get the health history
        
        Returns:
            List[Dict[str, Any]]: Health history
        """
        return self.health_history
    
    def get_recommendation_history(self) -> List[Dict[str, Any]]:
        """
        Get the recommendation history
        
        Returns:
            List[Dict[str, Any]]: Recommendation history
        """
        return self.recommendation_history
    
    def get_dashboard_status(self) -> Dict[str, Any]:
        """
        Get the dashboard status
        
        Returns:
            Dict[str, Any]: Dashboard status
        """
        return {
            "running": self.running,
            "uptime": time.time() - self.start_time if self.start_time else 0,
            "monitor_running": self.monitor.running,
            "web_server_running": self.web_server is not None,
            "metrics_history_length": len(self.metrics_history),
            "health_history_length": len(self.health_history),
            "recommendation_history_length": len(self.recommendation_history),
            "config": self.config
        }
    
    def get_dashboard_summary(self) -> Dict[str, Any]:
        """
        Get a summary of the dashboard data
        
        Returns:
            Dict[str, Any]: Dashboard summary
        """
        # Get the latest data
        metrics = self.get_current_metrics()
        health = self.get_current_health()
        recommendations = self.get_current_recommendations()
        
        # Create a summary
        summary = {
            "timestamp": time.time(),
            "status": health["status"],
            "issues": health["issues"],
            "utilization": health["worker_utilization"],
            "queue_depth": health["queue_depth"],
            "pools": {},
            "recommendations": recommendations["general"],
            "dashboard_status": self.get_dashboard_status()
        }
        
        # Add pool summaries
        for pool_id, pool_status in health["pools_status"].items():
            summary["pools"][pool_id] = {
                "status": pool_status["status"],
                "issues": pool_status["issues"],
                "utilization": pool_status["worker_utilization"],
                "queue_depth": pool_status["queue_depth"],
                "recommendations": recommendations["pools"].get(pool_id, [])
            }
        
        return summary
    
    def get_pool_details(self, pool_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific pool
        
        Args:
            pool_id: ID of the pool
            
        Returns:
            Dict[str, Any]: Pool details
        """
        # Get the latest metrics
        metrics = self.get_current_metrics()
        
        # Get pool metrics
        if pool_id not in metrics["pools"]:
            raise ValueError(f"Pool {pool_id} not found")
        
        pool_metrics = metrics["pools"][pool_id]
        
        # Get health report
        health = self.get_current_health()
        pool_health = health["pools_status"].get(pool_id, {})
        
        # Get recommendations
        recommendations = self.get_current_recommendations()
        pool_recommendations = recommendations["pools"].get(pool_id, [])
        
        # Create a detailed view
        details = {
            "pool_id": pool_id,
            "pool_type": pool_metrics.get("pool_type", "unknown"),
            "status": pool_health.get("status", "unknown"),
            "issues": pool_health.get("issues", []),
            "metrics": pool_metrics,
            "recommendations": pool_recommendations
        }
        
        return details
    
    def get_dashboard_html(self) -> str:
        """
        Get an HTML representation of the dashboard
        
        Returns:
            str: HTML representation of the dashboard
        """
        # Get the latest data
        summary = self.get_dashboard_summary()
        
        # Create a basic HTML representation
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Thread Pool Dashboard</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    margin: 20px;
                }}
                .dashboard {{
                    max-width: 1200px;
                    margin: 0 auto;
                }}
                .status-healthy {{
                    color: green;
                }}
                .status-degraded {{
                    color: orange;
                }}
                .status-critical {{
                    color: red;
                }}
                .panel {{
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 15px;
                    margin-bottom: 20px;
                }}
                .panel-header {{
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }}
                .pool-grid {{
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 15px;
                }}
                .pool-card {{
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 10px;
                }}
                .metric {{
                    margin-bottom: 5px;
                }}
                .metric-label {{
                    font-weight: bold;
                }}
                .issues-list {{
                    color: #d9534f;
                }}
                .recommendations-list {{
                    color: #5bc0de;
                }}
            </style>
        </head>
        <body>
            <div class="dashboard">
                <h1>Thread Pool Dashboard</h1>
                <div class="panel">
                    <div class="panel-header">System Status</div>
                    <div class="metric">
                        <span class="metric-label">Status:</span>
                        <span class="status-{summary['status']}">{summary['status'].upper()}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Worker Utilization:</span>
                        <span>{summary['utilization']:.2f}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Queue Depth:</span>
                        <span>{summary['queue_depth']}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Total Pools:</span>
                        <span>{len(summary['pools'])}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Uptime:</span>
                        <span>{summary['dashboard_status']['uptime']:.1f}s</span>
                    </div>
                    
                    {self._render_issues_html(summary['issues'])}
                    {self._render_recommendations_html(summary['recommendations'])}
                </div>
                
                <div class="panel">
                    <div class="panel-header">Pools</div>
                    <div class="pool-grid">
                        {self._render_pools_html(summary['pools'])}
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
    
    def _render_issues_html(self, issues: List[str]) -> str:
        """Render issues as HTML"""
        if not issues:
            return ""
        
        items = "\n".join([f"<li>{issue}</li>" for issue in issues])
        return f"""
        <div class="metric">
            <span class="metric-label">Issues:</span>
            <ul class="issues-list">
                {items}
            </ul>
        </div>
        """
    
    def _render_recommendations_html(self, recommendations: List[str]) -> str:
        """Render recommendations as HTML"""
        if not recommendations:
            return ""
        
        items = "\n".join([f"<li>{rec}</li>" for rec in recommendations])
        return f"""
        <div class="metric">
            <span class="metric-label">Recommendations:</span>
            <ul class="recommendations-list">
                {items}
            </ul>
        </div>
        """
    
    def _render_pools_html(self, pools: Dict[str, Any]) -> str:
        """Render pools as HTML"""
        if not pools:
            return "<div>No pools available</div>"
        
        pool_cards = []
        for pool_id, pool in pools.items():
            status_class = f"status-{pool['status']}"
            
            issues_html = ""
            if pool["issues"]:
                issues_items = "\n".join([f"<li>{issue}</li>" for issue in pool["issues"]])
                issues_html = f"""
                <div class="metric">
                    <span class="metric-label">Issues:</span>
                    <ul class="issues-list">
                        {issues_items}
                    </ul>
                </div>
                """
            
            recommendations_html = ""
            if pool["recommendations"]:
                rec_items = "\n".join([f"<li>{rec}</li>" for rec in pool["recommendations"]])
                recommendations_html = f"""
                <div class="metric">
                    <span class="metric-label">Recommendations:</span>
                    <ul class="recommendations-list">
                        {rec_items}
                    </ul>
                </div>
                """
            
            pool_card = f"""
            <div class="pool-card">
                <div class="metric">
                    <span class="metric-label">Pool ID:</span>
                    <span>{pool_id}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Status:</span>
                    <span class="{status_class}">{pool['status'].upper()}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Utilization:</span>
                    <span>{pool['utilization']:.2f}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Queue Depth:</span>
                    <span>{pool['queue_depth']}</span>
                </div>
                {issues_html}
                {recommendations_html}
            </div>
            """
            
            pool_cards.append(pool_card)
        
        return "\n".join(pool_cards)
    
    async def render_dashboard(self) -> None:
        """
        Render the dashboard to the console
        
        This is a simplified console-based dashboard for use in the CLI.
        """
        try:
            # Get current data
            summary = self.get_dashboard_summary()
            
            # Clear console
            os.system('cls' if os.name == 'nt' else 'clear')
            
            # Print header
            print("\n" + "=" * 80)
            print(f"THREAD POOL DASHBOARD - {time.strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 80)
            
            # Print system status
            status_color = '\033[92m' if summary['status'] == 'healthy' else '\033[93m' if summary['status'] == 'degraded' else '\033[91m'
            reset_color = '\033[0m'
            
            print(f"\nSystem Status: {status_color}{summary['status'].upper()}{reset_color}")
            print(f"Worker Utilization: {summary['utilization']:.2f}")
            print(f"Queue Depth: {summary['queue_depth']}")
            print(f"Total Pools: {len(summary['pools'])}")
            print(f"Uptime: {summary['dashboard_status']['uptime']:.1f}s")
            
            # Print issues
            if summary['issues']:
                print("\nIssues:")
                for issue in summary['issues']:
                    print(f"  - {issue}")
            
            # Print recommendations
            if summary['recommendations']:
                print("\nRecommendations:")
                for rec in summary['recommendations']:
                    print(f"  - {rec}")
            
            # Print pools
            print("\nPools:")
            print("-" * 80)
            
            for pool_id, pool in sorted(summary['pools'].items()):
                pool_status_color = '\033[92m' if pool['status'] == 'healthy' else '\033[93m' if pool['status'] == 'degraded' else '\033[91m'
                
                print(f"\n  Pool: {pool_id}")
                print(f"  Status: {pool_status_color}{pool['status'].upper()}{reset_color}")
                print(f"  Utilization: {pool['utilization']:.2f}")
                print(f"  Queue Depth: {pool['queue_depth']}")
                
                if pool['issues']:
                    print("  Issues:")
                    for issue in pool['issues']:
                        print(f"    - {issue}")
                
                if pool['recommendations']:
                    print("  Recommendations:")
                    for rec in pool['recommendations']:
                        print(f"    - {rec}")
                
                print("  " + "-" * 40)
            
            # Print footer
            print("\n" + "=" * 80)
            print(f"Updated: {time.strftime('%Y-%m-%d %H:%M:%S')} | Press Ctrl+C to exit")
            print("=" * 80 + "\n")
            
        except Exception as e:
            logger.error(f"Error rendering dashboard: {e}")
    
    async def test(self) -> Dict[str, Any]:
        """
        Run module tests
        
        Returns:
            Dict[str, Any]: Test results
        """
        logger.info("Testing Thread Pool Dashboard")
        
        test_results = {
            "success": False,
            "module": "thread_pool_dashboard",
            "steps": {},
            "diagnostics": {
                "config": self.config
            }
        }
        
        try:
            # Test 1: Start the dashboard
            if not self.running:
                self.start()
            
            test_results["steps"]["start_dashboard"] = {
                "success": self.running,
                "message": "Dashboard started successfully" if self.running else "Failed to start dashboard"
            }
            
            if not self.running:
                test_results["success"] = False
                return test_results
            
            # Test 2: Generate test data
            # Submit tasks to the thread pool manager to generate activity
            
            # Define test tasks
            def cpu_task(iterations):
                """CPU-intensive task"""
                result = 0
                for i in range(iterations):
                    result += i
                return result
            
            def io_task(sleep_time):
                """I/O-bound task"""
                time.sleep(sleep_time)
                return f"Slept for {sleep_time}s"
            
            futures = []
            
            # Submit tasks
            for i in range(5):
                task_id, future = self.thread_pool_manager.submit(
                    function=cpu_task,
                    iterations=50000,  # 50K iterations
                    task_type=TaskType.CPU,
                    priority=TaskPriority.NORMAL
                )
                futures.append(future)
            
            for i in range(5):
                task_id, future = self.thread_pool_manager.submit(
                    function=io_task,
                    sleep_time=0.1,
                    task_type=TaskType.IO,
                    priority=TaskPriority.HIGH
                )
                futures.append(future)
            
            # Wait for tasks to complete
            for future in futures:
                future.result()
            
            # Give the dashboard time to collect data
            await asyncio.sleep(self.config["update_interval"] * 2)
            
            # Test 3: Check metrics history
            metrics_history = self.get_metrics_history()
            
            test_results["steps"]["metrics_history"] = {
                "success": len(metrics_history) > 0,
                "message": f"Collected {len(metrics_history)} metrics samples" if metrics_history else "No metrics history collected"
            }
            
            # Test 4: Get dashboard summary
            summary = self.get_dashboard_summary()
            
            test_results["steps"]["dashboard_summary"] = {
                "success": "status" in summary and "pools" in summary,
                "message": "Generated dashboard summary" if "status" in summary else "Failed to generate dashboard summary"
            }
            
            test_results["diagnostics"]["summary"] = summary
            
            # Test 5: Test HTML generation
            html = self.get_dashboard_html()
            
            test_results["steps"]["html_generation"] = {
                "success": len(html) > 0,
                "message": f"Generated HTML dashboard ({len(html)} bytes)" if html else "Failed to generate HTML"
            }
            
            # Test 6: Test console rendering
            try:
                # We can't actually check the output, but we can make sure it doesn't crash
                await self.render_dashboard()
                
                test_results["steps"]["console_rendering"] = {
                    "success": True,
                    "message": "Rendered dashboard to console"
                }
            except Exception as e:
                test_results["steps"]["console_rendering"] = {
                    "success": False,
                    "message": f"Failed to render dashboard to console: {e}"
                }
            
            # Test 7: Stop the dashboard
            self.stop()
            
            test_results["steps"]["stop_dashboard"] = {
                "success": not self.running,
                "message": "Dashboard stopped successfully" if not self.running else "Failed to stop dashboard"
            }
            
            # Overall success
            test_results["success"] = all(step["success"] for step in test_results["steps"].values())
            
            return test_results
        
        except Exception as e:
            logger.error(f"Error in Thread Pool Dashboard test: {e}")
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results


# Example command-line dashboard
async def run_console_dashboard(duration=60):
    """
    Run the dashboard in the console for a specified duration
    
    Args:
        duration: Duration to run the dashboard in seconds
    """
    # Create a thread pool manager
    manager = ThreadPoolManager(metadata={"auto_create_pools": True})
    
    # Create a thread pool monitor
    monitor = ThreadPoolMonitor(
        thread_pool_manager=manager,
        metadata={
            "poll_interval": 1.0,
            "metrics_window": 30
        }
    )
    
    # Create a dashboard
    dashboard = ThreadPoolDashboard(
        thread_pool_manager=manager,
        thread_pool_monitor=monitor,
        metadata={
            "update_interval": 1.0
        }
    )
    
    try:
        # Start the dashboard
        dashboard.start()
        
        # Define test functions
        def cpu_task(iterations):
            """CPU-bound task"""
            result = 0
            for i in range(iterations):
                result += i
            return result
        
        def io_task(sleep_time):
            """I/O-bound task"""
            time.sleep(sleep_time)
            return f"Slept for {sleep_time}s"
        
        # Run the dashboard for the specified duration
        start_time = time.time()
        try:
            while time.time() - start_time < duration:
                # Submit a batch of tasks every 5 seconds
                if int(time.time() - start_time) % 5 == 0:
                    # Submit a mix of CPU and I/O tasks
                    for i in range(3):
                        manager.submit(
                            function=cpu_task,
                            iterations=500000,  # 500K iterations
                            task_type=TaskType.CPU,
                            priority=TaskPriority.NORMAL
                        )
                    
                    for i in range(3):
                        manager.submit(
                            function=io_task,
                            sleep_time=0.5,
                            task_type=TaskType.IO,
                            priority=TaskPriority.HIGH
                        )
                
                # Render the dashboard
                await dashboard.render_dashboard()
                
                # Wait for the next update
                await asyncio.sleep(1.0)
        
        except KeyboardInterrupt:
            print("\nDashboard stopped by user")
        
    finally:
        # Stop the dashboard
        dashboard.stop()
        
        # Stop the monitor
        monitor.stop()
        
        # Shutdown the thread pool manager
        manager.shutdown()


# Example usage
if __name__ == "__main__":
    import argparse
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Thread Pool Dashboard")
    parser.add_argument("--duration", type=int, default=60, help="Duration to run the dashboard in seconds")
    args = parser.parse_args()
    
    # Run the console dashboard
    asyncio.run(run_console_dashboard(duration=args.duration))