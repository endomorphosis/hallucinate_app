/**
 * Embeddings and FAISS Dashboard Component
 * 
 * This module provides dashboard components for visualizing and testing embeddings 
 * and FAISS vector search functionality.
 */

import { ipfsEmbeddings } from '../ipfs_embeddings.js';
import { ipfsFaiss } from '../ipfs_faiss.js';

/**
 * EmbeddingsDashboard class for rendering and managing embeddings functionality in the dashboard
 */
class EmbeddingsDashboard {
  /**
   * Initialize the embeddings dashboard component
   * 
   * @param {Object} options Dashboard configuration options
   * @param {HTMLElement} options.container Container element to render the dashboard
   * @param {Object} options.resources Resources shared with the dashboard
   */
  constructor(options = {}) {
    this.container = options.container || document.createElement('div');
    this.resources = options.resources || {};
    this.results = [];
    
    // Track module availability
    this.modules = {
      embeddings: ipfsEmbeddings,
      faiss: ipfsFaiss
    };
    
    // Initialize dashboard state
    this.state = {
      embeddingsPanelVisible: true,
      faissPanelVisible: true,
      activeTabId: 'embeddings-tab',
      currentIndexId: null,
      embeddingsCache: []
    };
  }
  
  /**
   * Initialize the dashboard
   */
  async init() {
    // Initialize modules
    const embeddingsInit = await this.modules.embeddings.init();
    const faissInit = await this.modules.faiss.init();
    
    console.log(`Modules initialized - Embeddings: ${embeddingsInit}, FAISS: ${faissInit}`);
    
    // Render the dashboard UI
    this.render();
    
    // Attach event listeners
    this.attachEventListeners();
    
    return true;
  }
  
  /**
   * Render the dashboard UI
   */
  render() {
    // Create dashboard HTML structure
    this.container.innerHTML = `
      <div class="embeddings-dashboard">
        <div class="dashboard-header">
          <h2>Embeddings & Vector Search Dashboard</h2>
          <div class="tabs">
            <button id="embeddings-tab" class="tab-button active">Embeddings</button>
            <button id="faiss-tab" class="tab-button">FAISS Vector Search</button>
            <button id="integration-tab" class="tab-button">Integration</button>
          </div>
        </div>
        
        <div class="dashboard-content">
          <!-- Embeddings Panel -->
          <div id="embeddings-panel" class="panel active">
            <h3>Generate Embeddings</h3>
            <div class="form-group">
              <label for="embedding-text">Text to Embed:</label>
              <textarea id="embedding-text" rows="4" placeholder="Enter text to generate embedding"></textarea>
            </div>
            <div class="form-group">
              <button id="generate-embedding-btn" class="action-button">Generate Embedding</button>
            </div>
            <div class="results-container">
              <h4>Embedding Result:</h4>
              <pre id="embedding-result" class="result-display"></pre>
            </div>
            
            <h3>Compare Embeddings</h3>
            <div class="form-group">
              <label for="embedding-text-1">First Text:</label>
              <textarea id="embedding-text-1" rows="3" placeholder="Enter first text"></textarea>
            </div>
            <div class="form-group">
              <label for="embedding-text-2">Second Text:</label>
              <textarea id="embedding-text-2" rows="3" placeholder="Enter second text"></textarea>
            </div>
            <div class="form-group">
              <label for="similarity-metric">Similarity Metric:</label>
              <select id="similarity-metric">
                <option value="cosine">Cosine</option>
                <option value="euclidean">Euclidean</option>
                <option value="dot">Dot Product</option>
              </select>
              <button id="compare-embeddings-btn" class="action-button">Compare Similarity</button>
            </div>
            <div class="results-container">
              <h4>Similarity Result:</h4>
              <pre id="similarity-result" class="result-display"></pre>
            </div>
          </div>
          
          <!-- FAISS Panel -->
          <div id="faiss-panel" class="panel">
            <h3>FAISS Vector Index</h3>
            <div class="form-group">
              <label for="faiss-dimensions">Vector Dimensions:</label>
              <input type="number" id="faiss-dimensions" value="384" min="1" max="1024">
              <label for="faiss-index-type">Index Type:</label>
              <select id="faiss-index-type">
                <option value="Flat">Flat</option>
                <option value="IVF">IVF</option>
                <option value="HNSW">HNSW</option>
                <option value="PQ">PQ</option>
              </select>
              <button id="create-index-btn" class="action-button">Create Index</button>
            </div>
            
            <div class="form-group">
              <label for="current-index">Current Index:</label>
              <select id="current-index">
                <option value="">No index selected</option>
              </select>
              <button id="list-indexes-btn" class="action-button">List Indexes</button>
              <button id="get-index-info-btn" class="action-button">Get Index Info</button>
            </div>
            
            <div class="results-container">
              <h4>FAISS Result:</h4>
              <pre id="faiss-result" class="result-display"></pre>
            </div>
          </div>
          
          <!-- Integration Panel -->
          <div id="integration-panel" class="panel">
            <h3>Vector Search Integration</h3>
            <div class="form-group">
              <label for="vector-search-text">Search Text:</label>
              <textarea id="vector-search-text" rows="3" placeholder="Enter search query"></textarea>
            </div>
            <div class="form-group">
              <label for="vector-search-corpus">Corpus Texts (one per line):</label>
              <textarea id="vector-search-corpus" rows="6" placeholder="Enter corpus texts, one per line"></textarea>
            </div>
            <div class="form-group">
              <label for="vector-search-k">Number of Results (k):</label>
              <input type="number" id="vector-search-k" value="3" min="1" max="20">
              <button id="vector-search-btn" class="action-button">Search Similar</button>
            </div>
            <div class="results-container">
              <h4>Search Results:</h4>
              <pre id="vector-search-result" class="result-display"></pre>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add some basic styles
    this.addStyles();
  }
  
  /**
   * Add basic styles to the dashboard
   */
  addStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .embeddings-dashboard {
        font-family: system-ui, -apple-system, sans-serif;
        padding: 20px;
        max-width: 900px;
        margin: 0 auto;
      }
      
      .dashboard-header {
        margin-bottom: 20px;
      }
      
      .tabs {
        display: flex;
        border-bottom: 2px solid #ddd;
        margin-bottom: 20px;
      }
      
      .tab-button {
        padding: 10px 20px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        cursor: pointer;
        font-weight: 500;
      }
      
      .tab-button.active {
        border-bottom: 2px solid #007bff;
        color: #007bff;
      }
      
      .panel {
        display: none;
      }
      
      .panel.active {
        display: block;
      }
      
      .form-group {
        margin-bottom: 15px;
      }
      
      label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }
      
      textarea, input, select {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: inherit;
      }
      
      .action-button {
        background: #007bff;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      }
      
      .result-display {
        background: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        overflow: auto;
        max-height: 300px;
        font-family: monospace;
        font-size: 14px;
        white-space: pre-wrap;
      }
    `;
    
    document.head.appendChild(styleEl);
  }
  
