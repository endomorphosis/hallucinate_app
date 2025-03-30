"""
UCAN Authentication Package for Python

This package implements the User Controlled Authorization Networks (UCAN) protocol
specification, providing a capability-based security model for decentralized applications.

Main components:
- AuthManager: Main class for managing UCAN authentication
- Principal: Entity that can issue or receive capabilities
- Capability: Permission to perform a specific action on a specific resource
- Token: Signed proof of capabilities that can be verified
"""

__version__ = '0.1.0'

from .core.principal import Principal
from .core.capability import Capability
from .core.token import Token
from .auth_manager import AuthManager

# Export key classes
__all__ = [
    'AuthManager',
    'Principal',
    'Capability',
    'Token',
]
