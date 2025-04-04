"""
IPFS Embeddings Python Package

This package provides functionality for generating embeddings from text data and efficient
vector similarity search using FAISS, with IPFS integration for decentralized storage and retrieval.
"""

from .ipfs_embeddings_py import IPFSEmbeddingsPy
from .ipfs_faiss_py import IPFSFaissPy

__all__ = ['IPFSEmbeddingsPy', 'IPFSFaissPy']
__version__ = '0.1.0'