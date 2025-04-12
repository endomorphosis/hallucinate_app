/**
 * Security Integration Module
 * Integrates Security Panel with PyArrow Content Index Dashboard
 */

import SecurityPanel from './security_panel.js';

class SecurityIntegration {
  /**
   * Create a new security integration
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Object} options.ucanManager - UCAN manager for capability management
   * @param {Object} options.eventBus - Event bus for communication
   * @param {Object} options.pyarrowIndex - PyArrow index instance
   * @param {Function} options.onError - Error handler function
   */
  constructor(options = {}) {
    this.container = options.container;
    this.ucanManager = options.ucanManager;
    this.eventBus = options.eventBus || { on: () => {}, emit: () => {} };
    this.pyarrowIndex = options.pyarrowIndex;
    this.onError = options.onError || console.error;
    
    // Component state
    this.initialized = false;
    this.securityPanel = null;
    
    // Mock implementation flag for development
    this.useMockImplementation = options.useMockImplementation || false;
    
    // Bind methods
    this._handleContentSelected = this._handleContentSelected.bind(this);
    this._handlePrincipalSelected = this._handlePrincipalSelected.bind(this);
    this._handleSecurityEvent = this._handleSecurityEvent.bind(this);
  }
  
  /**
   * Initialize the security integration
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Create container if not exists
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'security-integration-container';
        document.body.appendChild(this.container);
      }
      
      // Load CSS
      await this._loadStyles();
      
      // Create UCAN manager if not provided
      if (!this.ucanManager) {
        this.ucanManager = await this._createMockUcanManager();
      }
      
      // Initialize security panel
      this.securityPanel = new SecurityPanel({
        container: this.container,
        ucanManager: this.ucanManager,
        eventBus: this.eventBus
      });
      
      await this.securityPanel.init();
      
      // Set up events
      this._setupEventListeners();
      
      this.initialized = true;
      this.eventBus.emit('security-integration-initialized', { success: true });
      
      return true;
    } catch (error) {
      this.onError('Failed to initialize security integration:', error);
      this.eventBus.emit('security-integration-error', { 
        error: error.message, 
        phase: 'initialization' 
      });
      throw error;
    }
  }
  
  /**
   * Load security panel styles
   * @private
   * @returns {Promise<void>}
   */
  async _loadStyles() {
    return new Promise((resolve, reject) => {
      // Check if styles are already loaded
      if (document.querySelector('link[href$="security_panel.css"]')) {
        resolve();
        return;
      }
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './dashboard/security/security_panel.css';
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }
  
  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for content selection from main dashboard
    this.eventBus.on('content-selected', this._handleContentSelected);
    
    // Listen for principal selection from other components
    this.eventBus.on('principal-selected', this._handlePrincipalSelected);
    
    // Listen for security events
    this.eventBus.on('security-event', this._handleSecurityEvent);
    
    // Forward security panel events to main dashboard
    this.eventBus.on('security-panel-initialized', (data) => {
      this.eventBus.emit('component-initialized', {
        component: 'security-panel',
        success: data.success
      });
    });
    
    this.eventBus.on('security-panel-error', (data) => {
      this.eventBus.emit('component-error', {
        component: 'security-panel',
        error: data.error,
        phase: data.phase
      });
    });
  }
  
  /**
   * Handle content selected event
   * @private
   * @param {Object} content - Selected content
   */
  _handleContentSelected(content) {
    // Forward to security panel
    if (this.securityPanel) {
      // Check if we have capability information
      if (content.cid) {
        this._checkContentCapabilities(content);
      }
    }
  }
  
  /**
   * Handle principal selected event
   * @private
   * @param {Object} principal - Selected principal
   */
  _handlePrincipalSelected(principal) {
    // Forward to security panel
    if (this.securityPanel && principal) {
      // Pass through event
    }
  }
  
  /**
   * Handle security event
   * @private
   * @param {Object} event - Security event data
   */
  _handleSecurityEvent(event) {
    // Handle security events (like failed verifications)
    console.log('Security event received:', event);
    
    // Could show UI notifications, update status indicators, etc.
  }
  
  /**
   * Check content capabilities
   * @private
   * @param {Object} content - Content object
   * @returns {Promise<void>}
   */
  async _checkContentCapabilities(content) {
    try {
      // This would check what capabilities the current user has for this content
      const capabilities = await this.ucanManager.getCapabilitiesForResource({
        cid: content.cid
      });
      
      // Emit event with capability information
      this.eventBus.emit('content-capabilities', {
        content,
        capabilities
      });
    } catch (error) {
      this.onError('Failed to check content capabilities:', error);
    }
  }
  
  /**
   * Create a mock UCAN manager for development
   * @private
   * @returns {Promise<Object>} Mock UCAN manager
   */
  async _createMockUcanManager() {
    // This is a mock implementation for development
    console.warn('Using mock UCAN manager for development');
    
    // Sample data
    const principals = [
      {
        did: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
        name: 'Admin User',
        type: 'user',
        created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        did: 'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS',
        name: 'Content Manager',
        type: 'user',
        created: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        did: 'did:key:z6MktGVfvUYSZGGz9PxmZ4CS6ZBd1VChMqQwZdvzvkX6TrEQ',
        name: 'API Service',
        type: 'service',
        created: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    const capabilities = [
      {
        id: 'cap1',
        capability: 'pyarrow:index:admin',
        resource: {},
        issuer: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
        audience: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
        issuedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        rawToken: { /* Mock token data */ }
      },
      {
        id: 'cap2',
        capability: 'pyarrow:index:write',
        resource: { path: '/datasets' },
        issuer: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
        audience: 'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS',
        issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        expiration: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        rawToken: { /* Mock token data */ }
      },
      {
        id: 'cap3',
        capability: 'pyarrow:index:read',
        resource: { path: '/datasets/public' },
        issuer: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
        audience: 'did:key:z6MktGVfvUYSZGGz9PxmZ4CS6ZBd1VChMqQwZdvzvkX6TrEQ',
        issuedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        expiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        rawToken: { /* Mock token data */ }
      },
      {
        id: 'cap4',
        capability: 'pyarrow:index:read',
        resource: { cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' },
        issuer: 'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS',
        audience: 'did:key:z6MktGVfvUYSZGGz9PxmZ4CS6ZBd1VChMqQwZdvzvkX6TrEQ',
        issuedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        rawToken: { /* Mock token data */ }
      }
    ];
    
    // Return mock implementation
    return {
      listPrincipals: async () => [...principals],
      
      listCapabilities: async () => [...capabilities],
      
      addPrincipal: async (principal) => {
        const newPrincipal = {
          ...principal,
          created: new Date().toISOString()
        };
        principals.push(newPrincipal);
        return newPrincipal;
      },
      
      issueCapability: async (capability, resource, audience, expiration) => {
        const now = new Date();
        const expirationDate = new Date(now.getTime() + expiration * 1000);
        
        const newCapability = {
          id: `cap${capabilities.length + 1}`,
          capability,
          resource,
          issuer: principals[0].did, // Admin is always the issuer in mock
          audience,
          issuedAt: now.toISOString(),
          expiration: expirationDate.toISOString(),
          rawToken: {
            payload: {
              iss: principals[0].did,
              aud: audience,
              exp: Math.floor(expirationDate.getTime() / 1000),
              nbf: Math.floor(now.getTime() / 1000),
              att: [
                {
                  cap: capability,
                  with: resource
                }
              ]
            }
          }
        };
        
        capabilities.push(newCapability);
        return 'mock-token';
      },
      
      revokeCapability: async (id) => {
        const index = capabilities.findIndex(cap => cap.id === id);
        if (index !== -1) {
          capabilities.splice(index, 1);
          return true;
        }
        return false;
      },
      
      verifyCapability: async (token, capability, resource) => {
        // In mock, always return true for admin, simulate checks for others
        if (capability === 'pyarrow:index:admin') {
          return true;
        }
        
        if (capability === 'pyarrow:index:read') {
          // Check if there's a matching resource
          return capabilities.some(cap => 
            (cap.capability === 'pyarrow:index:read' || 
             cap.capability === 'pyarrow:index:write' || 
             cap.capability === 'pyarrow:index:admin') && 
            this._resourceMatches(cap.resource, resource)
          );
        }
        
        if (capability === 'pyarrow:index:write') {
          // Check if there's a matching resource
          return capabilities.some(cap => 
            (cap.capability === 'pyarrow:index:write' || 
             cap.capability === 'pyarrow:index:admin') && 
            this._resourceMatches(cap.resource, resource)
          );
        }
        
        return false;
      },
      
      generateDid: async () => {
        // Generate a random mock DID
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `did:key:z${randomStr}`;
      },
      
      getCapabilitiesForResource: async (resource) => {
        // Return capabilities that match the resource
        return capabilities.filter(cap => this._resourceMatches(cap.resource, resource));
      }
    };
  }
  
  /**
   * Check if resources match for capability verification
   * @private
   * @param {Object} capResource - Capability resource
   * @param {Object} reqResource - Requested resource
   * @returns {boolean} Whether resources match
   */
  _resourceMatches(capResource, reqResource) {
    // Empty resource in capability means it applies to all resources
    if (!capResource || Object.keys(capResource).length === 0) {
      return true;
    }
    
    // If resource types don't match, they can't match
    const capType = Object.keys(capResource)[0];
    const reqType = Object.keys(reqResource)[0];
    
    if (capType !== reqType) {
      return false;
    }
    
    const capValue = capResource[capType];
    const reqValue = reqResource[reqType];
    
    // Exact match
    if (capValue === reqValue) {
      return true;
    }
    
    // Path matching (check if requested path is under capability path)
    if (capType === 'path' && reqType === 'path') {
      return reqValue.startsWith(capValue + '/') || reqValue === capValue;
    }
    
    // Pattern matching would go here, but simplified for mock
    
    return false;
  }
  
  /**
   * Check if a capability is valid for a resource
   * @param {string} capability - Capability to check
   * @param {Object} resource - Resource to check against
   * @returns {Promise<boolean>} Whether capability is valid
   */
  async checkCapability(capability, resource) {
    try {
      // In a real implementation, this would verify a token
      const result = await this.ucanManager.verifyCapability(
        'current-token', // Would be a real token
        capability,
        resource
      );
      
      // Log the verification attempt
      this.eventBus.emit('security-event', {
        type: 'capability-check',
        capability,
        resource,
        result
      });
      
      return result;
    } catch (error) {
      this.onError('Capability check failed:', error);
      
      this.eventBus.emit('security-event', {
        type: 'capability-check-error',
        capability,
        resource,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Dispose and clean up resources
   * @returns {void}
   */
  dispose() {
    // Remove event listeners
    this.eventBus.on('content-selected', this._handleContentSelected);
    this.eventBus.on('principal-selected', this._handlePrincipalSelected);
    this.eventBus.on('security-event', this._handleSecurityEvent);
    
    // Dispose security panel
    if (this.securityPanel) {
      this.securityPanel.dispose();
      this.securityPanel = null;
    }
    
    this.initialized = false;
  }
}

// Export component
export default SecurityIntegration;