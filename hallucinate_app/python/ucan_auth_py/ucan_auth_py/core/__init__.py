"""
Core components of the UCAN authentication system.

This package includes the fundamental classes required for UCAN operation:
- Principal: Identity with cryptographic capabilities
- Capability: Permission to perform an action on a resource
- Token: Signed proof of delegation
"""

from .principal import Principal
from .capability import Capability
from .token import Token

__all__ = ['Principal', 'Capability', 'Token']
