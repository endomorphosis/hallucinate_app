"""
Basic test for the UCAN authentication package
"""

import os
import sys
import time
import asyncio
import tempfile
from pathlib import Path

# Add the parent directory to the path so we can import ucan_auth_py
sys.path.append(str(Path(__file__).parent))

# Import the modules to test
from ucan_auth_py import AuthManager
from ucan_auth_py.core import Principal, Capability, Token


async def main():
    print("Running basic UCAN auth tests...")
    
    # Create a temporary directory for auth data
    with tempfile.TemporaryDirectory() as temp_dir:
        # Initialize auth manager
        auth_manager = AuthManager(storage_location=temp_dir)
        await auth_manager.init()
        print(f"AuthManager initialized: {auth_manager.initialized}")
        
        # Test creating principals
        print("\nTesting principal creation...")
        root = await auth_manager.create_root_principal()
        print(f"Root principal created: {root.did}")
        
        user = await auth_manager.create_principal("user")
        print(f"User principal created: {user.did}")
        
        # Test issuing capabilities
        print("\nTesting capability issuance...")
        capability = {
            "can": "read",
            "with": "document:1",
            "limits": {
                "max_size": 1024
            }
        }
        
        token_data = await auth_manager.issue_capability("root", "user", capability)
        print(f"Capability issued: {token_data['capability']}")
        
        # Test getting a capability token
        print("\nTesting capability token retrieval...")
        token = await auth_manager.get_capability_token("read:document:1")
        print(f"Got capability token: {token[:30]}...")
        
        # Test verifying a capability
        print("\nTesting capability verification...")
        verified = await auth_manager.verify_capability(token, "read:document:1")
        print(f"Capability verification: {verified}")
        
        # Test revoking a capability
        print("\nTesting capability revocation...")
        token_id = None
        for tid, t in auth_manager.tokens.items():
            if t["token"] == token:
                token_id = tid
                break
        
        if token_id:
            revoked = await auth_manager.revoke_capability(token_id)
            print(f"Capability revoked: {revoked}")
            
            # Verify the revoked capability is no longer valid
            verified = await auth_manager.verify_capability(token, "read:document:1")
            print(f"Revoked capability verification (should be False): {verified}")
        
        # Test the auth manager's test method
        print("\nTesting auth manager's test method...")
        test_results = await auth_manager.test()
        print(f"Test success: {test_results['success']}")
        if not test_results['success']:
            print(f"Test error: {test_results.get('error')}")
        
        # Additional tests for core components
        print("\nTesting core components directly...")
        
        # Create principals
        principal1 = Principal()
        principal2 = Principal()
        print(f"Principal 1 DID: {principal1.did}")
        print(f"Principal 2 DID: {principal2.did}")
        
        # Create a capability
        cap = Capability("write", "document:2", {"max_size": 2048})
        print(f"Capability: {cap}")
        
        # Create a token
        token = Token(
            issuer=principal1,
            audience=principal2,
            capabilities=[cap],
            expiration=time.time() + 3600  # 1 hour from now
        )
        
        # Export the token
        exported_token = await token.export()
        print(f"Exported token: {exported_token[:30]}...")
        
        # Import the token
        imported_token = await Token.import_token(exported_token)
        print(f"Imported token issuer DID: {imported_token.issuer.did}")
        
        # Verify the token
        token_valid = await imported_token.verify()
        print(f"Token verification: {token_valid}")
        
        # Check capabilities
        has_cap = await imported_token.has_capability(Capability("write", "document:2"))
        print(f"Token has capability: {has_cap}")


if __name__ == "__main__":
    asyncio.run(main())