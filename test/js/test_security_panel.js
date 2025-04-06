/**
 * Tests for the Security Panel Component
 */

const { describe, it, beforeEach, afterEach, expect, jest, test } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Import modules
const SecurityPanel = require('../../hallucinate_app/node/dashboard/security/security_panel');
const SecurityIntegration = require('../../hallucinate_app/node/dashboard/security/security_integration');

// Mock dependencies
const mockEventBus = {
  on: jest.fn(),
  emit: jest.fn()
};

// Mock DOM elements
function setupMockDOM() {
  // Create necessary elements
  const container = document.createElement('div');
  container.id = 'security-panel-container';
  document.body.appendChild(container);
  
  return {
    container
  };
}

describe('Security Panel Component', () => {
  let securityPanel;
  let mockDOM;
  let mockUcanManager;
  
  beforeEach(() => {
    // Setup Mock DOM
    mockDOM = setupMockDOM();
    
    // Mock UCAN manager
    mockUcanManager = {
      listPrincipals: jest.fn().mockResolvedValue([
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
        }
      ]),
      
      listCapabilities: jest.fn().mockResolvedValue([
        {
          id: 'cap1',
          capability: 'pyarrow:index:admin',
          resource: {},
          issuer: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
          audience: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
          issuedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          expiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          rawToken: {}
        },
        {
          id: 'cap2',
          capability: 'pyarrow:index:write',
          resource: { path: '/datasets' },
          issuer: 'did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD',
          audience: 'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS',
          issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          expiration: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          rawToken: {}
        }
      ]),
      
      issueCapability: jest.fn().mockResolvedValue('mock-token'),
      revokeCapability: jest.fn().mockResolvedValue(true),
      generateDid: jest.fn().mockResolvedValue('did:key:mockGenerated12345'),
      addPrincipal: jest.fn().mockImplementation((principal) => {
        return {
          ...principal,
          created: new Date().toISOString()
        };
      })
    };
    
    // Create security panel instance
    securityPanel = new SecurityPanel({
      container: mockDOM.container,
      ucanManager: mockUcanManager,
      eventBus: mockEventBus
    });
  });
  
  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });
  
  it('should initialize successfully', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Check that it's initialized
    expect(securityPanel.initialized).toBe(true);
    
    // Verify DOM setup
    expect(mockDOM.container.querySelector('.security-panel')).not.toBeNull();
    expect(mockDOM.container.querySelector('.tabs')).not.toBeNull();
    
    // Verify that data was loaded
    expect(mockUcanManager.listPrincipals).toHaveBeenCalled();
    expect(mockUcanManager.listCapabilities).toHaveBeenCalled();
    
    // Verify event emission
    expect(mockEventBus.emit).toHaveBeenCalledWith('security-panel-initialized', { success: true });
  });
  
  it('should render principals tab', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Verify principals tab content
    const principalsTab = mockDOM.container.querySelector('#tab-principals');
    expect(principalsTab).not.toBeNull();
    expect(principalsTab.classList.contains('active')).toBe(true);
    
    // Verify principals list
    const principalsList = mockDOM.container.querySelector('#principals-list');
    expect(principalsList).not.toBeNull();
    
    // Should have 2 principals (based on mock data)
    const principalRows = principalsList.querySelectorAll('.principal-row');
    expect(principalRows.length).toBe(2);
    
    // First row should contain Admin User
    expect(principalRows[0].textContent).toContain('Admin User');
  });
  
  it('should render capabilities tab when selected', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Get the capabilities tab button
    const tabButton = mockDOM.container.querySelector('[data-tab="capabilities"]');
    expect(tabButton).not.toBeNull();
    
    // Click on the tab button to switch tabs
    tabButton.click();
    
    // Verify that capabilities tab is now active
    const capabilitiesTab = mockDOM.container.querySelector('#tab-capabilities');
    expect(capabilitiesTab).not.toBeNull();
    expect(capabilitiesTab.classList.contains('active')).toBe(true);
    
    // Verify that principals tab is no longer active
    const principalsTab = mockDOM.container.querySelector('#tab-principals');
    expect(principalsTab.classList.contains('active')).toBe(false);
    
    // Verify capabilities list
    const capabilitiesList = mockDOM.container.querySelector('#capabilities-list');
    expect(capabilitiesList).not.toBeNull();
    
    // Should have 2 capabilities (based on mock data)
    const capabilityRows = capabilitiesList.querySelectorAll('.capability-row');
    expect(capabilityRows.length).toBe(2);
    
    // First row should contain admin capability
    expect(capabilityRows[0].textContent).toContain('Admin');
  });
  
  it('should open create capability dialog', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Get the create capability button
    const createButton = mockDOM.container.querySelector('#btn-create-capability');
    expect(createButton).not.toBeNull();
    
    // Click on the button to open dialog
    createButton.click();
    
    // Verify that dialog is visible
    const dialog = mockDOM.container.querySelector('#create-capability-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.style.display).toBe('flex');
    
    // Verify form elements
    expect(dialog.querySelector('#capability-type')).not.toBeNull();
    expect(dialog.querySelector('#resource-type')).not.toBeNull();
    expect(dialog.querySelector('#resource-value')).not.toBeNull();
    expect(dialog.querySelector('#recipient-did')).not.toBeNull();
  });
  
  it('should create a new capability', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Open the dialog
    const createButton = mockDOM.container.querySelector('#btn-create-capability');
    createButton.click();
    
    // Get the dialog and form
    const dialog = mockDOM.container.querySelector('#create-capability-dialog');
    
    // Fill in form fields
    dialog.querySelector('#capability-type').value = 'pyarrow:index:read';
    dialog.querySelector('#resource-type').value = 'path';
    dialog.querySelector('#resource-value').value = '/public/data';
    dialog.querySelector('#recipient-did').value = 'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS';
    dialog.querySelector('#expiration').value = '30';
    
    // Submit the form
    dialog.querySelector('#btn-create-capability-confirm').click();
    
    // Verify that the form was submitted
    expect(mockUcanManager.issueCapability).toHaveBeenCalledWith(
      'pyarrow:index:read',
      { path: '/public/data' },
      'did:key:z6MkhGtFL9DXvn7RCvs5cQPSMjgXumsjSxyCXt5RJNPVVJsS',
      30 * 24 * 60 * 60
    );
  });
  
  it('should open add principal dialog', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Get the add principal button
    const addButton = mockDOM.container.querySelector('#btn-add-principal');
    expect(addButton).not.toBeNull();
    
    // Click on the button to open dialog
    addButton.click();
    
    // Verify that dialog is visible
    const dialog = mockDOM.container.querySelector('#add-principal-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.style.display).toBe('flex');
    
    // Verify form elements
    expect(dialog.querySelector('#principal-name')).not.toBeNull();
    expect(dialog.querySelector('#principal-type')).not.toBeNull();
    expect(dialog.querySelector('#principal-did')).not.toBeNull();
  });
  
  it('should add a new principal', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Open the dialog
    const addButton = mockDOM.container.querySelector('#btn-add-principal');
    addButton.click();
    
    // Get the dialog and form
    const dialog = mockDOM.container.querySelector('#add-principal-dialog');
    
    // Fill in form fields
    dialog.querySelector('#principal-name').value = 'Test User';
    dialog.querySelector('#principal-type').value = 'user';
    dialog.querySelector('#principal-did').value = 'did:key:testuser123';
    
    // Submit the form
    dialog.querySelector('#btn-add-principal-confirm').click();
    
    // Verify that the form was submitted
    expect(mockUcanManager.addPrincipal).toHaveBeenCalledWith({
      name: 'Test User',
      type: 'user',
      did: 'did:key:testuser123'
    });
  });
  
  it('should select and show principal details', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Get the principal rows
    const principalRows = mockDOM.container.querySelectorAll('.principal-row');
    expect(principalRows.length).toBe(2);
    
    // Click on the first principal row
    principalRows[0].click();
    
    // Verify that the principal is selected
    expect(securityPanel.selectedPrincipal).not.toBeNull();
    expect(securityPanel.selectedPrincipal.name).toBe('Admin User');
    
    // Verify that the principal details panel is visible
    const detailsPanel = mockDOM.container.querySelector('#principal-details');
    expect(detailsPanel).not.toBeNull();
    expect(detailsPanel.style.display).toBe('block');
    
    // Verify details content
    expect(detailsPanel.textContent).toContain('Admin User');
    expect(detailsPanel.textContent).toContain('did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD');
  });
  
  it('should switch to capabilities tab and select a capability', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Switch to capabilities tab
    const tabButton = mockDOM.container.querySelector('[data-tab="capabilities"]');
    tabButton.click();
    
    // Get the capability rows
    const capabilityRows = mockDOM.container.querySelectorAll('.capability-row');
    expect(capabilityRows.length).toBe(2);
    
    // Click on the first capability row
    capabilityRows[0].click();
    
    // Verify that the capability is selected
    expect(securityPanel.selectedCapability).not.toBeNull();
    expect(securityPanel.selectedCapability.capability).toBe('pyarrow:index:admin');
    
    // Verify that the capability details panel is visible
    const detailsPanel = mockDOM.container.querySelector('#capability-details');
    expect(detailsPanel).not.toBeNull();
    expect(detailsPanel.style.display).toBe('block');
    
    // Verify details content
    expect(detailsPanel.textContent).toContain('Admin');
    expect(detailsPanel.textContent).toContain('did:key:z6MkgYrkCkqA8aFHCKbpSK6H884kyrYrZQHsPXyYuMkw5ZBD');
  });
  
  it('should show revoke confirmation dialog', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Switch to capabilities tab
    const tabButton = mockDOM.container.querySelector('[data-tab="capabilities"]');
    tabButton.click();
    
    // Get the revoke button on the first capability
    const revokeButton = mockDOM.container.querySelector('.capability-row .revoke-button');
    expect(revokeButton).not.toBeNull();
    
    // Click on the revoke button
    revokeButton.click();
    
    // Verify that the confirmation dialog is visible
    const dialog = mockDOM.container.querySelector('#confirm-revoke-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.style.display).toBe('flex');
    
    // Verify dialog content
    expect(dialog.textContent).toContain('Are you sure you want to revoke this capability?');
    expect(dialog.textContent).toContain('Admin');
  });
  
  it('should revoke a capability', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Switch to capabilities tab
    const tabButton = mockDOM.container.querySelector('[data-tab="capabilities"]');
    tabButton.click();
    
    // Get the revoke button on the first capability
    const revokeButton = mockDOM.container.querySelector('.capability-row .revoke-button');
    revokeButton.click();
    
    // Get the confirmation dialog
    const dialog = mockDOM.container.querySelector('#confirm-revoke-dialog');
    
    // Click the confirm button
    dialog.querySelector('#btn-confirm-revoke').click();
    
    // Verify that revoke was called
    expect(mockUcanManager.revokeCapability).toHaveBeenCalledWith('cap1');
  });
  
  it('should dispose correctly', async () => {
    // Initialize the panel
    await securityPanel.init();
    
    // Dispose the panel
    securityPanel.dispose();
    
    // Verify that initialized flag is reset
    expect(securityPanel.initialized).toBe(false);
    
    // Verify that the container is empty
    expect(mockDOM.container.innerHTML).toBe('');
  });
});

