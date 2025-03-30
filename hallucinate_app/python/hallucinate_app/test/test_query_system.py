"""
Simple test for the database query system and advanced query optimizer

This script creates mock database instances, initializes the query system,
and runs some basic tests to verify the implementation.
"""

import os
import sys
import json
import asyncio
import time
import uuid
from typing import Dict, List, Any, Optional, Union, Tuple, Set

# Add parent directory to path
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import the modules to test
try:
    # Try relative import first
    from ..database_query_system import (
        DatabaseQuerySystem,
        QueryPlan,
        QueryFragment,
        DatabaseType,
        QueryType,
        QueryCache,
        QueryPerformanceMetrics
    )
    
    from ..advanced_query_optimizer import (
        AdvancedQueryOptimizer,
        OptimizationLevel,
        QueryAnalyzer
    )
except ImportError:
    # Try direct import
    from database_query_system import (
        DatabaseQuerySystem,
        QueryPlan,
        QueryFragment,
        DatabaseType,
        QueryType,
        QueryCache,
        QueryPerformanceMetrics
    )
    
    from advanced_query_optimizer import (
        AdvancedQueryOptimizer,
        OptimizationLevel,
        QueryAnalyzer
    )


# Mock database classes
class MockDuckDB:
    """Mock DuckDB implementation for testing"""
    
    def __init__(self):
        self.tables = {}
        self.queries = []
    
    async def execute_query(self, query, parameters=None):
        """Execute a query on the mock database"""
        self.queries.append((query, parameters))
        
        if query == "SELECT 1":
            return [(1,)]
        elif query.startswith("CREATE TABLE"):
            table_name = query.split("(")[0].split("TABLE")[1].strip().split(" ")[-1]
            self.tables[table_name] = []
            return []
        elif query.startswith("INSERT INTO"):
            # Extract table and values
            parts = query.split("VALUES")
            table_name = parts[0].split("INTO")[1].strip()
            values_str = parts[1].strip("() ")
            
            # Parse values (simplistic approach)
            values = []
            for value_set in values_str.split("),"):
                cleaned = value_set.strip("() ")
                value_items = [v.strip("'\"") for v in cleaned.split(",")]
                values.append(tuple(value_items))
            
            if table_name not in self.tables:
                self.tables[table_name] = []
            
            self.tables[table_name].extend(values)
            return []
        elif query.startswith("SELECT * FROM"):
            # Extract table and condition
            table_name = query.split("FROM")[1].split("WHERE")[0].strip()
            
            if "WHERE" in query:
                condition = query.split("WHERE")[1].strip()
                # Simple condition parser for "id > value"
                if ">" in condition:
                    field, value = condition.split(">")
                    field = field.strip()
                    
                    # Handle parameter substitution
                    if "?" in value and parameters:
                        # Assume the parameter is the first one
                        param_value = parameters.get("param1", 0)
                        value = str(param_value)
                    else:
                        value = value.strip()
                    
                    # Filter results based on condition
                    results = []
                    for row in self.tables.get(table_name, []):
                        if int(row[0]) > int(value):
                            results.append(row)
                    
                    return results
            
            return self.tables.get(table_name, [])
        elif query.startswith("DROP TABLE"):
            table_name = query.split("TABLE")[1].strip().split(" ")[-1]
            if table_name in self.tables:
                del self.tables[table_name]
            return []
        elif query.startswith("SELECT name FROM sqlite_master"):
            return [("test_table",)]
        elif query.startswith("PRAGMA table_info"):
            return [
                (0, "id", "INTEGER", 1, None, 1),
                (1, "value", "TEXT", 0, None, 0)
            ]
        
        return []
    
    async def create_temp_table(self, table_name, data):
        """Create a temporary table"""
        self.tables[table_name] = data
        return True


