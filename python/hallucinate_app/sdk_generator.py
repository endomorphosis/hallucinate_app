"""
SDK Generator for ipfs_kit_py

This module provides functionality to generate client SDKs for various languages
from the ipfs_kit_py package. It uses the generate_sdk method from ipfs_kit_py
and adds additional customization and integration options.
"""

import os
import sys
import json
import logging
import shutil
import argparse
import importlib
from typing import Dict, Any, List, Optional, Union, Tuple
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("SDK_Generator")

# Try importing ipfs_kit_py
try:
    import ipfs_kit_py
    from ipfs_kit_py.ipfs_kit import ipfs_kit
    from ipfs_kit_py.high_level_api import IPFSSimpleAPI
    HAS_IPFS_KIT = True
except ImportError:
    HAS_IPFS_KIT = False
    logger.warning("ipfs_kit_py not found. SDK generation will be simulated.")

# Define supported languages
SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "rust"]

# Default output path
DEFAULT_OUTPUT_DIR = Path("./generated_sdks")

class SDKGenerator:
    """
    Generator for creating client SDKs from ipfs_kit_py
    
    This class provides an interface to generate SDKs for multiple languages,
    with additional customization options and integration with the hallucinate_app
    project.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize the SDK Generator
        
        Args:
            config: Configuration dictionary for the generator
        """
        self.config = config or {}
        self.ipfs_kit_instance = None
        self.api_instance = None
        self.initialized = False
        
        # Configure output directory
        self.output_dir = Path(self.config.get("output_dir", DEFAULT_OUTPUT_DIR))
        
        # Configure SDK options
        self.sdk_options = self.config.get("sdk_options", {})
        
        # Track generated SDKs
        self.generated_sdks = {}
        
        # Initialize if ipfs_kit_py is available
        if HAS_IPFS_KIT:
            self._initialize_ipfs_kit()
    
    def _initialize_ipfs_kit(self):
        """Initialize ipfs_kit_py components"""
        try:
            # Create ipfs_kit instance with configuration
            ipfs_kit_config = self.config.get("ipfs_kit", {})
            self.ipfs_kit_instance = ipfs_kit(metadata=ipfs_kit_config)
            
            # Create high-level API
            self.api_instance = IPFSSimpleAPI(
                config_path=ipfs_kit_config.get("config_path"),
                role=ipfs_kit_config.get("role", "leecher")
            )
            
            self.initialized = True
            logger.info("IPFS Kit initialized successfully for SDK generation")
        except Exception as e:
            logger.error(f"Failed to initialize IPFS Kit: {str(e)}")
            raise
    
    def generate_sdk(self, language: str, output_dir: Optional[str] = None,
                    options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Generate an SDK for the specified language
        
        Args:
            language: Target language for SDK generation
            output_dir: Output directory for generated SDK
            options: Additional options for SDK generation
            
        Returns:
            Dictionary with information about the generated SDK
        """
        # Validate language
        language = language.lower()
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language: {language}. Supported languages: {SUPPORTED_LANGUAGES}")
        
        # Determine output directory
        if output_dir:
            sdk_output_dir = Path(output_dir)
        else:
            sdk_output_dir = self.output_dir / language
        
        # Create output directory if it doesn't exist
        sdk_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Merge options
        merged_options = {**self.sdk_options, **(options or {})}
        
        # Perform SDK generation
        if HAS_IPFS_KIT and self.initialized:
            logger.info(f"Generating {language} SDK in {sdk_output_dir}")
            
            try:
                # Use ipfs_kit_py's generate_sdk method
                result = self.api_instance.generate_sdk(
                    language=language,
                    output_dir=str(sdk_output_dir),
                    **merged_options
                )
                
                # Record successful generation
                self.generated_sdks[language] = {
                    "path": str(sdk_output_dir),
                    "options": merged_options,
                    "timestamp": result.get("timestamp"),
                    "files": result.get("files", [])
                }
                
                # Process and customize the generated SDK
                self._post_process_sdk(language, sdk_output_dir, merged_options)
                
                logger.info(f"Successfully generated {language} SDK")
                return {
                    "success": True,
                    "language": language,
                    "output_dir": str(sdk_output_dir),
                    "files": result.get("files", []),
                    "options": merged_options
                }
            except Exception as e:
                logger.error(f"Error generating {language} SDK: {str(e)}")
                return {
                    "success": False,
                    "language": language,
                    "error": str(e)
                }
        else:
            # Simulation mode for testing
            logger.warning(f"Simulating SDK generation for {language} (ipfs_kit_py not available)")
            
            # Create a simple README file
            readme_path = sdk_output_dir / "README.md"
            with open(readme_path, "w") as f:
                f.write(f"# IPFS Kit {language.capitalize()} SDK\n\n")
                f.write("This is a simulated SDK, as ipfs_kit_py was not available during generation.\n")
            
            # Create a simple base file
            if language == "python":
                self._create_simulated_python_sdk(sdk_output_dir)
            elif language in ["javascript", "typescript"]:
                self._create_simulated_js_sdk(sdk_output_dir, language)
            elif language == "rust":
                self._create_simulated_rust_sdk(sdk_output_dir)
            
            logger.info(f"Created simulated {language} SDK in {sdk_output_dir}")
            
            return {
                "success": True,
                "language": language,
                "simulated": True,
                "output_dir": str(sdk_output_dir),
                "options": merged_options
            }
    
    def _post_process_sdk(self, language: str, sdk_dir: Path, options: Dict[str, Any]):
        """
        Post-process a generated SDK to customize it for the project
        
        Args:
            language: SDK language
            sdk_dir: SDK output directory
            options: SDK generation options
        """
        if language == "python":
            self._process_python_sdk(sdk_dir, options)
        elif language == "javascript" or language == "typescript":
            self._process_js_sdk(sdk_dir, options, language)
        elif language == "rust":
            self._process_rust_sdk(sdk_dir, options)
    
    def _process_python_sdk(self, sdk_dir: Path, options: Dict[str, Any]):
        """
        Process a generated Python SDK
        
        Args:
            sdk_dir: SDK output directory
            options: SDK generation options
        """
        # Add project-specific customizations
        setup_py = sdk_dir / "setup.py"
        if setup_py.exists():
            # Read existing setup.py
            with open(setup_py, "r") as f:
                setup_content = f.read()
            
            # Add hallucinate_app as a related package
            if "hallucinate_app" not in setup_content:
                modified_content = setup_content.replace(
                    "install_requires=[",
                    "install_requires=[\n        'hallucinate_app',")
                
                # Write modified setup.py
                with open(setup_py, "w") as f:
                    f.write(modified_content)
        
        # Add integration examples
        examples_dir = sdk_dir / "examples"
        examples_dir.mkdir(exist_ok=True)
        
        example_path = examples_dir / "hallucinate_app_integration.py"
        with open(example_path, "w") as f:
            f.write(f'''"""
Example of integrating the IPFS Kit Python SDK with hallucinate_app
"""

import os
import sys
from ipfs_kit_sdk import IPFSKitClient

# Import from hallucinate_app
try:
    from hallucinate_app.ipfs_kit_bridge import IPFSKitBridge
except ImportError:
    print("hallucinate_app not found. This example requires hallucinate_app.")
    sys.exit(1)

def main():
    # Create SDK client
    client = IPFSKitClient()
    
    # Initialize client
    client.init()
    
    # Use the client
    print("IPFS Kit SDK Client initialized")
    
    # Check connection
    status = client.get_status()
    print(f"IPFS Kit status: {status}")
    
    # Create a bridge instance
    bridge = IPFSKitBridge()
    
    # Use SDK with bridge
    print("Using SDK with hallucinate_app bridge")
    
    # Perform operations
    cid = client.add_string("Hello from IPFS Kit SDK!")
    print(f"Added content with CID: {cid}")
    
    # Clean up
    client.shutdown()
    print("IPFS Kit SDK Client shut down")

if __name__ == "__main__":
    main()
''')
    
    def _process_js_sdk(self, sdk_dir: Path, options: Dict[str, Any], language: str):
        """
        Process a generated JavaScript/TypeScript SDK
        
        Args:
            sdk_dir: SDK output directory
            options: SDK generation options
            language: 'javascript' or 'typescript'
        """
        # Determine file extension
        ext = "ts" if language == "typescript" else "js"
        
        # Add project-specific customizations
        package_json = sdk_dir / "package.json"
        if package_json.exists():
            # Read existing package.json
            with open(package_json, "r") as f:
                package_data = json.load(f)
            
            # Add hallucinate_app as a peer dependency
            if "peerDependencies" not in package_data:
                package_data["peerDependencies"] = {}
            
            package_data["peerDependencies"]["hallucinate_app"] = "^1.0.0"
            
            # Write modified package.json
            with open(package_json, "w") as f:
                json.dump(package_data, f, indent=2)
        
        # Add integration examples
        examples_dir = sdk_dir / "examples"
        examples_dir.mkdir(exist_ok=True)
        
        example_path = examples_dir / f"hallucinate_app_integration.{ext}"
        with open(example_path, "w") as f:
            if language == "typescript":
                f.write(f'''/**
 * Example of integrating the IPFS Kit TypeScript SDK with hallucinate_app
 */

import {{ IPFSKitClient }} from '../src';
import {{ IPFSKitBridge }} from 'hallucinate_app/node/ipfs_kit_bridge';

async function main() {{
  // Create SDK client
  const client = new IPFSKitClient();
  
  try {{
    // Initialize client
    await client.init();
    
    console.log('IPFS Kit SDK Client initialized');
    
    // Check connection
    const status = await client.getStatus();
    console.log(`IPFS Kit status: ${{JSON.stringify(status)}}`);
    
    // Create a bridge instance
    const bridge = new IPFSKitBridge();
    
    console.log('Using SDK with hallucinate_app bridge');
    
    // Perform operations
    const content = 'Hello from IPFS Kit SDK!';
    const result = await client.addString(content);
    console.log(`Added content with CID: ${{result.cid}}`);
    
    // Clean up
    await client.shutdown();
    console.log('IPFS Kit SDK Client shut down');
  }} catch (error) {{
    console.error('Error:', error);
  }}
}}

main();
''')
            else:
                f.write(f'''/**
 * Example of integrating the IPFS Kit JavaScript SDK with hallucinate_app
 */

const {{ IPFSKitClient }} = require('../src');
const {{ IPFSKitBridge }} = require('hallucinate_app/node/ipfs_kit_bridge');

async function main() {{
  // Create SDK client
  const client = new IPFSKitClient();
  
  try {{
    // Initialize client
    await client.init();
    
    console.log('IPFS Kit SDK Client initialized');
    
    // Check connection
    const status = await client.getStatus();
    console.log(`IPFS Kit status: ${{JSON.stringify(status)}}`);
    
    // Create a bridge instance
    const bridge = new IPFSKitBridge();
    
    console.log('Using SDK with hallucinate_app bridge');
    
    // Perform operations
    const content = 'Hello from IPFS Kit SDK!';
    const result = await client.addString(content);
    console.log(`Added content with CID: ${{result.cid}}`);
    
    // Clean up
    await client.shutdown();
    console.log('IPFS Kit SDK Client shut down');
  }} catch (error) {{
    console.error('Error:', error);
  }}
}}

main();
''')
    
    def _process_rust_sdk(self, sdk_dir: Path, options: Dict[str, Any]):
        """
        Process a generated Rust SDK
        
        Args:
            sdk_dir: SDK output directory
            options: SDK generation options
        """
        # Add project-specific customizations to Cargo.toml
        cargo_toml = sdk_dir / "Cargo.toml"
        if cargo_toml.exists():
            # Read existing Cargo.toml
            with open(cargo_toml, "r") as f:
                cargo_content = f.read()
            
            # Write modified Cargo.toml
            with open(cargo_toml, "w") as f:
                f.write(cargo_content)
        
        # Add integration examples
        examples_dir = sdk_dir / "examples"
        examples_dir.mkdir(exist_ok=True)
        
        example_path = examples_dir / "hallucinate_app_integration.rs"
        with open(example_path, "w") as f:
            f.write('''//! Example of using the IPFS Kit Rust SDK with hallucinate_app

use ipfs_kit_sdk::IPFSKitClient;
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    // Create SDK client
    let mut client = IPFSKitClient::new()?;
    
    // Initialize client
    client.init()?;
    
    println!("IPFS Kit SDK Client initialized");
    
    // Check connection
    let status = client.get_status()?;
    println!("IPFS Kit status: {:?}", status);
    
    // Perform operations
    let content = "Hello from IPFS Kit SDK!";
    let result = client.add_string(content)?;
    println!("Added content with CID: {}", result.cid);
    
    // Clean up
    client.shutdown()?;
    println!("IPFS Kit SDK Client shut down");
    
    Ok(())
}
''')
    
    def _create_simulated_python_sdk(self, sdk_dir: Path):
        """Create a simulated Python SDK"""
        
        # Create package structure
        pkg_dir = sdk_dir / "ipfs_kit_sdk"
        pkg_dir.mkdir(exist_ok=True)
        
        # Create __init__.py
        init_path = pkg_dir / "__init__.py"
        with open(init_path, "w") as f:
            f.write("""\"\"\"
IPFS Kit Python SDK

This is a simulated SDK for testing purposes.
\"\"\"

from .client import IPFSKitClient

__version__ = "0.1.0"
__all__ = ["IPFSKitClient"]
""")
        
        # Create client.py
        client_path = pkg_dir / "client.py"
        with open(client_path, "w") as f:
            f.write("""\"\"\"
IPFS Kit Client

Simulated client for IPFS Kit.
\"\"\"

class IPFSKitClient:
    \"\"\"
    Client for interacting with IPFS Kit
    
    This is a simulated client for testing purposes.
    \"\"\"
    
    def __init__(self, config=None):
        \"\"\"
        Initialize the IPFS Kit client
        
        Args:
            config: Optional configuration dictionary
        \"\"\"
        self.config = config or {}
        self.initialized = False
    
    def init(self):
        \"\"\"Initialize the client\"\"\"
        self.initialized = True
        return True
    
    def get_status(self):
        \"\"\"Get client status\"\"\"
        return {
            "initialized": self.initialized,
            "simulated": True,
            "version": "0.1.0-simulated"
        }
    
    def add_string(self, content):
        \"\"\"
        Add a string to IPFS
        
        Args:
            content: String content to add
            
        Returns:
            CID of the added content
        \"\"\"
        if not self.initialized:
            raise RuntimeError("Client not initialized")
        
        # Simulate CID generation
        import hashlib
        cid = "QmSim" + hashlib.md5(content.encode()).hexdigest()[:16]
        
        return {
            "cid": cid,
            "size": len(content)
        }
    
    def shutdown(self):
        \"\"\"Shut down the client\"\"\"
        self.initialized = False
        return True
""")
        
        # Create setup.py
        setup_path = sdk_dir / "setup.py"
        with open(setup_path, "w") as f:
            f.write("""from setuptools import setup, find_packages

setup(
    name="ipfs_kit_sdk",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[],
    author="Simulated SDK Generator",
    author_email="example@example.com",
    description="Simulated IPFS Kit SDK for Python",
    keywords="ipfs, sdk, simulated",
    python_requires=">=3.6",
)
""")
    
    def _create_simulated_js_sdk(self, sdk_dir: Path, language: str):
        """Create a simulated JavaScript/TypeScript SDK"""
        
        # Create package structure
        src_dir = sdk_dir / "src"
        src_dir.mkdir(exist_ok=True)
        
        # Determine file extension
        ext = "ts" if language == "typescript" else "js"
        
        # Create index file
        index_path = src_dir / f"index.{ext}"
        with open(index_path, "w") as f:
            if language == "typescript":
                f.write("""/**
 * IPFS Kit TypeScript SDK
 * 
 * This is a simulated SDK for testing purposes.
 */

export { IPFSKitClient } from './client';
""")
            else:
                f.write("""/**
 * IPFS Kit JavaScript SDK
 * 
 * This is a simulated SDK for testing purposes.
 */

const { IPFSKitClient } = require('./client');

module.exports = {
  IPFSKitClient
};
""")
        
        # Create client file
        client_path = src_dir / f"client.{ext}"
        with open(client_path, "w") as f:
            if language == "typescript":
                f.write("""/**
 * IPFS Kit Client
 * 
 * Simulated client for IPFS Kit.
 */

import * as crypto from 'crypto';

export interface IPFSKitConfig {
  [key: string]: any;
}

export interface StatusResponse {
  initialized: boolean;
  simulated: boolean;
  version: string;
}

export interface AddResult {
  cid: string;
  size: number;
}

export class IPFSKitClient {
  private config: IPFSKitConfig;
  private initialized: boolean = false;

  /**
   * Initialize the IPFS Kit client
   * 
   * @param config Optional configuration object
   */
  constructor(config?: IPFSKitConfig) {
    this.config = config || {};
  }

  /**
   * Initialize the client
   */
  async init(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  /**
   * Get client status
   */
  async getStatus(): Promise<StatusResponse> {
    return {
      initialized: this.initialized,
      simulated: true,
      version: "0.1.0-simulated"
    };
  }

  /**
   * Add a string to IPFS
   * 
   * @param content String content to add
   * @returns CID of the added content
   */
  async addString(content: string): Promise<AddResult> {
    if (!this.initialized) {
      throw new Error("Client not initialized");
    }
    
    // Simulate CID generation
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
    const cid = `QmSim${hash}`;
    
    return {
      cid,
      size: content.length
    };
  }

  /**
   * Shut down the client
   */
  async shutdown(): Promise<boolean> {
    this.initialized = false;
    return true;
  }
}
""")
            else:
                f.write("""/**
 * IPFS Kit Client
 * 
 * Simulated client for IPFS Kit.
 */

const crypto = require('crypto');

/**
 * Client for interacting with IPFS Kit
 * 
 * This is a simulated client for testing purposes.
 */
class IPFSKitClient {
  /**
   * Initialize the IPFS Kit client
   * 
   * @param {Object} config Optional configuration object
   */
  constructor(config) {
    this.config = config || {};
    this.initialized = false;
  }

  /**
   * Initialize the client
   * 
   * @returns {Promise<boolean>} True if initialization successful
   */
  async init() {
    this.initialized = true;
    return true;
  }

  /**
   * Get client status
   * 
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return {
      initialized: this.initialized,
      simulated: true,
      version: "0.1.0-simulated"
    };
  }

  /**
   * Add a string to IPFS
   * 
   * @param {string} content String content to add
   * @returns {Promise<Object>} CID of the added content
   */
  async addString(content) {
    if (!this.initialized) {
      throw new Error("Client not initialized");
    }
    
    // Simulate CID generation
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
    const cid = `QmSim${hash}`;
    
    return {
      cid,
      size: content.length
    };
  }

  /**
   * Shut down the client
   * 
   * @returns {Promise<boolean>} True if shutdown successful
   */
  async shutdown() {
    this.initialized = false;
    return true;
  }
}

module.exports = { IPFSKitClient };
""")
        
        # Create package.json
        package_path = sdk_dir / "package.json"
        with open(package_path, "w") as f:
            json.dump({
                "name": "ipfs-kit-sdk",
                "version": "0.1.0",
                "description": f"Simulated IPFS Kit SDK for {language.capitalize()}",
                "main": f"src/index.{ext}",
                "scripts": {
                    "test": "echo \"Error: no test specified\" && exit 1"
                },
                "keywords": ["ipfs", "sdk", "simulated"],
                "author": "Simulated SDK Generator",
                "license": "MIT"
            }, f, indent=2)
    
    def _create_simulated_rust_sdk(self, sdk_dir: Path):
        """Create a simulated Rust SDK"""
        
        # Create src directory
        src_dir = sdk_dir / "src"
        src_dir.mkdir(exist_ok=True)
        
        # Create lib.rs
        lib_path = src_dir / "lib.rs"
        with open(lib_path, "w") as f:
            f.write(r"""//! IPFS Kit Rust SDK
//!
//! This is a simulated SDK for testing purposes.

use std::error::Error;
use std::fmt;

/// IPFS Kit client error
#[derive(Debug)]
pub struct IPFSKitError {
    message: String,
}

impl IPFSKitError {
    fn new(message: &str) -> Self {
        IPFSKitError {
            message: message.to_string(),
        }
    }
}

impl fmt::Display for IPFSKitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "IPFS Kit error: {}", self.message)
    }
}

