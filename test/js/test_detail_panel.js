/**
 * Detail Panel Integration Tests
 * 
 * Tests for the content detail panel functionality in PyArrow Content Index Dashboard
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestDetailPanel {
  constructor() {
    this.testResults = {};
  }

  /**
   * Sets up the test environment with DOM
   */
  setupTestEnvironment() {
    // Create DOM environment
    this.dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true
    });
    
    // Set up globals
    global.window = this.dom.window;
    global.document = this.dom.window.document;
    global.HTMLElement = this.dom.window.HTMLElement;
    
    // Mock clipboard API - attach to window instead of setting global navigator
    this.dom.window.navigator.clipboard = {
      writeText: (text) => Promise.resolve(text)
    };
    
    // Mock FontAwesome classes
    const style = document.createElement('style');
    style.textContent = `
      .fas { display: inline-block; width: 16px; height: 16px; }
      .fa-file { content: 'file'; }
      .fa-file-image { content: 'image'; }
      .fa-file-video { content: 'video'; }
      .fa-external-link-alt { content: 'link'; }
      .fa-clipboard { content: 'copy'; }
      .fa-check { content: 'check'; }
      .fa-times { content: 'times'; }
    `;
    document.head.appendChild(style);
    
    // Test container
    this.container = document.getElementById('test-container');
    
    // Mock event bus
    this.mockEventBus = {
      listeners: {},
      on(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
      },
      emit(event, data) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(callback => callback(data));
        }
        return this;
      }
    };
    
    // Use our ES module version of the search discovery module
    const searchDiscoveryPath = '/tmp/test-modules/search_discovery.mjs';
    
    // Load search discovery module if it exists
    if (fs.existsSync(searchDiscoveryPath)) {
      // Dynamic import for ES modules
      return import(searchDiscoveryPath).then(module => {
        this.searchDiscovery = module;
        return true;
      }).catch(error => {
        console.error('Error importing search discovery module:', error);
        return false;
      });
    } else {
      console.error('Search discovery module not found at', searchDiscoveryPath);
      return Promise.resolve(false);
    }
  }
  
  /**
   * Cleans up the test environment
   */
  teardownTestEnvironment() {
    if (this.dom) {
      this.dom.window.close();
      global.window = undefined;
      global.document = undefined;
      global.HTMLElement = undefined;
    }
  }
  
  /**
   * Runs all the tests
   */
  async test() {
    this.testResults = {};
    
    console.log('Setting up test environment...');
    const setupSuccess = await this.setupTestEnvironment();
    if (!setupSuccess) {
      console.error('Failed to set up test environment - required modules not found');
      this.testResults.setup = false;
      return this.testResults;
    }
    
    try {
      console.log('Running tests for content detail panel...');
      
      // Test empty panel
      this.testResults.create_empty_panel = this.testCreateEmptyPanel();
      
      // Test panel with all components
      this.testResults.create_panel_with_components = this.testCreatePanelWithComponents();
      
      // Test content type detection
      this.testResults.content_type_preview = this.testContentTypePreview();
      
      // Test metadata table
      this.testResults.metadata_table = this.testMetadataTable();
      
      // Test locations handling
      this.testResults.locations_handling = this.testLocationsHandling();
      
      // Test preview options
      this.testResults.preview_options = this.testPreviewOptions();
      
      // Test tags handling
      this.testResults.tags_handling = this.testTagsHandling();
      
      // Test tab switching
      this.testResults.tab_switching = this.testTabSwitching();
      
      // Test integration files exist
      this.testResults.integration_files_exist = this.testIntegrationFilesExist();
      
      console.log('Test results:', this.testResults);
    } catch (error) {
      console.error('Error running tests:', error);
    } finally {
      this.teardownTestEnvironment();
    }
    
    return this.testResults;
  }
  
  /**
   * Tests creating an empty detail panel
   */
  testCreateEmptyPanel() {
    try {
      const panel = this.searchDiscovery.createContentDetailPanel(null);
      
      assert.strictEqual(
        panel instanceof HTMLElement, 
        true, 
        'Should return an HTML element'
      );
      
      assert.strictEqual(
        panel.className, 
        'content-detail-panel empty', 
        'Should have empty class'
      );
      
      assert.strictEqual(
        panel.querySelector('.empty-message') !== null, 
        true, 
        'Should have an empty message'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testCreateEmptyPanel:', error);
      return false;
    }
  }
  
  /**
   * Tests creating a panel with all expected components
   */
  testCreatePanelWithComponents() {
    try {
      // Mock content item
      const contentItem = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/datasets/test/image.jpg',
        mimetype: 'image/jpeg',
        size: 1024000,
        timestamp: Date.now(),
        locations: {
          ipfs: 'active',
          huggingface: {
            repo_id: 'test-user/test-repo',
            path: 'images/image.jpg'
          }
        }
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(contentItem, {
        ipfsGateway: 'https://ipfs.io/ipfs/'
      });
      
      // Check main container
      assert.strictEqual(
        panel instanceof HTMLElement, 
        true, 
        'Should return an HTML element'
      );
      
      assert.strictEqual(
        panel.className, 
        'content-detail-panel', 
        'Should have content-detail-panel class'
      );
      
      assert.strictEqual(
        panel.dataset.cid, 
        contentItem.cid, 
        'Should set CID data attribute'
      );
      
      // Check sections exist
      assert.strictEqual(
        panel.querySelector('.detail-top-section') !== null, 
        true, 
        'Should have top section'
      );
      
      assert.strictEqual(
        panel.querySelector('.content-preview-container') !== null, 
        true, 
        'Should have preview container'
      );
      
      assert.strictEqual(
        panel.querySelector('.content-info-panel') !== null, 
        true, 
        'Should have info panel'
      );
      
      assert.strictEqual(
        panel.querySelector('.detail-tabs') !== null, 
        true, 
        'Should have tabs container'
      );
      
      assert.strictEqual(
        panel.querySelector('.tab-content') !== null, 
        true, 
        'Should have tab content'
      );
      
      assert.strictEqual(
        panel.querySelector('.detail-action-bar') !== null, 
        true, 
        'Should have action bar'
      );
      
      // Check tabs exist
      const tabButtons = panel.querySelectorAll('.tab-button');
      assert.strictEqual(
        tabButtons.length, 
        3, 
        'Should have 3 tab buttons'
      );
      
      assert.strictEqual(
        tabButtons[0].textContent, 
        'Metadata', 
        'First tab should be Metadata'
      );
      
      assert.strictEqual(
        tabButtons[1].textContent, 
        'Locations', 
        'Second tab should be Locations'
      );
      
      assert.strictEqual(
        tabButtons[2].textContent, 
        'Preview Options', 
        'Third tab should be Preview Options'
      );
      
      // Check action buttons
      const actionBar = panel.querySelector('.detail-action-bar');
      assert.strictEqual(
        actionBar.querySelectorAll('button').length, 
        3, 
        'Should have 3 action buttons'
      );
      
      assert.strictEqual(
        actionBar.querySelector('.gateway-button') !== null, 
        true, 
        'Should have gateway button'
      );
      
      assert.strictEqual(
        actionBar.querySelector('.copy-button') !== null, 
        true, 
        'Should have copy button'
      );
      
      assert.strictEqual(
        actionBar.querySelector('.close-button') !== null, 
        true, 
        'Should have close button'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testCreatePanelWithComponents:', error);
      return false;
    }
  }
  
  /**
   * Tests preview creation based on content type
   */
  testContentTypePreview() {
    try {
      // Test different content types
      const contentTypes = [
        { 
          mimetype: 'image/png', 
          expectSelector: '.image-preview',
          name: 'image preview'
        },
        { 
          mimetype: 'video/mp4', 
          expectSelector: '.video-preview',
          name: 'video preview'
        },
        { 
          mimetype: 'audio/mp3', 
          expectSelector: '.audio-preview',
          name: 'audio preview'
        },
        { 
          mimetype: 'application/pdf', 
          expectSelector: '.pdf-preview',
          name: 'PDF preview'
        },
        { 
          mimetype: 'text/plain', 
          expectSelector: '.text-preview',
          name: 'text preview'
        },
        { 
          mimetype: 'application/octet-stream', 
          expectSelector: '.preview-placeholder',
          name: 'placeholder for unknown type'
        }
      ];
      
      for (const type of contentTypes) {
        const contentItem = {
          cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
          path: `/test/file.${type.mimetype.split('/')[1]}`,
          mimetype: type.mimetype,
          size: 1024
        };
        
        const panel = this.searchDiscovery.createContentDetailPanel(contentItem);
        const previewElement = panel.querySelector(type.expectSelector);
        
        assert.strictEqual(
          previewElement !== null, 
          true, 
          `Should create ${type.name} for mimetype ${type.mimetype}`
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error in testContentTypePreview:', error);
      return false;
    }
  }
  
  /**
   * Tests metadata table creation
   */
  testMetadataTable() {
    try {
      const contentItem = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/metadata-test.json',
        mimetype: 'application/json',
        size: 2048,
        timestamp: Date.now(),
        pinned: true,
        pinStatus: 'pinned',
        multiHash: {
          hashType: 'sha2-256',
          hashFunction: 'sha2-256',
          hashLength: 32
        },
        blocks: 5,
        metadata: {
          author: 'Test User',
          createdWith: 'Test App',
          description: 'Test file for metadata display'
        }
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(contentItem);
      const metadataTab = panel.querySelector('.tab-pane[data-tab="metadata"]');
      const metadataTable = metadataTab.querySelector('.metadata-table');
      const rows = metadataTable.querySelectorAll('tr');
      
      // Base properties plus multihash (3) plus custom metadata (3)
      assert.strictEqual(
        rows.length >= 13, 
        true, 
        'Should have at least 13 rows in metadata table'
      );
      
      // Check for specific fields by getting all row labels
      const rowLabels = [];
      rows.forEach(row => {
        const labelCell = row.querySelector('.metadata-label');
        if (labelCell) {
          rowLabels.push(labelCell.textContent);
        }
      });
      
      // Check for required fields
      const requiredFields = [
        'Content ID (CID)',
        'Path',
        'MIME Type',
        'Size', 
        'Added Date',
        'Pinned',
        'Pin Status',
        'Hash Type',
        'author',
        'createdWith',
        'description'
      ];
      
      for (const field of requiredFields) {
        assert.strictEqual(
          rowLabels.includes(field), 
          true, 
          `Should include ${field} field`
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error in testMetadataTable:', error);
      return false;
    }
  }
  
  /**
   * Tests locations handling
   */
  testLocationsHandling() {
    try {
      const contentItem = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/locations-test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        locations: {
          ipfs: 'active',
          's3': {
            bucket: 'test-bucket',
            key: 'images/test.jpg',
            region: 'us-west-2'
          },
          local: '/Users/test/images/test.jpg'
        }
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(contentItem);
      const locationsTab = panel.querySelector('.tab-pane[data-tab="locations"]');
      const locationsPanel = locationsTab.querySelector('.locations-panel');
      const locationCards = locationsPanel.querySelectorAll('.location-card');
      
      assert.strictEqual(
        locationCards.length, 
        3, 
        'Should have 3 location cards'
      );
      
      // Check location names by collecting all h4 contents
      const locationTitles = [];
      locationCards.forEach(card => {
        const titleElem = card.querySelector('h4');
        if (titleElem) {
          locationTitles.push(titleElem.textContent);
        }
      });
      
      // Required locations
      const requiredLocations = ['IPFS', 'Amazon S3', 'Local'];
      
      for (const location of requiredLocations) {
        assert.strictEqual(
          locationTitles.includes(location), 
          true, 
          `Should include ${location} location`
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error in testLocationsHandling:', error);
      return false;
    }
  }
  
  /**
   * Tests preview options
   */
  testPreviewOptions() {
    try {
      // Test image content type which should have more options
      const imageContent = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/preview-options-test.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(imageContent);
      const previewTab = panel.querySelector('.tab-pane[data-tab="preview"]');
      const previewOptions = previewTab.querySelector('.preview-options-panel');
      
      // All content should have gateway selection
      assert.strictEqual(
        previewOptions.querySelector('#ipfs-gateway-select') !== null, 
        true, 
        'Should have gateway selection'
      );
      
      // Image should have quality slider
      assert.strictEqual(
        previewOptions.querySelector('#quality-slider') !== null, 
        true, 
        'Image content should have quality slider'
      );
      
      // Test video content which should have autoplay option
      const videoContent = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/preview-options-test.mp4',
        mimetype: 'video/mp4',
        size: 1024
      };
      
      const videoPanel = this.searchDiscovery.createContentDetailPanel(videoContent);
      const videoPreviewTab = videoPanel.querySelector('.tab-pane[data-tab="preview"]');
      const videoPreviewOptions = videoPreviewTab.querySelector('.preview-options-panel');
      
      // Video should have autoplay option
      assert.strictEqual(
        videoPreviewOptions.querySelector('#autoplay-checkbox') !== null, 
        true, 
        'Video content should have autoplay option'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testPreviewOptions:', error);
      return false;
    }
  }
  
  /**
   * Tests tags handling
   */
  testTagsHandling() {
    try {
      // Content with tags
      const contentWithTags = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/tags-test.json',
        mimetype: 'application/json',
        size: 1024,
        tags: ['example', 'test', 'demo', 'tags']
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(contentWithTags);
      
      // Should have tags tab
      const tabButtons = panel.querySelectorAll('.tab-button');
      assert.strictEqual(
        tabButtons.length, 
        4, 
        'Should have 4 tab buttons with tags'
      );
      
      assert.strictEqual(
        tabButtons[3].textContent, 
        'Tags', 
        'Fourth tab should be Tags'
      );
      
      // Should have tags panel
      const tagsTab = panel.querySelector('.tab-pane[data-tab="tags"]');
      assert.strictEqual(
        tagsTab !== null, 
        true, 
        'Should have tags tab pane'
      );
      
      const tagsPanel = tagsTab.querySelector('.tags-panel');
      assert.strictEqual(
        tagsPanel !== null, 
        true, 
        'Should have tags panel'
      );
      
      const tagItems = tagsPanel.querySelectorAll('.tag-item');
      assert.strictEqual(
        tagItems.length, 
        4, 
        'Should have 4 tag items'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testTagsHandling:', error);
      return false;
    }
  }
  
  /**
   * Tests tab switching
   */
  testTabSwitching() {
    try {
      const contentItem = {
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        path: '/test/tab-test.json',
        mimetype: 'application/json',
        size: 1024
      };
      
      const panel = this.searchDiscovery.createContentDetailPanel(contentItem);
      this.container.appendChild(panel);
      
      // Check initial state - metadata tab should be active
      const tabButtons = panel.querySelectorAll('.tab-button');
      const tabPanes = panel.querySelectorAll('.tab-pane');
      
      assert.strictEqual(
        tabButtons[0].classList.contains('active'), 
        true, 
        'Metadata tab button should be active initially'
      );
      
      assert.strictEqual(
        tabPanes[0].classList.contains('active'), 
        true, 
        'Metadata tab pane should be active initially'
      );
      
      // Click the locations tab
      tabButtons[1].click();
      
      assert.strictEqual(
        tabButtons[0].classList.contains('active'), 
        false, 
        'Metadata tab button should no longer be active'
      );
      
      assert.strictEqual(
        tabButtons[1].classList.contains('active'), 
        true, 
        'Locations tab button should be active'
      );
      
      assert.strictEqual(
        tabPanes[0].classList.contains('active'), 
        false, 
        'Metadata tab pane should no longer be active'
      );
      
      assert.strictEqual(
        tabPanes[1].classList.contains('active'), 
        true, 
        'Locations tab pane should be active'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testTabSwitching:', error);
      return false;
    }
  }
  
  /**
   * Tests integration files exist
   */
  testIntegrationFilesExist() {
    try {
      // Check load_enhanced_search.js
      const loadEnhancedSearchPath = path.resolve(__dirname, 
        '../../hallucinate_app/node/dashboard/load_enhanced_search.js');
      
      assert.strictEqual(
        fs.existsSync(loadEnhancedSearchPath), 
        true, 
        'load_enhanced_search.js file should exist'
      );
      
      // Check CSS file
      const cssPath = path.resolve(__dirname, 
        '../../hallucinate_app/node/dashboard/enhanced_search/search_thumbnail_integration.css');
      
      assert.strictEqual(
        fs.existsSync(cssPath), 
        true, 
        'search_thumbnail_integration.css file should exist'
      );
      
      return true;
    } catch (error) {
      console.error('Error in testIntegrationFilesExist:', error);
      return false;
    }
  }
}

// Export the test class
export { TestDetailPanel };

// Run tests if this file is executed directly
if (import.meta.url.startsWith('file:')) {
  const tester = new TestDetailPanel();
  tester.test().then(results => {
    const allPassed = Object.values(results).every(result => result === true);
    console.log('All tests passed:', allPassed);
    process.exit(allPassed ? 0 : 1);
  });
}