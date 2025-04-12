/**
 * Enhanced Thumbnails Test
 * 
 * Tests the functionality of the enhanced thumbnail generation and integration
 * for the PyArrow Content Index Dashboard.
 */

const { 
  isVisualContent,
  getTypeIcon,
  generateThumbnail,
  createThumbnailElement,
  createPreviewElement,
  thumbnailCache
} = require('../../hallucinate_app/node/dashboard/enhanced_thumbnails/thumbnail_generator.js');

const { 
  integrateThumbnails,
  createThumbnailIntegrationLoader,
  initializeThumbnailIntegration
} = require('../../hallucinate_app/node/dashboard/enhanced_thumbnails/thumbnail_integration.js');

const { loadEnhancedThumbnails } = require('../../hallucinate_app/node/dashboard/load_enhanced_thumbnails.js');

// Mock document and other browser objects
const mockDocument = {
  readyState: 'complete',
  createElement: (tag) => {
    const element = {
      style: {},
      className: '',
      appendChild: () => {},
      children: [],
      addEventListener: () => {}
    };
    
    if (tag === 'img') {
      element.onload = null;
      element.onerror = null;
      element.src = '';
      element.alt = '';
    }
    
    if (tag === 'i') {
      element.className = '';
    }
    
    if (tag === 'div') {
      element.innerHTML = '';
    }
    
    return element;
  },
  querySelector: () => null,
  addEventListener: () => {}
};

const mockWindow = {
  contentIndexDashboard: {
    renderList: () => {},
    renderDetail: () => {},
    _isVisualContent: null,
    _generateThumbnail: null
  },
  thumbnailCache: new Map(),
  loadThumbnails: true
};

// Mock dashboard for testing integration
const mockDashboard = {
  renderList: jest.fn(),
  renderDetail: jest.fn(),
  _isVisualContent: jest.fn(),
  _generateThumbnail: jest.fn(),
  _showContentDetails: jest.fn(),
  _copyToClipboard: jest.fn()
};

// Test data
const testCids = [
  'QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx',
  'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  'QmP8jTG1m9GSDJLCbeWhVSVgEzCPPwXRdCRuJtQ5Tz9Kc9'
];

const testMimeTypes = {
  image: 'image/jpeg',
  pdf: 'application/pdf',
  video: 'video/mp4',
  text: 'text/plain',
  doc: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  unknown: 'application/octet-stream'
};

const testPaths = {
  image: '/photos/vacation.jpg',
  pdf: '/documents/report.pdf',
  video: '/videos/presentation.mp4',
  text: '/notes/meeting.txt',
  doc: '/documents/contract.docx',
  unknown: '/data/binary.dat'
};

// Mock console to capture logs
const originalConsole = { ...console };
const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};