impl Error for IPFSKitError {}

/// Status response from the client
#[derive(Debug)]
pub struct StatusResponse {
    pub initialized: bool,
    pub simulated: bool,
    pub version: String,
}

/// Result of adding content to IPFS
#[derive(Debug)]
pub struct AddResult {
    pub cid: String,
    pub size: usize,
}

/// Client for interacting with IPFS Kit
pub struct IPFSKitClient {
    initialized: bool,
}

impl IPFSKitClient {
    /// Create a new IPFS Kit client
    pub fn new() -> Result<Self, Box<dyn Error>> {
        Ok(IPFSKitClient {
            initialized: false,
        })
    }
    
    /// Initialize the client
    pub fn init(&mut self) -> Result<bool, Box<dyn Error>> {
        self.initialized = true;
        Ok(true)
    }
    
    /// Get client status
    pub fn get_status(&self) -> Result<StatusResponse, Box<dyn Error>> {
        Ok(StatusResponse {
            initialized: self.initialized,
            simulated: true,
            version: "0.1.0-simulated".to_string(),
        })
    }
    
    /// Add a string to IPFS
    pub fn add_string(&self, content: &str) -> Result<AddResult, Box<dyn Error>> {
        if !self.initialized {
            return Err(Box::new(IPFSKitError::new("Client not initialized")));
        }
        
        // Simulate CID generation
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        let hash = format!("{:016x}", hasher.finish());
        let cid = format!("QmSim{}", &hash[..16]);
        
        Ok(AddResult {
            cid,
            size: content.len(),
        })
    }
    
