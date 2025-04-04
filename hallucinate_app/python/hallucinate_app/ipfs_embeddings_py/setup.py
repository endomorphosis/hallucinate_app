from setuptools import setup, find_packages

setup(
    name="ipfs_embeddings_py",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "numpy>=1.20.0",
        "sentence-transformers>=2.2.0",
        "faiss-cpu>=1.7.0; platform_system!='Darwin' or platform_machine!='arm64'",
        "faiss-cpu-noavx2>=1.7.0; platform_system=='Darwin' and platform_machine=='arm64'",
        "asyncio>=3.4.3",
    ],
    extras_require={
        "gpu": ["faiss-gpu>=1.7.0"],
        "test": ["pytest", "pytest-asyncio"],
    },
    author="hallucinate_app Team",
    author_email="example@example.com",
    description="IPFS-integrated embeddings and vector search using FAISS",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/your-username/ipfs_embeddings_py",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: System :: Distributed Computing",
    ],
    python_requires=">=3.7",
)