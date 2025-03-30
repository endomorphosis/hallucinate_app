# Multi-Database Query System for hallucinate_app

This module provides a comprehensive cross-database query system for hallucinate_app, enabling seamless planning, optimization, and execution of queries across different database systems including DuckDB, OrbitDB, and FireproofDB.

## Architecture Overview

The database query system follows a modular architecture with the following key components:

1. **DatabaseQuerySystem**: The main entry point for executing queries. It handles query planning, caching, metrics collection, and execution routing.

2. **QueryFragment**: Represents a single query operation against a specific database. Fragments can be executed independently or as part of a larger plan.

3. **QueryPlan**: A collection of query fragments with their dependencies, which can be executed serially or in parallel.

4. **QueryOptimizer**: Analyzes and improves query plans for better performance. The basic optimizer provides cost estimation and simple optimizations.

5. **AdvancedQueryOptimizer**: Extends the basic optimizer with advanced strategies such as predicate pushdown, join optimization, and materialized views.

6. **QueryCache**: Caches query results for improved performance with repeated queries.

7. **QueryPerformanceMetrics**: Collects and analyzes performance data for executed queries.

## Database Types Supported

The system currently supports three database types:

1. **DuckDB**: A high-performance analytical SQL database
   - SQL query syntax
   - Supports transactions, joins, and complex queries
   - Ideal for analytical workloads

2. **OrbitDB**: A peer-to-peer database built on IPFS
   - Document-based with collections
   - Event-sourced with built-in replication
   - JSON-based query structure

3. **FireproofDB**: A serverless database with CRDT capabilities
   - CRDT-based with automatic conflict resolution
   - Document-based with databases
   - JSON-based query structure with selectors

## Query System Features

The query system provides the following features:

### Cross-Database Queries

- Execute queries across different database systems
- Automatic database detection based on query structure
- Manual targeting of specific databases

### Query Planning and Optimization

- Generates query plans with fragments and dependencies
- Optimizes plans based on query semantics and statistics
- Cost-based optimization for improved performance

### Parallel Query Execution

- Executes independent query fragments in parallel
- Respects fragment dependencies
- Batches fragments for efficient parallel execution

### Query Caching

- Caches results of read-only queries
- Time-based expiration (TTL)
- Size-constrained LRU cache policy
- Table-specific cache invalidation

### Performance Metrics

- Tracks query execution times
- Identifies slow queries
- Collects error information
- Provides statistics by query type and database

### Query Fragments

- Self-contained query execution units
- Support for dependencies between fragments
- Automatic query type detection
- Detailed status tracking during execution

## Advanced Query Optimization

The advanced query optimizer provides several optimization strategies:

1. **Query Rewriting**: Transforms queries for better performance
2. **Predicate Pushdown**: Pushes filters down to improve selectivity
3. **Join Optimization**: Optimizes join order and strategies
4. **Materialized Views**: Uses pre-computed views when possible
5. **Federation Optimization**: Optimizes queries across database systems

The optimizer supports different optimization levels:

- **NONE**: No optimization
- **BASIC**: Simple optimizations only
- **STANDARD**: Standard performance optimizations
- **AGGRESSIVE**: All production-ready optimizations
- **EXPERIMENTAL**: Includes experimental optimizations

## Usage Examples

### Basic Query Execution

```python
from hallucinate_app.database_query_system import DatabaseQuerySystem, DatabaseType

# Initialize the query system
query_system = DatabaseQuerySystem(resources=resources)

# Execute a DuckDB query
result = await query_system.execute_query(
    query="SELECT * FROM users WHERE status = 'active'",
    target_db=DatabaseType.DUCKDB
)

# Execute an OrbitDB query
result = await query_system.execute_query(
    query='{"collection": "users", "query": {"status": "active"}, "find": true}',
    target_db=DatabaseType.ORBITDB
)

# Execute a FireproofDB query
result = await query_system.execute_query(
    query='{"database": "users", "selector": {"status": "active"}, "find": true}',
    target_db=DatabaseType.FIREPROOFDB
)
```