    /// Shut down the client
    pub fn shutdown(&mut self) -> Result<bool, Box<dyn Error>> {
        self.initialized = false;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_client_lifecycle() {
        let mut client = IPFSKitClient::new().unwrap();
        
        // Test initialization
        assert_eq!(client.initialized, false);
        let init_result = client.init().unwrap();
        assert_eq!(init_result, true);
        assert_eq!(client.initialized, true);
        
        // Test status
        let status = client.get_status().unwrap();
        assert_eq!(status.initialized, true);
        assert_eq!(status.simulated, true);
        
        // Test add_string
        let content = "Hello, IPFS Kit!";
        let result = client.add_string(content).unwrap();
        assert_eq!(result.size, content.len());
        assert!(result.cid.starts_with("QmSim"));
        
        // Test shutdown
        let shutdown_result = client.shutdown().unwrap();
        assert_eq!(shutdown_result, true);
        assert_eq!(client.initialized, false);
    }
}
""")
        
        # Create Cargo.toml
        cargo_path = sdk_dir / "Cargo.toml"
        with open(cargo_path, "w") as f:
            f.write("""[package]
name = "ipfs_kit_sdk"
version = "0.1.0"
edition = "2021"
authors = ["Simulated SDK Generator"]
description = "Simulated IPFS Kit SDK for Rust"
license = "MIT"

[dependencies]
# No dependencies for the simulated SDK

[dev-dependencies]
# No dev dependencies for the simulated SDK
""")
    
    def generate_all_sdks(self, output_base_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate SDKs for all supported languages
        
        Args:
            output_base_dir: Base directory for all SDK outputs
            
        Returns:
            Dictionary with information about all generated SDKs
        """
        results = {}
        