describe('Security Integration Module', () => {
  let securityIntegration;
  let mockDOM;
  let mockPyarrowIndex;
  let mockUcanManager;
  
  beforeEach(() => {
    // Setup Mock DOM
    mockDOM = setupMockDOM();
    
    // Mock PyArrow Index
    mockPyarrowIndex = {
      init: jest.fn().mockResolvedValue(true),
      lookup: jest.fn().mockResolvedValue({ cid: 'test-cid', path: '/test/path' }),
      query: jest.fn().mockResolvedValue([
        { cid: 'test-cid-1', path: '/test/path-1' },
        { cid: 'test-cid-2', path: '/test/path-2' }
      ])
    };
    
    // Mock UCAN Manager
    mockUcanManager = {
      listPrincipals: jest.fn().mockResolvedValue([]),
      listCapabilities: jest.fn().mockResolvedValue([]),
      verifyCapability: jest.fn().mockResolvedValue(true)
    };
    
    // Create security integration instance
    securityIntegration = new SecurityIntegration({
      container: mockDOM.container,
      ucanManager: mockUcanManager,
      eventBus: mockEventBus,
      pyarrowIndex: mockPyarrowIndex,
      onError: jest.fn()
    });
  });
  
  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });
  
  it('should initialize successfully', async () => {
    // Initialize the integration
    await securityIntegration.init();
    
    // Check that it's initialized
    expect(securityIntegration.initialized).toBe(true);
    
    // Verify event emission
    expect(mockEventBus.emit).toHaveBeenCalledWith('security-integration-initialized', { success: true });
  });
  
  it('should check capabilities correctly', async () => {
    // Initialize the integration
    await securityIntegration.init();
    
    // Check a capability
    const result = await securityIntegration.checkCapability('pyarrow:index:read', { path: '/test/path' });
    
    // Verify result
    expect(result).toBe(true);
    
    // Verify UCAN manager was called
    expect(mockUcanManager.verifyCapability).toHaveBeenCalledWith(
      'current-token',
      'pyarrow:index:read',
      { path: '/test/path' }
    );
    
    // Verify event was emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith('security-event', {
      type: 'capability-check',
      capability: 'pyarrow:index:read',
      resource: { path: '/test/path' },
      result: true
    });
  });
  
  it('should create a mock UCAN manager when not provided', async () => {
    // Create integration without UCAN manager
    const integrationWithoutUCAN = new SecurityIntegration({
      container: mockDOM.container,
      eventBus: mockEventBus,
      pyarrowIndex: mockPyarrowIndex,
      onError: jest.fn(),
      useMockImplementation: true
    });
    
    // Initialize
    await integrationWithoutUCAN.init();
    
    // Verify that a mock UCAN manager was created
    expect(integrationWithoutUCAN.ucanManager).not.toBeNull();
    
    // Test that the mock manager works
    const result = await integrationWithoutUCAN.checkCapability('pyarrow:index:read', { path: '/test/path' });
    expect(result).toBe(true);
  });
  
  it('should handle content selected events', async () => {
    // Initialize the integration
    await securityIntegration.init();
    
    // Create a spy on the _handleContentSelected method
    const spy = jest.spyOn(securityIntegration, '_handleContentSelected');
    
    // Simulate content selected event
    securityIntegration._handleContentSelected({
      cid: 'test-cid',
      path: '/test/path'
    });
    
    // Verify the method was called
    expect(spy).toHaveBeenCalledWith({
      cid: 'test-cid',
      path: '/test/path'
    });
  });
  
  it('should handle principal selected events', async () => {
    // Initialize the integration
    await securityIntegration.init();
    
    // Create a spy on the _handlePrincipalSelected method
    const spy = jest.spyOn(securityIntegration, '_handlePrincipalSelected');
    
    // Simulate principal selected event
    securityIntegration._handlePrincipalSelected({
      did: 'did:key:test',
      name: 'Test Principal'
    });
    
    // Verify the method was called
    expect(spy).toHaveBeenCalledWith({
      did: 'did:key:test',
      name: 'Test Principal'
    });
  });
  
  it('should dispose correctly', async () => {
    // Initialize the integration
    await securityIntegration.init();
    
    // Dispose
    securityIntegration.dispose();
    
    // Verify initialized flag is reset
    expect(securityIntegration.initialized).toBe(false);
    
    // Verify security panel is disposed
    expect(securityIntegration.securityPanel).toBeNull();
  });
});