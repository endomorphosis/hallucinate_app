# IPFS Datasets Implementation Guide

This document provides an overview of the `ipfs_datasets_py` PyPI package and how to implement it in the hallucinate_app project.

## Package Overview

The `ipfs_datasets_py` package provides a unified interface for data processing and distribution across decentralized networks. It's designed to work with HuggingFace datasets and IPFS for content-addressed storage.

Key components:
- Dataset loading and serialization
- IPFS content addressing and storage
- Vector embeddings and search
- GraphRAG (Graph Retrieval Augmented Generation)
- Knowledge graph extraction and management
- LLM integration for processing and reasoning

## Main Components

### Core Dataset Management
- `load_dataset`: Loads datasets from HuggingFace or local storage
- `ipfs_datasets_py`: Main class for managing datasets with IPFS integration
- `process_hashed_dataset_shard`: Processes dataset shards with content addressing

### Data Serialization and IPLD Integration
- `DatasetSerializer`: Converts between various dataset formats and IPLD
- `IPLDStorage`: Handles storage and retrieval of IPLD data
- `GraphDataset`: Represents datasets as graphs with nodes and edges
- `VectorAugmentedGraphDataset`: Extends GraphDataset with vector embedding capabilities

### Knowledge Graph and RAG Components
- `KnowledgeGraph`: Manages semantic knowledge graphs
- `KnowledgeGraphExtractor`: Extracts structured data from text into knowledge graphs
- `GraphRAGQueryOptimizer`: Optimizes graph-based retrieval operations
- `GraphRAGLLMProcessor`: Processes LLM operations with graph-based retrieval

### LLM Integration
- `LLMInterface`: Interface for language model operations
- `PromptTemplate`: Templates for structured LLM prompting
- `ReasoningEnhancer`: Enhances LLM reasoning capabilities

## Implementation in hallucinate_app

To implement the `ipfs_datasets_py` package in the hallucinate_app project, we need to:

1. Create a wrapper class that integrates with the project's resource pool pattern
2. Implement the standard module interface (init(), test())
3. Connect with the IPFS Kit module we just created

### Wrapper Class Template

```python
from typing import Dict, Any, Optional
import ipfs_datasets_py

class IPFSDatasets:
    """
    IPFS Datasets Manager for hallucinate_app
    
    Provides dataset management with IPFS integration, leveraging the ipfs_datasets_py package.
    """
    
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        """
        Initialize the IPFS Datasets Manager
        
        Args:
            resources: Resource pool for accessing other modules
            metadata: Configuration metadata
        """
        self.resources = resources or {}
        self.metadata = metadata or {}
        
        # Configuration with defaults
        self.config = {
            "dataset_cache_dir": self.metadata.get("dataset_cache_dir", "./datasets"),
            "use_caching": self.metadata.get("use_caching", True),
            "max_memory": self.metadata.get("max_memory", "1GB")
        }
        
        # Initialize the underlying ipfs_datasets_py instance
        self.datasets = ipfs_datasets_py.ipfs_datasets_py(self.resources, self.metadata)
        
        # State tracking
        self.initialized = False
    
    async def init(self) -> bool:
        """
        Initialize the IPFS Datasets Manager
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Ensure we have IPFS Kit available
            if "ipfs_kit" not in self.resources:
                raise ValueError("IPFS Kit resource is required but not available")
            
            # Initialize any required directories
            os.makedirs(self.config["dataset_cache_dir"], exist_ok=True)
            
            self.initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize IPFS Datasets: {e}")
            return False
    
    async def load_dataset(self, dataset_name: str, split: Optional[str] = None) -> Dict[str, Any]:
        """
        Load a dataset from HuggingFace or local cache
        
        Args:
            dataset_name: Name of the dataset
            split: Dataset split to load
            
        Returns:
            Dictionary with dataset info
        """
        if not self.initialized:
            await self.init()
            
        try:
            await self.datasets.load_dataset(dataset_name, split)
            return {"success": True, "dataset": dataset_name, "split": split}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def test(self) -> Dict[str, Any]:
        """
        Run self-test
        
        Returns:
            Dictionary with test results
        """
        test_results = {
            "success": True,
            "module": "ipfs_datasets",
            "tests": []
        }
        
        try:
            # Test initialization
            if not self.initialized:
                init_result = await self.init()
                test_results["tests"].append({
                    "name": "initialization",
                    "success": init_result
                })
                
                if not init_result:
                    test_results["success"] = False
                    return test_results
            
            # Test dataset loading
            try:
                # Use a small test dataset
                dataset_result = await self.load_dataset("hf-internal-testing/dummy_dataset", "train")
                
                test_results["tests"].append({
                    "name": "dataset_loading",
                    "success": dataset_result["success"]
                })
                
                if not dataset_result["success"]:
                    test_results["success"] = False
            except Exception as e:
                test_results["tests"].append({
                    "name": "dataset_loading",
                    "success": False,
                    "error": str(e)
                })
                test_results["success"] = False
                
            return test_results
        except Exception as e:
            test_results["success"] = False
            test_results["error"] = str(e)
            return test_results
```

## Integration with IPFS Kit

The IPFS Datasets module relies on the IPFS Kit module for content storage and retrieval. The integration between these modules happens through:

1. The resource pool passed during initialization
2. Shared content addressing for dataset components
3. Consistent error handling patterns

To ensure proper integration:

1. Access the IPFS Kit through `self.resources["ipfs_kit"]`
2. Use content identifiers (CIDs) consistently between modules
3. Implement proper error handling with appropriate exception types

## Connecting with the Dashboard

The Dashboard can include an IPFS Datasets panel that displays:

1. Available datasets
2. Dataset metadata and statistics
3. Content addressing information
4. Vector and knowledge graph visualizations

## Key Integration Points

When implementing this module, focus on:

1. **Content addressing**: Ensure all dataset components have proper IPFS CIDs
2. **Caching**: Implement efficient caching for commonly accessed datasets
3. **Error handling**: Handle network issues and IPFS errors gracefully
4. **Vector integration**: Connect with FAISS and other vector services
5. **GraphRAG**: Implement knowledge graph integration with retrieval
6. **LLM integration**: Connect with the model manager for inference

## Testing Strategy

Test the IPFS Datasets implementation by:

1. Loading various dataset types (text, images, structured data)
2. Verifying content addressing and retrieval
3. Testing with the IPFS network in both online and offline modes
4. Validating graph-based queries and knowledge extraction
5. Benchmarking performance for various dataset sizes