#!/usr/bin/env python3
"""
UCAN Authentication Core Module

Implements the core UCAN classes:
- UcanPrincipal: Represents a principal with an Ed25519 key pair.
- UcanCapability: Represents a capability with a specific action and resource.
- UcanToken: Represents a UCAN token that encapsulates issuer, audience, capabilities, and an expiration time.
"""

import time
import json
import base64
from nacl import signing, exceptions
from nacl.encoding import HexEncoder

class UcanPrincipal:
    def __init__(self, private_key_hex: str = None):
        if private_key_hex:
            self.signing_key = signing.SigningKey(private_key_hex, encoder=HexEncoder)
        else:
            self.signing_key = signing.SigningKey.generate()
        self.verify_key = self.signing_key.verify_key
        self.did = f"did:example:{self.verify_key.encode(encoder=HexEncoder).decode()}"

    def sign(self, message: bytes) -> bytes:
        """Signs a message using the principal's private key."""
        return self.signing_key.sign(message).signature

    def to_dict(self):
        return {
            "did": self.did,
            "public_key": self.verify_key.encode(encoder=HexEncoder).decode()
        }

class UcanCapability:
    def __init__(self, action: str, resource: str, caveats: dict = None):
        self.action = action
        self.resource = resource
        self.caveats = caveats or {}

    def to_dict(self):
        return {
            "action": self.action,
            "resource": self.resource,
            "caveats": self.caveats
        }

class UcanToken:
    def __init__(self, issuer: UcanPrincipal, audience: UcanPrincipal, capabilities: list, expiration: int):
        """
        Initialize a UCAN token.
        :param issuer: The principal issuing the token.
        :param audience: The intended audience for the token.
        :param capabilities: A list of UcanCapability objects.
        :param expiration: Unix timestamp when the token expires.
        """
        self.issuer = issuer
        self.audience = audience
        self.capabilities = capabilities  # List[UcanCapability]
        self.expiration = expiration
        self.signature = None

    def to_dict(self, include_signature: bool = False):
        data = {
            "issuer": self.issuer.to_dict(),
            "audience": self.audience.to_dict(),
            "capabilities": [cap.to_dict() for cap in self.capabilities],
            "expiration": self.expiration
        }
        if include_signature and self.signature:
            data["signature"] = base64.b64encode(self.signature).decode()
        return data

    def sign(self):
        """
        Creates a JSON representation of the token (with sorted keys) and signs it using the issuer's private key.
        """
        token_data = json.dumps(self.to_dict(), sort_keys=True).encode()
        self.signature = self.issuer.sign(token_data)
        return self.signature

    def verify(self):
        """
        Verifies the token's signature using the issuer's public key and checks token expiration.
        Returns True if valid, False otherwise.
        """
        if not self.signature:
            return False

        token_data = json.dumps(self.to_dict(), sort_keys=True).encode()
        try:
            self.issuer.verify_key.verify(token_data, self.signature)
        except exceptions.BadSignatureError:
            return False

        if time.time() > self.expiration:
            return False
        return True

# When executed as a script, perform a simple demonstration of token issuance and verification.
if __name__ == "__main__":
    issuer = UcanPrincipal()
    audience = UcanPrincipal()
    capability = UcanCapability("read", "resource:example", {"limit": 5})
    expiration = int(time.time()) + 3600  # Token expires in 1 hour
    token = UcanToken(issuer, audience, [capability], expiration)
    token.sign()
    valid = token.verify()
    print("PASS" if valid else "FAIL")