### Query Planning and Optimization

```python
from hallucinate_app.database_query_system import QueryPlan, QueryFragment, DatabaseType
from hallucinate_app.advanced_query_optimizer import AdvancedQueryOptimizer, OptimizationLevel

# Create a query plan
plan = QueryPlan()

# Add fragments with dependencies
fragment1 = QueryFragment(
    db_type=DatabaseType.DUCKDB,
    query="SELECT id FROM users WHERE status = 'active'",
    fragment_id="f1"
)
plan.add_fragment(fragment1)

fragment2 = QueryFragment(
    db_type=DatabaseType.DUCKDB,
    query="SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE status = 'active')",
    fragment_id="f2",
    dependencies=["f1"]
)
plan.add_fragment(fragment2)

# Optimize the plan
optimizer = AdvancedQueryOptimizer(
    statistics=statistics,
    optimization_level=OptimizationLevel.STANDARD
)
optimized_plan = optimizer.optimize(plan)

# Execute the optimized plan
result = await query_system.execute_plan(optimized_plan)
```

### Performance Metrics Collection

```python
# Get performance metrics
metrics = query_system.get_performance_metrics()

# Print overall metrics
print(f"Total queries: {metrics['overall']['count']}")
print(f"Average execution time: {metrics['overall']['avg_time']} seconds")

# Print slow queries
for query in metrics['slow_queries']:
    print(f"Slow query: {query['query']}")
    print(f"Execution time: {query['execution_time']} seconds")
```

## Integration with Dashboard

The database query system integrates with the hallucinate_app dashboard, providing visual monitoring and control of database operations. The dashboard includes:

- Query execution interface
- Performance metrics visualization
- Query plan visualization
- Database statistics display
- Cache management controls

## Implementation Details

### Query System Initialization

The database query system is initialized with a resources dictionary that contains database instances and a metadata dictionary with configuration settings:

```python
resources = {
    "duckdb": duckdb_instance,
    "orbit_db": orbit_db_instance,
    "fireproof_db": fireproof_db_instance,
    "thread_pool": thread_pool,
    "statistics": database_statistics
}

metadata = {
    "enable_caching": True,
    "cache_size": 100,
    "cache_ttl": 300,
    "enable_optimization": True,
    "collect_metrics": True,
    "parallel_execution": True,
    "max_concurrent_queries": 5,
    "stats_update_interval": 3600
}

query_system = DatabaseQuerySystem(resources, metadata)
```

### Database Statistics Collection

The system automatically collects statistics about the databases to improve optimization decisions:

- Table sizes
- Column types and constraints
- Data distribution
- Query patterns
- Performance characteristics

### Asynchronous Execution

The query system uses Python's asyncio for asynchronous query execution:

- All database operations are async/await
- Parallel execution using gather
- Non-blocking query execution
- Thread pool integration for CPU-intensive operations

## Future Enhancements

Future versions of the database query system will include:

1. **Cost Learning**: Adaptive cost estimation based on query execution history
2. **Dynamic Reoptimization**: Real-time plan adjustments during execution
3. **Query Profiling**: Detailed execution profiling for query optimization
4. **Enhanced Cross-Database Joins**: Improved strategies for joining data across database systems
5. **Distributed Query Execution**: Support for running queries across multiple nodes
6. **Query Visualization**: Visual representation of query plans and execution

## Testing

The database query system includes comprehensive tests:

- Unit tests for individual components
- Integration tests for cross-component functionality
- Performance tests for optimization strategies
- Mock implementations of database systems for controlled testing
- Dashboard integration tests for UI functionality

## Conclusion

The hallucinate_app database query system provides a powerful and flexible way to work with multiple database types in a uniform manner. With features like cross-database queries, automatic optimization, query caching, and performance metrics, it enables efficient data management while maintaining the specific advantages of each database type.