"""
Capability implementation for UCAN
"""

from typing import Dict, List, Optional, Any, Union


class Capability:
    """
    Capability represents a permission to perform a specific action on a resource
    
    A capability has:
    - Action: The action that can be performed ("can")
    - Resource: The resource the action can be performed on ("with")
    - Limitations: Optional constraints on the capability ("limits")
    """
    
    def __init__(self, action: str, resource: str, limitations: Optional[Dict[str, Any]] = None):
        """
        Initialize a capability
        
        Args:
            action: The action that can be performed
            resource: The resource the action can be performed on
            limitations: Optional constraints on the capability
        """
        self.action = action  # "can" in UCAN spec
        self.resource = resource  # "with" in UCAN spec
        self.limitations = limitations or {}  # "limits" in UCAN spec
    
    def matches(self, required: 'Capability') -> bool:
        """
        Check if this capability matches (satisfies) a required capability
        
        Args:
            required: The required capability
            
        Returns:
            bool: True if this capability satisfies the required capability
        """
        # Check action
        if self.action != required.action and self.action != "*":
            return False
            
        # Check resource
        if self.resource != required.resource and self.resource != "*":
            # Special case: prefix match with wildcard
            if self.resource.endswith("/*") and required.resource.startswith(self.resource[:-1]):
                pass  # Allow prefix match
            else:
                return False
                
        # Check limitations (all required limitations must be satisfied)
        for limit_key, limit_value in required.limitations.items():
            if limit_key not in self.limitations:
                return False
                
            # Different limitation types require different comparison logic
            if isinstance(limit_value, (int, float)):
                # Numeric: this must be >= required
                if self.limitations[limit_key] < limit_value:
                    return False
            elif isinstance(limit_value, list):
                # List: all required items must be in this list
                if not all(item in self.limitations[limit_key] for item in limit_value):
                    return False
            else:
                # Default: exact match
                if self.limitations[limit_key] != limit_value:
                    return False
                    
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize capability to dictionary
        
        Returns:
            dict: Capability data
        """
        return {
            "can": self.action,
            "with": self.resource,
            "limits": self.limitations
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Capability':
        """
        Create capability from dictionary
        
        Args:
            data: Dictionary with capability data
            
        Returns:
            Capability: Created capability
        """
        return cls(
            action=data.get("can"),
            resource=data.get("with"),
            limitations=data.get("limits", {})
        )
    
    def __str__(self) -> str:
        """
        String representation of capability
        
        Returns:
            str: String representation
        """
        if self.limitations:
            return f"{self.action}:{self.resource} {self.limitations}"
        else:
            return f"{self.action}:{self.resource}"