        # Determine base output directory
        base_dir = Path(output_base_dir) if output_base_dir else self.output_dir
        base_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate SDKs for all supported languages
        for language in SUPPORTED_LANGUAGES:
            lang_dir = base_dir / language
            results[language] = self.generate_sdk(language, str(lang_dir))
        
        return {
            "success": True,
            "results": results,
            "base_directory": str(base_dir)
        }


def main():
    """Main entry point for the SDK generator"""
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="IPFS Kit SDK Generator")
    parser.add_argument("--language", "-l", choices=SUPPORTED_LANGUAGES, help="Language to generate SDK for")
    parser.add_argument("--output-dir", "-o", default=None, help="Output directory for generated SDKs")
    parser.add_argument("--config", "-c", default=None, help="Path to configuration file")
    parser.add_argument("--all", "-a", action="store_true", help="Generate SDKs for all supported languages")
    args = parser.parse_args()
    
    # Load configuration if provided
    config = {}
    if args.config and os.path.exists(args.config):
        try:
            with open(args.config, "r") as f:
                config = json.load(f)
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
            sys.exit(1)
    
    # Set output directory
    if args.output_dir:
        config["output_dir"] = args.output_dir
    
    # Create generator
    generator = SDKGenerator(config)
    
    # Generate SDKs
    try:
        if args.all:
            # Generate all SDKs
            results = generator.generate_all_sdks()
            logger.info(f"Generated SDKs for all languages in {results['base_directory']}")
            for language, result in results["results"].items():
                if result["success"]:
                    logger.info(f"  - {language}: {result['output_dir']}")
                else:
                    logger.error(f"  - {language}: Failed - {result.get('error', 'Unknown error')}")
        elif args.language:
            # Generate SDK for specific language
            result = generator.generate_sdk(args.language)
            if result["success"]:
                logger.info(f"Generated {args.language} SDK in {result['output_dir']}")
            else:
                logger.error(f"Failed to generate {args.language} SDK: {result.get('error', 'Unknown error')}")
                sys.exit(1)
        else:
            # No language specified
            logger.error("No language specified. Use --language or --all")
            parser.print_help()
            sys.exit(1)
    except Exception as e:
        logger.error(f"Error generating SDK: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()