class MockOrbitDB:
    """Mock OrbitDB implementation for testing"""
    
    def __init__(self):
        self.collections = {}
        self.queries = []
    
    async def find(self, **kwargs):
        """Find documents in the database"""
        self.queries.append(("find", kwargs))
        
        collection = kwargs.get("collection", "default")
        query = kwargs.get("query", {})
        
        if collection not in self.collections:
            return []
        
        # Simple filtering logic
        results = []
        for doc in self.collections[collection]:
            match = True
            for key, value in query.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            
            if match:
                results.append(doc)
        
        return results
    
    async def get(self, **kwargs):
        """Get a document by ID"""
        self.queries.append(("get", kwargs))
        
        collection = kwargs.get("collection", "default")
        doc_id = kwargs.get("id")
        
        if collection not in self.collections:
            return None
        
        for doc in self.collections[collection]:
            if doc.get("id") == doc_id:
                return doc
        
        return None
    
    async def put(self, **kwargs):
        """Insert a document"""
        self.queries.append(("put", kwargs))
        
        collection = kwargs.get("collection", "default")
        doc = kwargs.get("doc", {})
        
        if collection not in self.collections:
            self.collections[collection] = []
        
        # Ensure document has an ID
        if "id" not in doc:
            doc["id"] = str(len(self.collections[collection]))
        
        self.collections[collection].append(doc)
        return doc.get("id")
    
    async def delete(self, **kwargs):
        """Delete a document"""
        self.queries.append(("delete", kwargs))
        
        collection = kwargs.get("collection", "default")
        doc_id = kwargs.get("id")
        
        if collection not in self.collections:
            return False
        
        for i, doc in enumerate(self.collections[collection]):
            if doc.get("id") == doc_id:
                del self.collections[collection][i]
                return True
        
        return False
    
    async def query(self, query):
        """Custom query execution"""
        self.queries.append(("query", query))
        
        # Handle different query types based on query structure
        if isinstance(query, dict) and "collection" in query:
            collection = query["collection"]
            return self.collections.get(collection, [])
        
        return []
    
    async def list_databases(self):
        """List available databases/collections"""
        return list(self.collections.keys())


class MockFireproofDB:
    """Mock FireproofDB implementation for testing"""
    
    def __init__(self):
        self.databases = {}
        self.queries = []
    
    async def find(self, **kwargs):
        """Find documents using selector"""
        self.queries.append(("find", kwargs))
        
        database = kwargs.get("database", "default")
        selector = kwargs.get("selector", {})
        
        if database not in self.databases:
            return {"docs": []}
        
        # Simple selector matching
        results = []
        for doc in self.databases[database]:
            match = True
            for key, value in selector.items():
                if key not in doc or doc[key] != value:
                    match = False
                    break
            
            if match:
                results.append(doc)
        
        return {"docs": results}
    
    async def get(self, **kwargs):
        """Get a document by ID"""
        self.queries.append(("get", kwargs))
        
        database = kwargs.get("database", "default")
        doc_id = kwargs.get("id")
        
        if database not in self.databases:
            return None
        
        for doc in self.databases[database]:
            if doc.get("_id") == doc_id:
                return doc
        
        return None
    
    async def put(self, **kwargs):
        """Insert a document"""
        self.queries.append(("put", kwargs))
        
        database = kwargs.get("database", "default")
        doc = kwargs.get("doc", {})
        
        if database not in self.databases:
            self.databases[database] = []
        
        # Ensure document has an ID
        if "_id" not in doc:
            doc["_id"] = str(len(self.databases[database]))
        
        self.databases[database].append(doc)
        return {"id": doc.get("_id"), "ok": True}
    
    async def delete(self, **kwargs):
        """Delete a document"""
        self.queries.append(("delete", kwargs))
        
        database = kwargs.get("database", "default")
        doc_id = kwargs.get("id")
        
        if database not in self.databases:
            return {"ok": False}
        
        for i, doc in enumerate(self.databases[database]):
            if doc.get("_id") == doc_id:
                del self.databases[database][i]
                return {"ok": True}
        
        return {"ok": False}
    
    async def query(self, query):
        """Custom query execution"""
        self.queries.append(("query", query))
        
        # Handle different query types based on query structure
        if isinstance(query, dict) and "database" in query:
            database = query["database"]
            return {"docs": self.databases.get(database, [])}
        
        return {"docs": []}
    
    async def list_databases(self):
        """List available databases"""
        return list(self.databases.keys())