  /**
   * Attach event listeners to UI elements
   */
  attachEventListeners() {
    // Tab navigation
    this.container.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        // Update active tab
        this.container.querySelectorAll('.tab-button').forEach(btn => {
          btn.classList.remove('active');
        });
        e.target.classList.add('active');
        
        // Show corresponding panel
        const panelId = e.target.id.replace('-tab', '-panel');
        this.container.querySelectorAll('.panel').forEach(panel => {
          panel.classList.remove('active');
        });
        this.container.querySelector(`#${panelId}`).classList.add('active');
        
        // Update state
        this.state.activeTabId = e.target.id;
      });
    });
    
    // Embeddings panel actions
    this.container.querySelector('#generate-embedding-btn').addEventListener('click', async () => {
      await this.generateEmbedding();
    });
    
    this.container.querySelector('#compare-embeddings-btn').addEventListener('click', async () => {
      await this.compareEmbeddings();
    });
    
    // FAISS panel actions
    this.container.querySelector('#create-index-btn').addEventListener('click', async () => {
      await this.createFaissIndex();
    });
    
    this.container.querySelector('#list-indexes-btn').addEventListener('click', async () => {
      await this.listFaissIndexes();
    });
    
    this.container.querySelector('#get-index-info-btn').addEventListener('click', async () => {
      await this.getFaissIndexInfo();
    });
    
    // Integration panel actions
    this.container.querySelector('#vector-search-btn').addEventListener('click', async () => {
      await this.searchSimilarTexts();
    });
  }
  
  /**
   * Generate embeddings from input text
   */
  async generateEmbedding() {
    try {
      const textElement = this.container.querySelector('#embedding-text');
      const resultElement = this.container.querySelector('#embedding-result');
      
      const text = textElement.value.trim();
      if (!text) {
        resultElement.textContent = "Error: Please enter some text to embed";
        return;
      }
      
      resultElement.textContent = "Generating embedding...";
      
      const result = await this.modules.embeddings.generateEmbedding(text);
      
      if (result.error) {
        resultElement.textContent = `Error: ${result.error}`;
        return;
      }
      
      // Cache the result for later use
      this.state.embeddingsCache.push({
        text,
        embedding: result.embedding
      });
      
      // Format the output (truncate the embedding for display)
      const embedding = result.embedding;
      const displayEmbedding = embedding.slice(0, 5).concat(["..."]);
      
      resultElement.textContent = JSON.stringify({
        success: result.success,
        dimensions: result.dimensions,
        embedding: displayEmbedding
      }, null, 2);
      
      console.log(`Generated embedding with ${result.dimensions} dimensions`);
    } catch (error) {
      console.error("Error generating embedding:", error);
      this.container.querySelector('#embedding-result').textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Compare two text embeddings for similarity
   */
  async compareEmbeddings() {
    try {
      const text1Element = this.container.querySelector('#embedding-text-1');
      const text2Element = this.container.querySelector('#embedding-text-2');
      const metricElement = this.container.querySelector('#similarity-metric');
      const resultElement = this.container.querySelector('#similarity-result');
      
      const text1 = text1Element.value.trim();
      const text2 = text2Element.value.trim();
      const metric = metricElement.value;
      
      if (!text1 || !text2) {
        resultElement.textContent = "Error: Please enter both texts to compare";
        return;
      }
      
      resultElement.textContent = "Comparing embeddings...";
      
      // Generate embeddings for both texts
      const result1 = await this.modules.embeddings.generateEmbedding(text1);
      const result2 = await this.modules.embeddings.generateEmbedding(text2);
      
      if (result1.error || result2.error) {
        resultElement.textContent = `Error: ${result1.error || result2.error}`;
        return;
      }
      
      // Calculate similarity
      const simResult = await this.modules.embeddings.compareSimilarity(
        result1.embedding,
        result2.embedding,
        metric
      );
      
      if (simResult.error) {
        resultElement.textContent = `Error: ${simResult.error}`;
        return;
      }
      
      resultElement.textContent = JSON.stringify({
        similarity: simResult.similarity,
        metric: simResult.metric
      }, null, 2);
      
      console.log(`Calculated ${metric} similarity: ${simResult.similarity}`);
    } catch (error) {
      console.error("Error comparing embeddings:", error);
      this.container.querySelector('#similarity-result').textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Create a new FAISS index
   */
  async createFaissIndex() {
    try {
      const dimensionsElement = this.container.querySelector('#faiss-dimensions');
      const indexTypeElement = this.container.querySelector('#faiss-index-type');
      const resultElement = this.container.querySelector('#faiss-result');
      
      const dimensions = parseInt(dimensionsElement.value);
      const indexType = indexTypeElement.value;
      
      if (isNaN(dimensions) || dimensions <= 0) {
        resultElement.textContent = "Error: Please enter a valid dimension value";
        return;
      }
      
      resultElement.textContent = "Creating FAISS index...";
      
      const result = await this.modules.faiss.createIndex(dimensions, indexType);
      
      if (result.error) {
        resultElement.textContent = `Error: ${result.error}`;
        return;
      }
      
      // Update current index
      this.state.currentIndexId = result.index_id;
      
      // Add to index dropdown
      const selectElement = this.container.querySelector('#current-index');
      const option = document.createElement('option');
      option.value = result.index_id;
      option.textContent = `${indexType}(d=${dimensions}) - ${result.index_id.slice(0, 8)}`;
      option.selected = true;
      selectElement.appendChild(option);
      
      resultElement.textContent = JSON.stringify(result, null, 2);
      
      console.log(`Created ${indexType} index with ID: ${result.index_id}`);
    } catch (error) {
      console.error("Error creating FAISS index:", error);
      this.container.querySelector('#faiss-result').textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * List available FAISS indexes
   */
  async listFaissIndexes() {
    try {
      const resultElement = this.container.querySelector('#faiss-result');
      
      resultElement.textContent = "Listing FAISS indexes...";
      
      const result = await this.modules.faiss.listIndexes();
      
      if (result.error) {
        resultElement.textContent = `Error: ${result.error}`;
        return;
      }
      
      // Update indexes dropdown
      const selectElement = this.container.querySelector('#current-index');
      selectElement.innerHTML = "<option value=''>No index selected</option>";
      
      if (result.indexes && result.indexes.length > 0) {
        result.indexes.forEach(index => {
          const option = document.createElement('option');
          option.value = index.index_id;
          option.textContent = `${index.type}(d=${index.dimensions}) - ${index.index_id.slice(0, 8)}`;
          
          if (index.index_id === this.state.currentIndexId) {
            option.selected = true;
          }
          
          selectElement.appendChild(option);
        });
      }
      
      resultElement.textContent = JSON.stringify(result, null, 2);
      
      console.log(`Listed ${result.count} FAISS indexes`);
    } catch (error) {
      console.error("Error listing FAISS indexes:", error);
      this.container.querySelector('#faiss-result').textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Get information about the current FAISS index
   */
  async getFaissIndexInfo() {
    try {
      const selectElement = this.container.querySelector('#current-index');
      const resultElement = this.container.querySelector('#faiss-result');
      
      const indexId = selectElement.value;
      
      if (!indexId) {
        resultElement.textContent = "Error: Please select an index";
        return;
      }
      
      resultElement.textContent = "Getting index info...";
      
      const result = await this.modules.faiss.getIndexInfo(indexId);
      
      if (result.error) {
        resultElement.textContent = `Error: ${result.error}`;
        return;
      }
      
      resultElement.textContent = JSON.stringify(result, null, 2);
      
      console.log(`Got info for index: ${indexId}`);
    } catch (error) {
      console.error("Error getting index info:", error);
      this.container.querySelector('#faiss-result').textContent = `Error: ${error.message}`;
    }
  }
  
  /**
   * Search for similar texts using embeddings and FAISS
   */
  async searchSimilarTexts() {
    try {
      const queryElement = this.container.querySelector('#vector-search-text');
      const corpusElement = this.container.querySelector('#vector-search-corpus');
      const kElement = this.container.querySelector('#vector-search-k');
      const resultElement = this.container.querySelector('#vector-search-result');
      
      const query = queryElement.value.trim();
      const corpus = corpusElement.value.trim().split('\n').filter(line => line.trim());
      const k = parseInt(kElement.value);
      
      if (!query) {
        resultElement.textContent = "Error: Please enter a search query";
        return;
      }
      
      if (corpus.length === 0) {
        resultElement.textContent = "Error: Please enter at least one corpus text";
        return;
      }
      
      resultElement.textContent = "Searching similar texts...";
      
      // Step 1: Generate embeddings for query and corpus
      const queryEmbedResult = await this.modules.embeddings.generateEmbedding(query);
      if (queryEmbedResult.error) {
        resultElement.textContent = `Error generating query embedding: ${queryEmbedResult.error}`;
        return;
      }
      
      const corpusEmbedResult = await this.modules.embeddings.generateEmbedding(corpus);
      if (corpusEmbedResult.error) {
        resultElement.textContent = `Error generating corpus embeddings: ${corpusEmbedResult.error}`;
        return;
      }
      
      // Step 2: Create a FAISS index for the corpus
      const dimensions = corpusEmbedResult.dimensions;
      const indexResult = await this.modules.faiss.createIndex(dimensions, 'Flat');
      if (indexResult.error) {
        resultElement.textContent = `Error creating FAISS index: ${indexResult.error}`;
        return;
      }
      
      // Step 3: Add corpus embeddings to the index
      const indexId = indexResult.index_id;
      const addResult = await this.modules.faiss.addVectors(indexId, corpusEmbedResult.embeddings);
      if (addResult.error) {
        resultElement.textContent = `Error adding vectors to index: ${addResult.error}`;
        return;
      }
      
      // Step 4: Search the index with the query embedding
      const searchResult = await this.modules.faiss.search(indexId, queryEmbedResult.embedding, k);
      if (searchResult.error) {
        resultElement.textContent = `Error searching index: ${searchResult.error}`;
        return;
      }
      
      // Step 5: Format the results
      const results = searchResult.results.map(result => {
        return {
          text: corpus[result.id],
          distance: result.distance
        };
      });
      
      resultElement.textContent = JSON.stringify({
        query,
        results
      }, null, 2);
      
      console.log(`Found ${results.length} similar texts`);
    } catch (error) {
      console.error("Error in vector search:", error);
      this.container.querySelector('#vector-search-result').textContent = `Error: ${error.message}`;
    }
  }
}

export { EmbeddingsDashboard };
export default EmbeddingsDashboard;