describe('Enhanced Thumbnails', () => {
  // Set up mocks before tests
  beforeAll(() => {
    global.document = mockDocument;
    global.window = mockWindow;
    global.console = mockConsole;
  });
  
  // Restore original objects after tests
  afterAll(() => {
    global.document = undefined;
    global.window = undefined;
    global.console = originalConsole;
  });
  
  // Clear mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
    thumbnailCache.clear();
  });
  
  describe('Thumbnail Generator', () => {
    test('should correctly identify visual content', () => {
      expect(isVisualContent(testMimeTypes.image)).toBe(true);
      expect(isVisualContent(testMimeTypes.pdf)).toBe(true);
      expect(isVisualContent(testMimeTypes.video)).toBe(true);
      expect(isVisualContent(testMimeTypes.text)).toBe(false);
      expect(isVisualContent(testMimeTypes.unknown)).toBe(false);
      expect(isVisualContent(null)).toBe(false);
    });
    
    test('should provide appropriate icons for different content types', () => {
      const imageIcon = getTypeIcon(testMimeTypes.image);
      expect(imageIcon.icon).toBe('fa-image');
      
      const pdfIcon = getTypeIcon(testMimeTypes.pdf);
      expect(pdfIcon.icon).toBe('fa-file-pdf');
      
      const videoIcon = getTypeIcon(testMimeTypes.video);
      expect(videoIcon.icon).toBe('fa-video');
      
      const textIcon = getTypeIcon(testMimeTypes.text);
      expect(textIcon.icon).toBe('fa-file-alt');
      
      const docIcon = getTypeIcon(testMimeTypes.doc);
      expect(docIcon.icon).toBe('fa-file-word');
      
      const unknownIcon = getTypeIcon(testMimeTypes.unknown);
      expect(unknownIcon.icon).toBe('fa-file');
      
      const nullIcon = getTypeIcon(null);
      expect(nullIcon.icon).toBe('fa-file');
    });
    
    test('should generate thumbnails for different content types', () => {
      // Image thumbnail with direct URL
      const imageThumbnail = generateThumbnail(
        testCids[0], 
        testMimeTypes.image,
        testPaths.image
      );
      
      expect(imageThumbnail.isLoading).toBe(false);
      expect(imageThumbnail.isIcon).toBe(false);
      expect(imageThumbnail.url).toContain(testCids[0]);
      
      // PDF thumbnail with icon fallback (no service)
      const pdfThumbnail = generateThumbnail(
        testCids[1],
        testMimeTypes.pdf,
        testPaths.pdf
      );
      
      expect(pdfThumbnail.isLoading).toBe(false);
      expect(pdfThumbnail.isIcon).toBe(true);
      expect(pdfThumbnail.iconClass).toBe('fa-file-pdf');
      
      // Text file with icon
      const textThumbnail = generateThumbnail(
        testCids[2],
        testMimeTypes.text,
        testPaths.text
      );
      
      expect(textThumbnail.isLoading).toBe(false);
      expect(textThumbnail.isIcon).toBe(true);
      expect(textThumbnail.iconClass).toBe('fa-file-alt');
    });
    
    test('should handle missing parameters gracefully', () => {
      const nullThumbnail = generateThumbnail(null, null);
      
      expect(nullThumbnail.isLoading).toBe(false);
      expect(nullThumbnail.isIcon).toBe(true);
      expect(nullThumbnail.iconClass).toBe('fa-file');
    });
    
    test('should use thumbnail service when provided', () => {
      const thumbnailWithService = generateThumbnail(
        testCids[0],
        testMimeTypes.image,
        testPaths.image,
        { thumbnailService: 'https://thumbnail-service.example.com' }
      );
      
      expect(thumbnailWithService.url).toContain('https://thumbnail-service.example.com');
      expect(thumbnailWithService.url).toContain(testCids[0]);
      expect(thumbnailWithService.url).toContain('type=image');
    });
    
    test('should create thumbnail DOM elements', () => {
      const thumbnailElement = createThumbnailElement(
        testCids[0],
        testMimeTypes.image,
        testPaths.image
      );
      
      expect(thumbnailElement).toBeDefined();
    });
    
    test('should create preview DOM elements', () => {
      const previewElement = createPreviewElement(
        testCids[0],
        testMimeTypes.image,
        testPaths.image
      );
      
      expect(previewElement).toBeDefined();
    });
  });
  
  describe('Thumbnail Cache', () => {
    test('should store and retrieve thumbnails from cache', () => {
      const thumbnail = generateThumbnail(
        testCids[0],
        testMimeTypes.image,
        testPaths.image
      );
      
      thumbnailCache.set(testCids[0], testMimeTypes.image, 'small', thumbnail);
      
      const cachedThumbnail = thumbnailCache.get(testCids[0], testMimeTypes.image, 'small');
      expect(cachedThumbnail).toEqual(thumbnail);
      
      const missingThumbnail = thumbnailCache.get('nonexistent', testMimeTypes.image, 'small');
      expect(missingThumbnail).toBeNull();
    });
    
    test('should manage cache size', () => {
      // Fill cache with many items
      for (let i = 0; i < 250; i++) {
        const thumbnail = generateThumbnail(
          `fake-cid-${i}`,
          testMimeTypes.image,
          `fake-path-${i}`
        );
        
        thumbnailCache.set(`fake-cid-${i}`, testMimeTypes.image, 'small', thumbnail);
      }
      
      // Check that we're under the maximum size (should remove oldest items)
      expect(thumbnailCache.size()).toBeLessThanOrEqual(200);
      
      // Clear the cache
      thumbnailCache.clear();
      expect(thumbnailCache.size()).toBe(0);
    });
  });
  
  describe('Dashboard Integration', () => {
    test('should integrate thumbnails with dashboard', () => {
      const result = integrateThumbnails(mockDashboard, {
        ipfsGateway: 'https://example.com/ipfs/',
        enableListThumbnails: true,
        enableDetailPreview: true
      });
      
      expect(result).toBe(true);
      expect(mockDashboard._isVisualContent).toBeDefined();
      expect(mockDashboard._generateThumbnail).toBeDefined();
      expect(mockDashboard.renderList).toBeDefined();
      expect(mockDashboard.renderDetail).toBeDefined();
    });
    
    test('should handle missing dashboard', () => {
      const result = integrateThumbnails(null);
      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalled();
    });
    
    test('should create integration loader script', () => {
      const loaderScript = createThumbnailIntegrationLoader({
        ipfsGateway: 'https://example.com/ipfs/',
        enableListThumbnails: true
      });
      
      expect(typeof loaderScript).toBe('string');
      expect(loaderScript).toContain('Enhanced thumbnail generation');
      expect(loaderScript).toContain('https://example.com/ipfs/');
    });
  });
  
  describe('Enhanced Thumbnails Loader', () => {
    test('should handle invalid dashboard element', async () => {
      const result = await loadEnhancedThumbnails({
        dashboard: null,
        config: {}
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    test('should apply default configuration', async () => {
      // Mock successful integration
      global.document.querySelector = () => mockDashboard;
      integrateThumbnails = jest.fn().mockReturnValue(true);
      
      const result = await loadEnhancedThumbnails({
        dashboard: '.dashboard-selector',
        config: {}
      });
      
      expect(integrateThumbnails).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ipfsGateway: 'https://ipfs.io/ipfs/',
          enableListThumbnails: true,
          enableDetailPreview: true
        })
      );
    });
  });
});