async def test_query_system():
    """Test the database query system implementation"""
    print("\n----- Testing Database Query System -----")
    
    # Create mock database instances
    duckdb = MockDuckDB()
    orbit_db = MockOrbitDB()
    fireproof_db = MockFireproofDB()
    
    # Create resources dict
    resources = {
        "duckdb": duckdb,
        "orbit_db": orbit_db,
        "fireproof_db": fireproof_db
    }
    
    # Create metadata dict
    metadata = {
        "enable_caching": True,
        "cache_size": 10,
        "cache_ttl": 10,
        "enable_optimization": True,
        "collect_metrics": True,
        "parallel_execution": True,
        "max_concurrent_queries": 5
    }
    
    # Create query system
    query_system = DatabaseQuerySystem(
        resources=resources,
        metadata=metadata
    )
    
    print("Query System initialized")
    
    # Test basic DuckDB query
    print("\nTesting basic DuckDB query")
    result = await query_system.execute_query(
        query="SELECT 1",
        target_db=DatabaseType.DUCKDB
    )
    print(f"Result: {result}")
    
    # Test creating and querying a table
    print("\nTesting table creation and query")
    await query_system.execute_query(
        query="CREATE TABLE test_table (id INTEGER, value TEXT)",
        target_db=DatabaseType.DUCKDB
    )
    
    await query_system.execute_query(
        query="INSERT INTO test_table VALUES (1, 'test1'), (2, 'test2'), (3, 'test3')",
        target_db=DatabaseType.DUCKDB
    )
    
    result = await query_system.execute_query(
        query="SELECT * FROM test_table WHERE id > ?",
        params={"param1": 1},
        target_db=DatabaseType.DUCKDB
    )
    print(f"Query result: {result}")
    
    # Test OrbitDB query
    print("\nTesting OrbitDB query")
    doc = {"id": "1", "name": "Test", "status": "active"}
    
    await query_system.execute_query(
        query=json.dumps({
            "collection": "test_collection",
            "doc": doc,
            "put": True
        }),
        target_db=DatabaseType.ORBITDB
    )
    
    result = await query_system.execute_query(
        query=json.dumps({
            "collection": "test_collection",
            "query": {"status": "active"},
            "find": True
        }),
        target_db=DatabaseType.ORBITDB
    )
    print(f"OrbitDB query result: {result}")
    
    # Test FireproofDB query
    print("\nTesting FireproofDB query")
    doc = {"_id": "1", "name": "Test", "status": "active"}
    
    await query_system.execute_query(
        query=json.dumps({
            "database": "test_db",
            "doc": doc,
            "put": True
        }),
        target_db=DatabaseType.FIREPROOFDB
    )
    
    result = await query_system.execute_query(
        query=json.dumps({
            "database": "test_db",
            "selector": {"status": "active"},
            "find": True
        }),
        target_db=DatabaseType.FIREPROOFDB
    )
    print(f"FireproofDB query result: {result}")
    
    # Test query caching
    print("\nTesting query caching")
    
    # Execute a query
    cache_query = "SELECT * FROM test_table WHERE id > ?"
    cache_params = {"param1": 1}
    
    # First execution
    print("Executing query first time")
    result1 = await query_system.execute_query(
        query=cache_query,
        params=cache_params,
        target_db=DatabaseType.DUCKDB
    )
    
    # Get initial query count
    initial_query_count = len(duckdb.queries)
    print(f"Initial query count: {initial_query_count}")
    
    # Second execution (should use cache)
    print("Executing query second time (should use cache)")
    result2 = await query_system.execute_query(
        query=cache_query,
        params=cache_params,
        target_db=DatabaseType.DUCKDB
    )
    
    # Check for cache hit
    current_query_count = len(duckdb.queries)
    print(f"Query count before: {initial_query_count}, after: {current_query_count}")
    print(f"Cache hit: {current_query_count == initial_query_count}")
    
    # Test performance metrics
    print("\nTesting performance metrics")
    metrics = query_system.get_performance_metrics()
    print(f"Query count: {metrics['overall']['count']}")
    
    # Test self-test function
    print("\nRunning self-test")
    test_results = await query_system.test()
    print(f"Self-test success: {test_results['success']}")
    
    return True


