"""
Database Query System

This module provides a cross-database query system for hallucinate_app,
enabling seamless query planning, optimization, and execution across
different database systems (DuckDB, OrbitDB, and FireproofDB).

The system provides:
- Query planning and optimization
- Cross-database query execution
- Parallel query execution
- Query caching
- Performance metrics collection
- Thread pool integration
"""

import os
import sys
import json
import time
import uuid
import asyncio
import logging
import re
from typing import Dict, List, Any, Optional, Union, Tuple, Set
from enum import Enum, auto
import threading
from concurrent.futures import ThreadPoolExecutor


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatabaseType(Enum):
    """Enumeration of database types supported by the query system"""
    DUCKDB = auto()
    ORBITDB = auto()
    FIREPROOFDB = auto()


class QueryType(Enum):
    """Enumeration of query types supported by the query system"""
    SELECT = auto()
    INSERT = auto()
    UPDATE = auto()
    DELETE = auto()
    JOIN = auto()
    AGGREGATE = auto()
    CREATE = auto()
    DROP = auto()
    CUSTOM = auto()


class QueryFragment:
    """
    Represents a single query fragment in a query plan
    
    A fragment is a unit of work that can be executed against a specific
    database type. Fragments can have dependencies on other fragments.
    """
    
    def __init__(
        self,
        db_type: DatabaseType,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        query_type: Optional[QueryType] = None,
        fragment_id: Optional[str] = None,
        dependencies: Optional[List[str]] = None,
        estimated_cost: Optional[float] = None
    ):
        """Initialize a query fragment
        
        Args:
            db_type: The database type this fragment targets
            query: The query string or JSON representation
            params: Optional query parameters
            query_type: The type of query (auto-detected if not provided)
            fragment_id: Optional ID for this fragment (generated if not provided)
            dependencies: IDs of fragments this fragment depends on
            estimated_cost: Estimated cost of executing this fragment
        """
        self.db_type = db_type
        self.query = query
        self.params = params or {}
        self.fragment_id = fragment_id or str(uuid.uuid4())
        self.dependencies = dependencies or []
        self.estimated_cost = estimated_cost or 1.0
        self.status = "pending"
        self.result = None
        self.error = None
        self.execution_time = None
        
        # Auto-detect query type if not provided
        self.query_type = query_type or self._detect_query_type()
    
    def _detect_query_type(self) -> QueryType:
        """Auto-detect the query type based on the query string
        
        Returns:
            The detected query type
        """
        # For non-SQL databases, default to CUSTOM
        if self.db_type != DatabaseType.DUCKDB:
            return QueryType.CUSTOM
        
        # Simple regex-based detection for SQL queries
        query_upper = self.query.upper()
        
        if query_upper.startswith("SELECT"):
            return QueryType.SELECT
        elif query_upper.startswith("INSERT"):
            return QueryType.INSERT
        elif query_upper.startswith("UPDATE"):
            return QueryType.UPDATE
        elif query_upper.startswith("DELETE"):
            return QueryType.DELETE
        elif query_upper.startswith("CREATE"):
            return QueryType.CREATE
        elif query_upper.startswith("DROP"):
            return QueryType.DROP
        elif "JOIN" in query_upper:
            return QueryType.JOIN
        elif "GROUP BY" in query_upper:
            return QueryType.AGGREGATE
        else:
            return QueryType.CUSTOM
    
    async def execute(self, db_instance) -> Any:
        """Execute this fragment against the provided database instance
        
        Args:
            db_instance: The database instance to execute against
            
        Returns:
            The result of the execution
        """
        self.status = "running"
        start_time = time.time()
        
        try:
            # Execute based on database type
            if self.db_type == DatabaseType.DUCKDB:
                # DuckDB query execution
                result = await db_instance.execute_query(self.query, self.params)
            elif self.db_type == DatabaseType.ORBITDB:
                # OrbitDB query execution
                if isinstance(self.query, str):
                    try:
                        query_obj = json.loads(self.query)
                    except json.JSONDecodeError:
                        raise ValueError(f"Invalid JSON query for OrbitDB: {self.query}")
                else:
                    query_obj = self.query
                
                # Handle different OrbitDB operation types
                if "find" in query_obj and query_obj.get("find", False):
                    result = await db_instance.find(
                        collection=query_obj.get("collection", "default"),
                        query=query_obj.get("query", {})
                    )
                elif "get" in query_obj and query_obj.get("get", False):
                    result = await db_instance.get(
                        collection=query_obj.get("collection", "default"),
                        id=query_obj.get("id")
                    )
                elif "put" in query_obj and query_obj.get("put", False):
                    result = await db_instance.put(
                        collection=query_obj.get("collection", "default"),
                        doc=query_obj.get("doc", {})
                    )
                elif "delete" in query_obj and query_obj.get("delete", False):
                    result = await db_instance.delete(
                        collection=query_obj.get("collection", "default"),
                        id=query_obj.get("id")
                    )
                else:
                    # Default to custom query execution
                    result = await db_instance.query(query_obj)
            elif self.db_type == DatabaseType.FIREPROOFDB:
                # FireproofDB query execution
                if isinstance(self.query, str):
                    try:
                        query_obj = json.loads(self.query)
                    except json.JSONDecodeError:
                        raise ValueError(f"Invalid JSON query for FireproofDB: {self.query}")
                else:
                    query_obj = self.query
                
                # Handle different FireproofDB operation types
                if "find" in query_obj and query_obj.get("find", False):
                    result = await db_instance.find(
                        database=query_obj.get("database", "default"),
                        selector=query_obj.get("selector", {})
                    )
                elif "get" in query_obj and query_obj.get("get", False):
                    result = await db_instance.get(
                        database=query_obj.get("database", "default"),
                        id=query_obj.get("id")
                    )
                elif "put" in query_obj and query_obj.get("put", False):
                    result = await db_instance.put(
                        database=query_obj.get("database", "default"),
                        doc=query_obj.get("doc", {})
                    )
                elif "delete" in query_obj and query_obj.get("delete", False):
                    result = await db_instance.delete(
                        database=query_obj.get("database", "default"),
                        id=query_obj.get("id")
                    )
                else:
                    # Default to custom query execution
                    result = await db_instance.query(query_obj)
            else:
                raise ValueError(f"Unsupported database type: {self.db_type}")
            
            # Record results
            self.result = result
            self.status = "completed"
        except Exception as e:
            logger.error(f"Error executing fragment {self.fragment_id}: {str(e)}")
            self.error = str(e)
            self.status = "error"
            raise
        finally:
            self.execution_time = time.time() - start_time
        
        return self.result
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert this fragment to a dictionary representation
        
        Returns:
            Dictionary representation of this fragment
        """
        return {
            "fragment_id": self.fragment_id,
            "db_type": self.db_type.name,
            "query_type": self.query_type.name,
            "query": self.query,
            "params": self.params,
            "dependencies": self.dependencies,
            "estimated_cost": self.estimated_cost,
            "status": self.status,
            "execution_time": self.execution_time
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'QueryFragment':
        """Create a QueryFragment from a dictionary representation
        
        Args:
            data: Dictionary representation of a fragment
            
        Returns:
            A new QueryFragment instance
        """
        return cls(
            db_type=DatabaseType[data["db_type"]],
            query=data["query"],
            params=data.get("params", {}),
            query_type=QueryType[data["query_type"]],
            fragment_id=data["fragment_id"],
            dependencies=data.get("dependencies", []),
            estimated_cost=data.get("estimated_cost", 1.0)
        )


class QueryPlan:
    """
    Represents a complete query execution plan
    
    A plan consists of multiple query fragments with their dependencies,
    which can be executed serially or in parallel.
    """
    
    def __init__(self):
        """Initialize a query plan"""
        self.fragments = []
        self.plan_id = str(uuid.uuid4())
        self.status = "created"
        self.creation_time = time.time()
    
    def add_fragment(self, fragment: QueryFragment) -> None:
        """Add a fragment to this plan
        
        Args:
            fragment: The fragment to add
        """
        self.fragments.append(fragment)
    
    def get_fragment(self, fragment_id: str) -> Optional[QueryFragment]:
        """Get a fragment by ID
        
        Args:
            fragment_id: The ID of the fragment to retrieve
            
        Returns:
            The fragment if found, None otherwise
        """
        for fragment in self.fragments:
            if fragment.fragment_id == fragment_id:
                return fragment
        return None
    
    def get_execution_order(self) -> List[QueryFragment]:
        """Get fragments in dependency order for serial execution
        
        Returns:
            List of fragments in dependency order
            
        Raises:
            ValueError: If there is a cyclic dependency
        """
        # Build dependency graph
        graph = {f.fragment_id: set(f.dependencies) for f in self.fragments}
        
        # Check for cycles
        visited = set()
        temp_visited = set()
        
        def has_cycle(node):
            if node not in graph:
                return False
            
            if node in temp_visited:
                return True
            
            if node in visited:
                return False
            
            temp_visited.add(node)
            
            if any(has_cycle(dep) for dep in graph[node]):
                return True
            
            temp_visited.remove(node)
            visited.add(node)
            return False
        
        # Check for cycles
        for fragment_id in graph:
            if has_cycle(fragment_id):
                raise ValueError(f"Cyclic dependency detected in query plan {self.plan_id}")
        
        # Topological sort
        visited = set()
        result = []
        
        def dfs(node):
            if node in visited:
                return
            
            visited.add(node)
            
            for dep in graph.get(node, set()):
                dfs(dep)
            
            # Find the fragment
            fragment = self.get_fragment(node)
            if fragment:
                result.append(fragment)
        
        # Run DFS for each fragment
        for fragment in self.fragments:
            dfs(fragment.fragment_id)
        
        # Reverse to get correct order
        return list(reversed(result))
    
    def get_parallel_execution_batches(self) -> List[List[QueryFragment]]:
        """Get fragments grouped into parallel execution batches
        
        Returns:
            List of batches, where each batch is a list of fragments
            that can be executed in parallel
            
        Raises:
            ValueError: If there is a cyclic dependency
        """
        # Get execution order first to check for cycles
        ordered_fragments = self.get_execution_order()
        
        # Build dependency graph
        graph = {f.fragment_id: set(f.dependencies) for f in self.fragments}
        
        # Create reversed graph for finding dependencies
        reversed_graph = {}
        for fragment_id, deps in graph.items():
            for dep in deps:
                if dep not in reversed_graph:
                    reversed_graph[dep] = set()
                reversed_graph[dep].add(fragment_id)
        
        # Group fragments into batches
        batches = []
        remaining = set(f.fragment_id for f in self.fragments)
        
        while remaining:
            # Find nodes with no remaining dependencies
            ready = []
            for fragment in self.fragments:
                if fragment.fragment_id not in remaining:
                    continue
                
                if all(dep not in remaining for dep in fragment.dependencies):
                    ready.append(fragment)
            
            if not ready:
                # This should not happen if there are no cycles
                raise ValueError("Could not resolve fragment dependencies")
            
            # Add batch
            batches.append(ready)
            
            # Remove processed nodes
            for fragment in ready:
                remaining.remove(fragment.fragment_id)
        
        return batches
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert this plan to a dictionary representation
        
        Returns:
            Dictionary representation of this plan
        """
        return {
            "plan_id": self.plan_id,
            "status": self.status,
            "creation_time": self.creation_time,
            "fragments": [f.to_dict() for f in self.fragments]
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'QueryPlan':
        """Create a QueryPlan from a dictionary representation
        
        Args:
            data: Dictionary representation of a plan
            
        Returns:
            A new QueryPlan instance
        """
        plan = cls()
        plan.plan_id = data["plan_id"]
        plan.status = data["status"]
        plan.creation_time = data["creation_time"]
        
        for fragment_data in data["fragments"]:
            plan.add_fragment(QueryFragment.from_dict(fragment_data))
        
        return plan


class QueryOptimizer:
    """
    Basic query optimizer that applies simple optimizations to query plans
    
    This optimizer can reorder fragments, merge compatible fragments,
    and assign estimated costs based on table statistics.
    """
    
    def __init__(self, statistics: Optional[Dict[str, Any]] = None):
        """Initialize the optimizer
        
        Args:
            statistics: Optional database statistics for cost estimation
        """
        self.statistics = statistics or {}
    
    def optimize(self, plan: QueryPlan) -> QueryPlan:
        """Optimize a query plan
        
        Args:
            plan: The plan to optimize
            
        Returns:
            The optimized plan
        """
        # Create a copy of the plan
        optimized_plan = QueryPlan()
        optimized_plan.plan_id = plan.plan_id
        
        # Copy and optimize each fragment
        for fragment in plan.fragments:
            optimized_fragment = self._optimize_fragment(fragment)
            optimized_plan.add_fragment(optimized_fragment)
        
        # Return the optimized plan
        return optimized_plan
    
    def _optimize_fragment(self, fragment: QueryFragment) -> QueryFragment:
        """Apply optimizations to a single fragment
        
        Args:
            fragment: The fragment to optimize
            
        Returns:
            The optimized fragment
        """
        # Create a copy of the fragment
        optimized = QueryFragment(
            db_type=fragment.db_type,
            query=fragment.query,
            params=fragment.params.copy() if fragment.params else {},
            query_type=fragment.query_type,
            fragment_id=fragment.fragment_id,
            dependencies=fragment.dependencies.copy() if fragment.dependencies else [],
            estimated_cost=fragment.estimated_cost
        )
        
        # Update cost based on table statistics
        optimized.estimated_cost = self._estimate_cost(optimized)
        
        # Return the optimized fragment
        return optimized
    
    def _estimate_cost(self, fragment: QueryFragment) -> float:
        """Estimate the cost of executing a fragment
        
        Args:
            fragment: The fragment to estimate cost for
            
        Returns:
            The estimated cost
        """
        # Default cost
        cost = 1.0
        
        # Adjust based on database type
        if fragment.db_type == DatabaseType.DUCKDB:
            # Analyze SQL query to determine tables and predicates
            query = fragment.query.upper()
            tables = re.findall(r'FROM\s+(\w+)', query)
            
            # Adjust cost based on table sizes
            for table in tables:
                if table in self.statistics.get("tables", {}):
                    table_stats = self.statistics["tables"][table]
                    # Use row count as a factor in cost
                    cost += table_stats.get("row_count", 1000) / 1000.0
            
            # Adjust based on query type
            if fragment.query_type == QueryType.SELECT:
                if "JOIN" in query:
                    # Joins are more expensive
                    cost *= 2.0
                if "WHERE" in query:
                    # WHERE clauses reduce cost (more selective)
                    cost *= 0.8
                if "GROUP BY" in query:
                    # Aggregations are expensive
                    cost *= 1.5
            elif fragment.query_type == QueryType.INSERT:
                # Inserts have moderate cost
                cost *= 1.2
            elif fragment.query_type == QueryType.UPDATE:
                # Updates are more expensive
                cost *= 1.5
            elif fragment.query_type == QueryType.DELETE:
                # Deletes have moderate cost
                cost *= 1.2
        elif fragment.db_type == DatabaseType.ORBITDB:
            # Assume OrbitDB operations have higher base cost
            cost *= 1.5
        elif fragment.db_type == DatabaseType.FIREPROOFDB:
            # Assume FireproofDB operations have higher base cost
            cost *= 1.5
        
        return cost
    
    async def test(self) -> Dict[str, Any]:
        """Run self-test on the optimizer
        
        Returns:
            Dictionary with test results
        """
        # Create a test plan
        plan = QueryPlan()
        
        # Add a simple fragment
        fragment = QueryFragment(
            db_type=DatabaseType.DUCKDB,
            query="SELECT * FROM test WHERE id > 100"
        )
        plan.add_fragment(fragment)
        
        # Optimize the plan
        optimized_plan = self.optimize(plan)
        
        # Return test results
        return {
            "success": True,
            "components": {
                "optimizer": "QueryOptimizer",
                "statistics": bool(self.statistics)
            },
            "plan": {
                "original": plan.to_dict(),
                "optimized": optimized_plan.to_dict()
            }
        }


class QueryCache:
    """
    Cache for query results to improve performance for repeated queries
    
    The cache stores query results with an expiration time (TTL) and
    limited capacity (max size).
    """
    
    def __init__(self, max_size: int = 100, ttl: int = 300):
        """Initialize the cache
        
        Args:
            max_size: Maximum number of entries in the cache
            ttl: Time-to-live for cache entries in seconds
        """
        self.max_size = max_size
        self.ttl = ttl
        self.cache = {}
        self.expiration = {}
        self.lock = threading.RLock()
    
    def get(self, query: str, params: Optional[Dict[str, Any]] = None) -> Optional[Any]:
        """Get a result from the cache
        
        Args:
            query: The query string
            params: The query parameters
            
        Returns:
            The cached result if available and not expired, None otherwise
        """
        with self.lock:
            # Create cache key
            cache_key = self._create_key(query, params)
            
            # Check if entry exists and is still valid
            if cache_key in self.cache:
                expiration = self.expiration.get(cache_key, 0)
                if time.time() < expiration:
                    return self.cache[cache_key]
                else:
                    # Entry expired
                    del self.cache[cache_key]
                    del self.expiration[cache_key]
            
            return None
    
    def put(self, query: str, params: Optional[Dict[str, Any]], result: Any) -> None:
        """Store a result in the cache
        
        Args:
            query: The query string
            params: The query parameters
            result: The result to cache
        """
        with self.lock:
            # Create cache key
            cache_key = self._create_key(query, params)
            
            # Store result and expiration
            self.cache[cache_key] = result
            self.expiration[cache_key] = time.time() + self.ttl
            
            # Enforce max size limit
            if len(self.cache) > self.max_size:
                # Remove oldest entries (based on expiration time)
                oldest = sorted(self.expiration.items(), key=lambda x: x[1])
                for old_key, _ in oldest[:len(self.cache) - self.max_size]:
                    del self.cache[old_key]
                    del self.expiration[old_key]
    
    def invalidate(self, table_name: str) -> None:
        """Invalidate all cache entries related to a specific table
        
        Args:
            table_name: The name of the table to invalidate
        """
        with self.lock:
            # Find keys that might contain the table name
            keys_to_remove = []
            for key in self.cache.keys():
                if table_name in key:
                    keys_to_remove.append(key)
            
            # Remove matching entries
            for key in keys_to_remove:
                del self.cache[key]
                del self.expiration[key]
    
    def clear(self) -> None:
        """Clear the entire cache"""
        with self.lock:
            self.cache.clear()
            self.expiration.clear()
    
    def _create_key(self, query: str, params: Optional[Dict[str, Any]] = None) -> str:
        """Create a cache key from a query and parameters
        
        Args:
            query: The query string
            params: The query parameters
            
        Returns:
            A string key for cache lookups
        """
        if params:
            # Convert params to a stable string representation
            params_str = json.dumps(params, sort_keys=True)
            return f"{query}:{params_str}"
        else:
            return query


class QueryPerformanceMetrics:
    """
    Collects and analyzes query performance metrics
    
    Tracks execution times, slow queries, query errors, and provides
    aggregated statistics by query type and database type.
    """
    
    def __init__(self, window_size: int = 1000):
        """Initialize the metrics collector
        
        Args:
            window_size: Maximum number of queries to track
        """
        self.window_size = window_size
        self.queries = []
        self.slow_threshold = 1.0  # Queries taking longer than 1 second
        self.lock = threading.RLock()
    
    def record_query(
        self,
        query: str,
        params: Optional[Dict[str, Any]],
        execution_time: float,
        query_type: QueryType,
        db_type: DatabaseType,
        error: Optional[Exception] = None
    ) -> None:
        """Record metrics for a query execution
        
        Args:
            query: The query string
            params: The query parameters
            execution_time: The time taken to execute the query in seconds
            query_type: The type of query
            db_type: The database type
            error: Optional exception if the query resulted in an error
        """
        with self.lock:
            # Create metric entry
            entry = {
                "query": query,
                "params": params,
                "execution_time": execution_time,
                "query_type": query_type.name,
                "db_type": db_type.name,
                "timestamp": time.time(),
                "error": str(error) if error else None
            }
            
            # Add to queries list
            self.queries.append(entry)
            
            # Enforce window size limit
            if len(self.queries) > self.window_size:
                self.queries = self.queries[-self.window_size:]
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get aggregated metrics
        
        Returns:
            Dictionary with metrics by category
        """
        with self.lock:
            # Filter queries within window
            queries = self.queries[-self.window_size:]
            
            # Calculate overall metrics
            if queries:
                avg_time = sum(q["execution_time"] for q in queries) / len(queries)
            else:
                avg_time = 0
            
            # Metrics by query type
            by_query_type = {}
            for q in queries:
                query_type = q["query_type"]
                if query_type not in by_query_type:
                    by_query_type[query_type] = {
                        "count": 0,
                        "total_time": 0,
                        "avg_time": 0,
                        "max_time": 0
                    }
                
                by_query_type[query_type]["count"] += 1
                by_query_type[query_type]["total_time"] += q["execution_time"]
                by_query_type[query_type]["max_time"] = max(
                    by_query_type[query_type]["max_time"],
                    q["execution_time"]
                )
            
            # Calculate averages
            for stats in by_query_type.values():
                if stats["count"] > 0:
                    stats["avg_time"] = stats["total_time"] / stats["count"]
            
            # Metrics by database type
            by_db_type = {}
            for q in queries:
                db_type = q["db_type"]
                if db_type not in by_db_type:
                    by_db_type[db_type] = {
                        "count": 0,
                        "total_time": 0,
                        "avg_time": 0,
                        "max_time": 0
                    }
                
                by_db_type[db_type]["count"] += 1
                by_db_type[db_type]["total_time"] += q["execution_time"]
                by_db_type[db_type]["max_time"] = max(
                    by_db_type[db_type]["max_time"],
                    q["execution_time"]
                )
            
            # Calculate averages
            for stats in by_db_type.values():
                if stats["count"] > 0:
                    stats["avg_time"] = stats["total_time"] / stats["count"]
            
            # Find slow queries
            slow_queries = [
                q for q in queries
                if q["execution_time"] > self.slow_threshold
            ]
            
            # Find error queries
            error_queries = [
                q for q in queries
                if q["error"] is not None
            ]
            
            # Return aggregated metrics
            return {
                "overall": {
                    "count": len(queries),
                    "avg_time": avg_time
                },
                "by_query_type": by_query_type,
                "by_db_type": by_db_type,
                "slow_queries": slow_queries,
                "error_queries": error_queries
            }
    
    def get_slow_queries(self) -> List[Dict[str, Any]]:
        """Get a list of slow queries
        
        Returns:
            List of query entries that exceeded the slow threshold
        """
        with self.lock:
            return [
                q for q in self.queries
                if q["execution_time"] > self.slow_threshold
            ]
    
    def get_error_queries(self) -> List[Dict[str, Any]]:
        """Get a list of queries that resulted in errors
        
        Returns:
            List of query entries that had errors
        """
        with self.lock:
            return [
                q for q in self.queries
                if q["error"] is not None
            ]


class DatabaseQuerySystem:
    """
    Main query system that provides cross-database query capabilities
    
    Coordinates query planning, optimization, execution, and caching
    across different database systems.
    """
    
    def __init__(
        self,
        resources: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Initialize the query system
        
        Args:
            resources: Dictionary of available resources including database instances
            metadata: Optional configuration metadata
        """
        self.resources = resources
        self.metadata = metadata or {}
        
        # Extract database instances
        self.duckdb = resources.get("duckdb")
        self.orbit_db = resources.get("orbit_db")
        self.fireproof_db = resources.get("fireproof_db")
        
        # Get thread pool if available
        self.thread_pool = resources.get("thread_pool")
        self.uses_thread_pool = self.thread_pool is not None
        
        # Configure components based on metadata
        cache_size = self.metadata.get("cache_size", 100)
        cache_ttl = self.metadata.get("cache_ttl", 300)
        self.use_caching = self.metadata.get("enable_caching", True)
        
        if self.use_caching:
            self.cache = QueryCache(max_size=cache_size, ttl=cache_ttl)
        else:
            self.cache = None
        
        # Create optimizer with available statistics
        self.use_optimization = self.metadata.get("enable_optimization", True)
        if self.use_optimization:
            # Get statistics if available
            statistics = self.resources.get("statistics", {})
            self.optimizer = QueryOptimizer(statistics=statistics)
        else:
            self.optimizer = None
        
        # Configure metrics
        self.collect_metrics = self.metadata.get("collect_metrics", True)
        if self.collect_metrics:
            self.metrics = QueryPerformanceMetrics(
                window_size=self.metadata.get("metrics_window_size", 1000)
            )
        else:
            self.metrics = None
        
        # Parallel execution configuration
        self.parallel_execution = self.metadata.get("parallel_execution", True)
        self.max_concurrent = self.metadata.get("max_concurrent_queries", 5)
        
        # Database mapping
        self.db_mapping = {
            DatabaseType.DUCKDB: self.duckdb,
            DatabaseType.ORBITDB: self.orbit_db,
            DatabaseType.FIREPROOFDB: self.fireproof_db
        }
        
        # Initialize stats update mechanism
        self.stats_update_interval = self.metadata.get("stats_update_interval", 3600)
        self.last_stats_update = time.time()
        self.statistics = {}
    
    def plan_query(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        target_db: Optional[DatabaseType] = None
    ) -> QueryPlan:
        """Create a query plan for a given query
        
        Args:
            query: The query string or JSON representation
            params: Optional query parameters
            target_db: Optional target database type
            
        Returns:
            A query plan for the query
        """
        # Create a new plan
        plan = QueryPlan()
        
        # If target DB is specified, create a simple plan
        if target_db:
            fragment = QueryFragment(
                db_type=target_db,
                query=query,
                params=params
            )
            plan.add_fragment(fragment)
            return plan
        
        # Auto-detect target database
        if query.strip().startswith("{") and query.strip().endswith("}"):
            # Looks like JSON, try to parse
            try:
                query_obj = json.loads(query)
                
                # Check for OrbitDB-specific fields
                if "collection" in query_obj:
                    target_db = DatabaseType.ORBITDB
                # Check for FireproofDB-specific fields
                elif "selector" in query_obj or "database" in query_obj:
                    target_db = DatabaseType.FIREPROOFDB
                else:
                    # Default to DuckDB for unexpected JSON
                    target_db = DatabaseType.DUCKDB
            except json.JSONDecodeError:
                # Not valid JSON, assume SQL for DuckDB
                target_db = DatabaseType.DUCKDB
        else:
            # Assume SQL for DuckDB
            target_db = DatabaseType.DUCKDB
        
        # Create fragment with detected database type
        fragment = QueryFragment(
            db_type=target_db,
            query=query,
            params=params
        )
        plan.add_fragment(fragment)
        
        # Optimize if enabled
        if self.use_optimization and self.optimizer:
            plan = self.optimizer.optimize(plan)
        
        return plan
    
    async def execute_query(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        target_db: Optional[DatabaseType] = None,
        use_cache: Optional[bool] = None
    ) -> Any:
        """Execute a query
        
        Args:
            query: The query string or JSON representation
            params: Optional query parameters
            target_db: Optional target database type
            use_cache: Override default cache behavior
            
        Returns:
            The query result
        """
        # Check cache if enabled
        should_cache = use_cache if use_cache is not None else self.use_caching
        if should_cache and self.cache:
            cached_result = self.cache.get(query, params)
            if cached_result is not None:
                return cached_result
        
        # Create plan
        plan = self.plan_query(query, params, target_db)
        
        # Execute plan
        try:
            if self.parallel_execution and len(plan.fragments) > 1:
                result = await self._execute_plan_parallel(plan)
            else:
                result = await self._execute_plan_serial(plan)
            
            # Cache result if caching is enabled
            if should_cache and self.cache and self._is_cacheable(plan):
                self.cache.put(query, params, result)
            
            return result
        except Exception as e:
            logger.error(f"Error executing query: {str(e)}")
            # Record error in metrics if enabled
            if self.collect_metrics and self.metrics:
                db_type = target_db or self._detect_db_type(query)
                query_type = self._detect_query_type(query, db_type)
                self.metrics.record_query(
                    query=query,
                    params=params,
                    execution_time=0.0,
                    query_type=query_type,
                    db_type=db_type,
                    error=e
                )
            
            # Re-raise with more context
            raise ValueError(f"Query execution failed: {str(e)}") from e
    
    def _is_cacheable(self, plan: QueryPlan) -> bool:
        """Check if a plan's results can be cached
        
        Args:
            plan: The query plan
            
        Returns:
            True if the plan is cacheable, False otherwise
        """
        # Only cache read-only operations
        read_only_types = {QueryType.SELECT, QueryType.AGGREGATE}
        return all(f.query_type in read_only_types for f in plan.fragments)
    
    def _detect_db_type(self, query: str) -> DatabaseType:
        """Detect the database type for a query
        
        Args:
            query: The query string
            
        Returns:
            The detected database type
        """
        if query.strip().startswith("{") and query.strip().endswith("}"):
            # Looks like JSON, try to parse
            try:
                query_obj = json.loads(query)
                
                # Check for OrbitDB-specific fields
                if "collection" in query_obj:
                    return DatabaseType.ORBITDB
                # Check for FireproofDB-specific fields
                elif "selector" in query_obj or "database" in query_obj:
                    return DatabaseType.FIREPROOFDB
                else:
                    # Default to DuckDB for unexpected JSON
                    return DatabaseType.DUCKDB
            except json.JSONDecodeError:
                # Not valid JSON, assume SQL for DuckDB
                return DatabaseType.DUCKDB
        else:
            # Assume SQL for DuckDB
            return DatabaseType.DUCKDB
    
    def _detect_query_type(self, query: str, db_type: DatabaseType) -> QueryType:
        """Detect the query type
        
        Args:
            query: The query string
            db_type: The database type
            
        Returns:
            The detected query type
        """
        if db_type == DatabaseType.DUCKDB:
            # Simple regex-based detection for SQL queries
            query_upper = query.upper()
            
            if query_upper.startswith("SELECT"):
                return QueryType.SELECT
            elif query_upper.startswith("INSERT"):
                return QueryType.INSERT
            elif query_upper.startswith("UPDATE"):
                return QueryType.UPDATE
            elif query_upper.startswith("DELETE"):
                return QueryType.DELETE
            elif query_upper.startswith("CREATE"):
                return QueryType.CREATE
            elif query_upper.startswith("DROP"):
                return QueryType.DROP
            elif "JOIN" in query_upper:
                return QueryType.JOIN
            elif "GROUP BY" in query_upper:
                return QueryType.AGGREGATE
            else:
                return QueryType.CUSTOM
        else:
            # For OrbitDB and FireproofDB, try to detect based on JSON
            if query.strip().startswith("{") and query.strip().endswith("}"):
                try:
                    query_obj = json.loads(query)
                    if "find" in query_obj or "get" in query_obj:
                        return QueryType.SELECT
                    elif "put" in query_obj:
                        return QueryType.INSERT
                    elif "delete" in query_obj:
                        return QueryType.DELETE
                    else:
                        return QueryType.CUSTOM
                except json.JSONDecodeError:
                    return QueryType.CUSTOM
            
            return QueryType.CUSTOM
    
    async def _execute_plan_serial(self, plan: QueryPlan) -> Any:
        """Execute a plan serially
        
        Args:
            plan: The query plan
            
        Returns:
            The result of the last fragment in the plan
        """
        # Get execution order
        fragments = plan.get_execution_order()
        
        # Track intermediate results
        results = {}
        
        # Execute fragments in order
        for fragment in fragments:
            # Get the database instance
            db = self.db_mapping.get(fragment.db_type)
            if not db:
                raise ValueError(f"No database instance for type {fragment.db_type}")
            
            start_time = time.time()
            
            try:
                # Execute fragment
                result = await fragment.execute(db)
                
                # Store result
                results[fragment.fragment_id] = result
                
                # Record success in metrics
                if self.collect_metrics and self.metrics:
                    self.metrics.record_query(
                        query=fragment.query,
                        params=fragment.params,
                        execution_time=time.time() - start_time,
                        query_type=fragment.query_type,
                        db_type=fragment.db_type
                    )
            except Exception as e:
                logger.error(f"Error executing fragment {fragment.fragment_id}: {str(e)}")
                
                # Record error in metrics
                if self.collect_metrics and self.metrics:
                    self.metrics.record_query(
                        query=fragment.query,
                        params=fragment.params,
                        execution_time=time.time() - start_time,
                        query_type=fragment.query_type,
                        db_type=fragment.db_type,
                        error=e
                    )
                
                # Re-raise with more context
                raise ValueError(f"Fragment execution failed: {str(e)}") from e
        
        # Return the result of the last fragment
        if fragments:
            return results[fragments[-1].fragment_id]
        else:
            return None
    
    async def _execute_plan_parallel(self, plan: QueryPlan) -> Any:
        """Execute a plan with parallel execution where possible
        
        Args:
            plan: The query plan
            
        Returns:
            The result of the last fragment in the plan
        """
        # Get parallel execution batches
        batches = plan.get_parallel_execution_batches()
        
        # Track intermediate results
        results = {}
        
        # Process batches in order
        for batch in batches:
            # For each batch, execute fragments in parallel
            tasks = []
            
            # Create asyncio tasks for each fragment
            for fragment in batch:
                # Get the database instance
                db = self.db_mapping.get(fragment.db_type)
                if not db:
                    raise ValueError(f"No database instance for type {fragment.db_type}")
                
                # Create execute task
                tasks.append(self._execute_fragment(fragment, db, results))
            
            # Wait for all tasks in this batch to complete
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check for any exceptions
            for fragment, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.error(f"Error executing fragment {fragment.fragment_id}: {str(result)}")
                    raise result
                
                # Store result
                results[fragment.fragment_id] = result
        
        # Return the result of the last batch's last fragment
        if batches and batches[-1]:
            return results[batches[-1][-1].fragment_id]
        else:
            return None
    
    async def _execute_fragment(
        self,
        fragment: QueryFragment,
        db: Any,
        intermediate_results: Dict[str, Any]
    ) -> Any:
        """Execute a single fragment
        
        Args:
            fragment: The fragment to execute
            db: The database instance
            intermediate_results: Dictionary of results from previous fragments
            
        Returns:
            The result of executing the fragment
        """
        start_time = time.time()
        
        try:
            # Execute fragment
            result = await fragment.execute(db)
            
            # Record success in metrics
            if self.collect_metrics and self.metrics:
                self.metrics.record_query(
                    query=fragment.query,
                    params=fragment.params,
                    execution_time=time.time() - start_time,
                    query_type=fragment.query_type,
                    db_type=fragment.db_type
                )
            
            return result
        except Exception as e:
            logger.error(f"Error executing fragment {fragment.fragment_id}: {str(e)}")
            
            # Record error in metrics
            if self.collect_metrics and self.metrics:
                self.metrics.record_query(
                    query=fragment.query,
                    params=fragment.params,
                    execution_time=time.time() - start_time,
                    query_type=fragment.query_type,
                    db_type=fragment.db_type,
                    error=e
                )
            
            # Re-raise
            raise
    
    def clear_cache(self) -> None:
        """Clear the query cache"""
        if self.use_caching and self.cache:
            self.cache.clear()
    
    def invalidate_cache(self, table_name: str) -> None:
        """Invalidate cache entries for a specific table
        
        Args:
            table_name: The name of the table to invalidate
        """
        if self.use_caching and self.cache:
            self.cache.invalidate(table_name)
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get query performance metrics
        
        Returns:
            Dictionary with performance metrics
        """
        if self.collect_metrics and self.metrics:
            return self.metrics.get_metrics()
        else:
            return {
                "error": "Metrics collection is disabled"
            }
    
    async def get_database_stats(self) -> Dict[str, Any]:
        """Get database statistics
        
        Returns:
            Dictionary with database statistics
        """
        # Check if we need to update statistics
        current_time = time.time()
        if current_time - self.last_stats_update > self.stats_update_interval:
            await self._update_statistics()
            self.last_stats_update = current_time
        
        return self.statistics
    
    async def _update_statistics(self) -> None:
        """Update database statistics"""
        stats = {
            "duckdb": {},
            "orbitdb": {},
            "fireproofdb": {}
        }
        
        # DuckDB statistics
        if self.duckdb:
            try:
                # Get table names
                tables = await self.duckdb.execute_query("SELECT name FROM sqlite_master WHERE type='table'")
                
                # Initialize table info
                stats["duckdb"]["table_count"] = len(tables)
                stats["duckdb"]["tables"] = {}
                
                # Get information for each table
                for table_name, in tables:
                    # Get column info
                    columns = await self.duckdb.execute_query(f"PRAGMA table_info({table_name})")
                    
                    # Process column info
                    column_info = []
                    for cid, name, type_name, notnull, dflt_value, pk in columns:
                        column_info.append({
                            "name": name,
                            "type": type_name,
                            "nullable": not notnull,
                            "default": dflt_value,
                            "primary_key": bool(pk)
                        })
                    
                    # Get approximate row count
                    row_count_result = await self.duckdb.execute_query(f"SELECT COUNT(*) FROM {table_name}")
                    row_count = row_count_result[0][0] if row_count_result else 0
                    
                    # Store table info
                    stats["duckdb"]["tables"][table_name] = {
                        "row_count": row_count,
                        "columns": column_info
                    }
            except Exception as e:
                logger.error(f"Error getting DuckDB statistics: {str(e)}")
                stats["duckdb"]["error"] = str(e)
        
        # OrbitDB statistics
        if self.orbit_db:
            try:
                # Get collections
                collections = await self.orbit_db.list_databases()
                
                # Initialize collection info
                stats["orbitdb"]["collection_count"] = len(collections)
                stats["orbitdb"]["collections"] = {}
                
                # Get information for each collection
                for collection in collections:
                    # Get approximate document count
                    documents = await self.orbit_db.find(collection=collection, query={})
                    
                    # Store collection info
                    stats["orbitdb"]["collections"][collection] = {
                        "document_count": len(documents)
                    }
            except Exception as e:
                logger.error(f"Error getting OrbitDB statistics: {str(e)}")
                stats["orbitdb"]["error"] = str(e)
        
        # FireproofDB statistics
        if self.fireproof_db:
            try:
                # Get databases
                databases = await self.fireproof_db.list_databases()
                
                # Initialize database info
                stats["fireproofdb"]["database_count"] = len(databases)
                stats["fireproofdb"]["databases"] = {}
                
                # Get information for each database
                for database in databases:
                    # Get approximate document count
                    result = await self.fireproof_db.find(database=database, selector={})
                    
                    # Store database info
                    stats["fireproofdb"]["databases"][database] = {
                        "document_count": len(result.get("docs", []))
                    }
            except Exception as e:
                logger.error(f"Error getting FireproofDB statistics: {str(e)}")
                stats["fireproofdb"]["error"] = str(e)
        
        # Update statistics
        self.statistics = stats
        
        # Update optimizer if available
        if self.use_optimization and self.optimizer:
            # Convert to optimizer's expected format
            optimizer_stats = {
                "tables": {}
            }
            
            # Add DuckDB tables
            if "tables" in stats["duckdb"]:
                for table_name, table_info in stats["duckdb"]["tables"].items():
                    optimizer_stats["tables"][table_name] = {
                        "row_count": table_info["row_count"],
                        "columns": table_info["columns"]
                    }
            
            # Update optimizer
            self.optimizer.statistics = optimizer_stats
    
    async def test(self) -> Dict[str, Any]:
        """Run self-test on the query system
        
        Returns:
            Dictionary with test results
        """
        test_results = {
            "success": True,
            "module": "database_query_system",
            "tests": {}
        }
        
        # Test basic initialization
        test_results["tests"]["initialization"] = {
            "success": True,
            "duckdb_available": self.duckdb is not None,
            "orbitdb_available": self.orbit_db is not None,
            "fireproofdb_available": self.fireproof_db is not None,
            "thread_pool_available": self.thread_pool is not None,
            "caching_enabled": self.use_caching,
            "optimization_enabled": self.use_optimization,
            "metrics_enabled": self.collect_metrics
        }
        
        # Test query planning
        try:
            plan = self.plan_query("SELECT 1")
            test_results["tests"]["query_planning"] = {
                "success": True,
                "plan_created": plan is not None,
                "fragment_count": len(plan.fragments)
            }
        except Exception as e:
            test_results["success"] = False
            test_results["tests"]["query_planning"] = {
                "success": False,
                "error": str(e)
            }
        
        # Test cache if enabled
        if self.use_caching and self.cache:
            try:
                # Put a test entry
                self.cache.put("TEST_QUERY", None, "TEST_RESULT")
                
                # Get the entry
                result = self.cache.get("TEST_QUERY", None)
                
                # Clear the entry
                self.cache.clear()
                
                test_results["tests"]["caching"] = {
                    "success": result == "TEST_RESULT",
                    "cache_hit": result is not None
                }
            except Exception as e:
                test_results["success"] = False
                test_results["tests"]["caching"] = {
                    "success": False,
                    "error": str(e)
                }
        
        # Test metrics if enabled
        if self.collect_metrics and self.metrics:
            try:
                # Record a test query
                self.metrics.record_query(
                    query="TEST_QUERY",
                    params=None,
                    execution_time=0.1,
                    query_type=QueryType.SELECT,
                    db_type=DatabaseType.DUCKDB
                )
                
                # Get metrics
                metrics = self.metrics.get_metrics()
                
                test_results["tests"]["metrics"] = {
                    "success": metrics is not None,
                    "query_count": metrics["overall"]["count"]
                }
            except Exception as e:
                test_results["success"] = False
                test_results["tests"]["metrics"] = {
                    "success": False,
                    "error": str(e)
                }
        
        # Test optimizer if enabled
        if self.use_optimization and self.optimizer:
            try:
                # Get optimizer test results
                optimizer_results = await self.optimizer.test()
                
                test_results["tests"]["optimizer"] = {
                    "success": optimizer_results["success"],
                    "components": optimizer_results["components"]
                }
            except Exception as e:
                test_results["success"] = False
                test_results["tests"]["optimizer"] = {
                    "success": False,
                    "error": str(e)
                }
        
        return test_results


# Module initialization function
def init(resources: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None) -> DatabaseQuerySystem:
    """Initialize the database query system
    
    Args:
        resources: Dictionary of available resources
        metadata: Optional configuration metadata
        
    Returns:
        An initialized DatabaseQuerySystem instance
    """
    return DatabaseQuerySystem(resources, metadata)