async def test_advanced_optimizer():
    """Test the advanced query optimizer implementation"""
    print("\n----- Testing Advanced Query Optimizer -----")
    
    # Create test statistics
    statistics = {
        "tables": {
            "users": {
                "row_count": 1000,
                "columns": [
                    {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True},
                    {"name": "username", "type": "TEXT", "nullable": False, "primary_key": False},
                    {"name": "email", "type": "TEXT", "nullable": False, "primary_key": False}
                ]
            },
            "orders": {
                "row_count": 5000,
                "columns": [
                    {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True},
                    {"name": "user_id", "type": "INTEGER", "nullable": False, "primary_key": False},
                    {"name": "amount", "type": "REAL", "nullable": False, "primary_key": False}
                ]
            }
        }
    }
    
    # Create an optimizer
    optimizer = AdvancedQueryOptimizer(
        statistics=statistics,
        optimization_level=OptimizationLevel.STANDARD
    )
    
    print("Optimizer initialized with STANDARD level")
    print(f"Enabled strategies: {optimizer.enabled_strategies}")
    
    # Test query analyzer
    print("\nTesting QueryAnalyzer")
    analyzer = QueryAnalyzer(statistics)
    
    # Analyze SQL query
    sql_query = "SELECT u.id, o.amount FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id > 100 ORDER BY o.amount DESC"
    sql_analysis = analyzer.analyze_query(sql_query)
    
    print(f"SQL query complexity: {sql_analysis['complexity']}")
    print(f"Tables detected: {[t['name'] for t in sql_analysis['tables']]}")
    print(f"Joins detected: {len(sql_analysis['joins'])}")
    print(f"Predicates detected: {len(sql_analysis['predicates'])}")
    
    # Analyze JSON query
    json_query = json.dumps({
        "collection": "users",
        "query": {"status": "active"},
        "find": True
    })
    json_analysis = analyzer.analyze_query(json_query)
    
    print(f"JSON query complexity: {json_analysis['complexity']}")
    print(f"Collections detected: {[c['name'] for c in json_analysis['collections']]}")
    
    # Test query optimization
    print("\nTesting query optimization")
    
    # Create a test plan
    plan = QueryPlan()
    
    # Add fragments
    fragment1 = QueryFragment(
        db_type=DatabaseType.DUCKDB,
        query="SELECT * FROM users WHERE id > 100",
        fragment_id="f1"
    )
    plan.add_fragment(fragment1)
    
    fragment2 = QueryFragment(
        db_type=DatabaseType.DUCKDB,
        query="SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE id > 100)",
        fragment_id="f2",
        dependencies=["f1"]
    )
    plan.add_fragment(fragment2)
    
    # Optimize the plan
    optimized_plan = optimizer.optimize(plan)
    
    print(f"Original fragments: {len(plan.fragments)}")
    print(f"Optimized fragments: {len(optimized_plan.fragments)}")
    
    # Check costs
    for i, fragment in enumerate(optimized_plan.fragments):
        print(f"Fragment {i+1} estimated cost: {fragment.estimated_cost}")
    
    # Test with different optimization levels
    print("\nTesting different optimization levels")
    
    for level in OptimizationLevel:
        level_optimizer = AdvancedQueryOptimizer(
            statistics=statistics,
            optimization_level=level
        )
        
        print(f"\nOptimization level: {level.name}")
        print(f"Enabled strategies: {level_optimizer.enabled_strategies}")
        
        # Optimize the plan
        level_optimized_plan = level_optimizer.optimize(plan)
        print(f"Optimized fragments: {len(level_optimized_plan.fragments)}")
    
    # Test self-test function
    print("\nRunning self-test")
    test_results = await optimizer.test()
    print(f"Self-test success: {test_results['success']}")
    
    return True


async def main():
    """Main test function"""
    print("==== Database Query System and Advanced Optimizer Tests ====")
    
    try:
        # Run query system tests
        await test_query_system()
        
        # Run advanced optimizer tests
        await test_advanced_optimizer()
        
        print("\nAll tests completed successfully!")
    except Exception as e:
        print(f"Error during tests: {str(e)}")
        raise


if __name__ == "__main__":
    # Windows policy for asyncio
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Run the tests
    asyncio.run(main())