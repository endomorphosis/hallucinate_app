/**
 * GraphRAG Dashboard Component
 * 
 * This component provides a visual interface for interacting with
 * the GraphRAG module, allowing users to build and query knowledge graphs.
 */

import { GraphRAG } from '../graphrag.js';

export class GraphRAGDashboard {
  /**
   * Create a new GraphRAG dashboard component
   * 
   * @param {Object} options - Dashboard configuration options
   * @param {HTMLElement} options.container - Container element for the dashboard
   * @param {Object} options.resources - Resource pool with dependencies
   */
  constructor(options = {}) {
    this.container = options.container;
    this.resources = options.resources || {};
    this.graphrag = this.resources.graphrag || new GraphRAG(this.resources);
    this.initialized = false;
    
    // Graph visualization options
    this.visOptions = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: {
          size: 12,
          face: 'Arial'
        },
        borderWidth: 2,
        shadow: true
      },
      edges: {
        width: 2,
        shadow: true,
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 }
        },
        color: {
          color: '#2B7CE9',
          highlight: '#FFA500',
          hover: '#848484'
        }
      },
      physics: {
        stabilization: true,
        barnesHut: {
          gravitationalConstant: -80000,
          springConstant: 0.001,
          springLength: 200
        }
      }
    };
    
    // State
    this.currentGraph = null;
    this.visualizationNetwork = null;
    
    // Bind methods
    this.init = this.init.bind(this);
    this.render = this.render.bind(this);
    this.handleDocumentAdd = this.handleDocumentAdd.bind(this);
    this.handleNodeAdd = this.handleNodeAdd.bind(this);
    this.handleEdgeAdd = this.handleEdgeAdd.bind(this);
    this.handleQuerySubmit = this.handleQuerySubmit.bind(this);
    this.visualizeGraph = this.visualizeGraph.bind(this);
    this.loadGraph = this.loadGraph.bind(this);
    this.saveGraph = this.saveGraph.bind(this);
    this.handleIpfsOperation = this.handleIpfsOperation.bind(this);
  }
  
  /**
   * Initialize the GraphRAG dashboard
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Initialize GraphRAG
      await this.graphrag.init();
      
      // Create UI
      this.render();
      
      // Add event listeners
      this.addEventListeners();
      
      this.initialized = true;
      this.updateStatus('GraphRAG Dashboard initialized');
    } catch (error) {
      this.updateStatus(`Initialization error: ${error.message}`, 'error');
      console.error('GraphRAG Dashboard initialization error:', error);
    }
  }
  
  /**
   * Render the dashboard UI
   */
  render() {
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create dashboard structure
    const dashboardHTML = `
      <div class="graphrag-dashboard">
        <h2>GraphRAG Knowledge Graph Dashboard</h2>
        
        <div class="dashboard-grid">
          <!-- Left Panel: Controls -->
          <div class="control-panel">
            <div class="panel-section">
              <h3>Add Document</h3>
              <form id="document-form">
                <div class="form-group">
                  <label for="doc-id">Document ID:</label>
                  <input type="text" id="doc-id" required>
                </div>
                <div class="form-group">
                  <label for="doc-title">Title:</label>
                  <input type="text" id="doc-title">
                </div>
                <div class="form-group">
                  <label for="doc-content">Content:</label>
                  <textarea id="doc-content" rows="4" required></textarea>
                </div>
                <button type="submit" class="btn">Add Document</button>
              </form>
            </div>
            
            <div class="panel-section">
              <h3>Manual Node/Edge</h3>
              <form id="node-form">
                <div class="form-group">
                  <label for="node-id">Node ID:</label>
                  <input type="text" id="node-id" required>
                </div>
                <div class="form-group">
                  <label for="node-name">Name/Content:</label>
                  <input type="text" id="node-name" required>
                </div>
                <div class="form-group">
                  <label for="node-type">Type:</label>
                  <input type="text" id="node-type" placeholder="concept, entity, etc.">
                </div>
                <button type="submit" class="btn">Add Node</button>
              </form>
              
              <form id="edge-form">
                <div class="form-group">
                  <label for="edge-source">Source Node:</label>
                  <input type="text" id="edge-source" required>
                </div>
                <div class="form-group">
                  <label for="edge-target">Target Node:</label>
                  <input type="text" id="edge-target" required>
                </div>
                <div class="form-group">
                  <label for="edge-weight">Weight (0-1):</label>
                  <input type="number" id="edge-weight" min="0" max="1" step="0.1" value="0.5">
                </div>
                <div class="form-check">
                  <input type="checkbox" id="edge-bidirectional">
                  <label for="edge-bidirectional">Bidirectional</label>
                </div>
                <button type="submit" class="btn">Add Edge</button>
              </form>
            </div>
            
            <div class="panel-section">
              <h3>Query Graph</h3>
              <form id="query-form">
                <div class="form-group">
                  <label for="query-text">Query:</label>
                  <input type="text" id="query-text" required>
                </div>
                <div class="form-group">
                  <label for="query-type">Search Type:</label>
                  <select id="query-type">
                    <option value="vector">Vector</option>
                    <option value="hybrid" selected>Hybrid</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="query-results">Results:</label>
                  <input type="number" id="query-results" min="1" max="20" value="5">
                </div>
                <button type="submit" class="btn">Query</button>
              </form>
            </div>
            
            <div class="panel-section">
              <h3>Graph Operations</h3>
              <div class="btn-group">
                <button id="btn-save-disk" class="btn">Save to Disk</button>
                <button id="btn-load-disk" class="btn">Load from Disk</button>
                <button id="btn-save-ipfs" class="btn">Save to IPFS</button>
                <button id="btn-load-ipfs" class="btn">Load from IPFS</button>
                <button id="btn-visualize" class="btn">Visualize Graph</button>
                <button id="btn-clear" class="btn">Clear Graph</button>
              </div>
            </div>
          </div>
          
          <!-- Right Panel: Visualization and Results -->
          <div class="viz-panel">
            <div class="panel-section">
              <h3>Graph Visualization</h3>
              <div id="graph-visualization"></div>
            </div>
            
            <div class="panel-section">
              <h3>Results</h3>
              <div id="results-container">
                <div id="status-message">Ready</div>
                <div id="query-results"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add HTML to container
    this.container.innerHTML = dashboardHTML;
    
    // Add styles
    this.addStyles();
  }
  
  /**
   * Add CSS styles for the dashboard
   */
  addStyles() {
    // Check if styles already exist
    if (document.getElementById('graphrag-dashboard-styles')) return;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'graphrag-dashboard-styles';
    styleSheet.textContent = `
      .graphrag-dashboard {
        font-family: Arial, sans-serif;
        padding: 15px;
        color: #333;
      }
      
      .dashboard-grid {
        display: grid;
        grid-template-columns: 30% 70%;
        gap: 20px;
        margin-top: 15px;
      }
      
      .panel-section {
        background-color: #f5f5f5;
        border-radius: 5px;
        padding: 15px;
        margin-bottom: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .panel-section h3 {
        margin-top: 0;
        border-bottom: 1px solid #ddd;
        padding-bottom: 8px;
        margin-bottom: 15px;
      }
      
      .form-group {
        margin-bottom: 12px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }
      
      .form-group input, .form-group textarea, .form-group select {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      .form-check {
        margin-bottom: 12px;
      }
      
      .btn {
        background-color: #2B7CE9;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      
      .btn:hover {
        background-color: #1a56a5;
      }
      
      .btn-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      
      #graph-visualization {
        height: 400px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background-color: #fafafa;
      }
      
      #status-message {
        padding: 8px 12px;
        background-color: #e8f4fd;
        border-left: 4px solid #2B7CE9;
        margin-bottom: 12px;
      }
      
      #status-message.error {
        background-color: #fde8e8;
        border-left-color: #e53e3e;
      }
      
      #status-message.success {
        background-color: #e8fdf1;
        border-left-color: #38a169;
      }
      
      #query-results {
        max-height: 300px;
        overflow-y: auto;
        padding: 10px;
        background-color: #fafafa;
        border: 1px solid #eee;
        border-radius: 4px;
      }
      
      .result-item {
        padding: 8px;
        margin-bottom: 8px;
        background-color: white;
        border: 1px solid #eee;
        border-radius: 4px;
      }
      
      .result-item-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
      }
      
      .result-item-id {
        font-weight: bold;
      }
      
      .result-item-score {
        color: #666;
      }
    `;
    
    document.head.appendChild(styleSheet);
  }
  
  /**
   * Add event listeners to dashboard elements
   */
  addEventListeners() {
    // Document form
    const documentForm = document.getElementById('document-form');
    if (documentForm) {
      documentForm.addEventListener('submit', this.handleDocumentAdd);
    }
    
    // Node form
    const nodeForm = document.getElementById('node-form');
    if (nodeForm) {
      nodeForm.addEventListener('submit', this.handleNodeAdd);
    }
    
    // Edge form
    const edgeForm = document.getElementById('edge-form');
    if (edgeForm) {
      edgeForm.addEventListener('submit', this.handleEdgeAdd);
    }
    
    // Query form
    const queryForm = document.getElementById('query-form');
    if (queryForm) {
      queryForm.addEventListener('submit', this.handleQuerySubmit);
    }
    
    // Graph operation buttons
    document.getElementById('btn-save-disk')?.addEventListener('click', () => this.saveGraph('disk'));
    document.getElementById('btn-load-disk')?.addEventListener('click', () => this.loadGraph('disk'));
    document.getElementById('btn-save-ipfs')?.addEventListener('click', () => this.handleIpfsOperation('save'));
    document.getElementById('btn-load-ipfs')?.addEventListener('click', () => this.handleIpfsOperation('load'));
    document.getElementById('btn-visualize')?.addEventListener('click', this.visualizeGraph);
    document.getElementById('btn-clear')?.addEventListener('click', this.clearGraph);
  }
  
  /**
   * Handle document addition
   * 
   * @param {Event} e - Form submit event
   */
  async handleDocumentAdd(e) {
    e.preventDefault();
    
    const docId = document.getElementById('doc-id').value;
    const docTitle = document.getElementById('doc-title').value;
    const docContent = document.getElementById('doc-content').value;
    
    try {
      this.updateStatus('Adding document...');
      
      const result = await this.graphrag.addDocument(
        docId,
        docContent,
        { title: docTitle }
      );
      
      if (result && result.error) {
        throw new Error(result.error);
      }
      
      this.updateStatus(`Document '${docId}' added successfully`, 'success');
      document.getElementById('document-form').reset();
    } catch (error) {
      this.updateStatus(`Error adding document: ${error.message}`, 'error');
      console.error('Error adding document:', error);
    }
  }
  
  /**
   * Handle node addition
   * 
   * @param {Event} e - Form submit event
   */
  async handleNodeAdd(e) {
    e.preventDefault();
    
    const nodeId = document.getElementById('node-id').value;
    const nodeName = document.getElementById('node-name').value;
    const nodeType = document.getElementById('node-type').value;
    
    try {
      this.updateStatus('Adding node...');
      
      const result = await this.graphrag.addNode(
        nodeId,
        nodeName,
        { type: nodeType || 'generic' }
      );
      
      if (result && result.error) {
        throw new Error(result.error);
      }
      
      this.updateStatus(`Node '${nodeId}' added successfully`, 'success');
      document.getElementById('node-form').reset();
    } catch (error) {
      this.updateStatus(`Error adding node: ${error.message}`, 'error');
      console.error('Error adding node:', error);
    }
  }
  
  /**
   * Handle edge addition
   * 
   * @param {Event} e - Form submit event
   */
  async handleEdgeAdd(e) {
    e.preventDefault();
    
    const sourceId = document.getElementById('edge-source').value;
    const targetId = document.getElementById('edge-target').value;
    const weight = parseFloat(document.getElementById('edge-weight').value);
    const bidirectional = document.getElementById('edge-bidirectional').checked;
    
    try {
      this.updateStatus('Adding edge...');
      
      const result = await this.graphrag.addEdge(
        sourceId,
        targetId,
        weight,
        bidirectional
      );
      
      if (result && result.error) {
        throw new Error(result.error);
      }
      
      this.updateStatus(`Edge from '${sourceId}' to '${targetId}' added successfully`, 'success');
      document.getElementById('edge-form').reset();
    } catch (error) {
      this.updateStatus(`Error adding edge: ${error.message}`, 'error');
      console.error('Error adding edge:', error);
    }
  }
  
  /**
   * Handle query submission
   * 
   * @param {Event} e - Form submit event
   */
  async handleQuerySubmit(e) {
    e.preventDefault();
    
    const queryText = document.getElementById('query-text').value;
    const queryType = document.getElementById('query-type').value;
    const k = parseInt(document.getElementById('query-results').value);
    
    try {
      this.updateStatus(`Running ${queryType} search for "${queryText}"...`);
      
      let results;
      if (queryType === 'vector') {
        results = await this.graphrag.vectorSearch(queryText, k);
      } else {
        results = await this.graphrag.hybridSearch(queryText, k);
      }
      
      if (results && results.error) {
        throw new Error(results.error);
      }
      
      this.displayResults(results, queryType);
      this.updateStatus(`Query completed successfully`, 'success');
    } catch (error) {
      this.updateStatus(`Error performing query: ${error.message}`, 'error');
      console.error('Error performing query:', error);
    }
  }
  
  /**
   * Display query results
   * 
   * @param {Array} results - Query results
   * @param {string} queryType - Type of query performed
   */
  displayResults(results, queryType) {
    const resultsContainer = document.getElementById('query-results');
    if (!resultsContainer) return;
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    // Check if results exist and are valid
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }
    
    // Create results header
    const header = document.createElement('div');
    header.className = 'results-header';
    header.innerHTML = `<h4>${queryType.charAt(0).toUpperCase() + queryType.slice(1)} Search Results</h4>`;
    resultsContainer.appendChild(header);
    
    // Add results
    for (let i = 0; i < results.length; i++) {
      const [nodeId, score] = results[i];
      
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';
      
      const resultHeader = document.createElement('div');
      resultHeader.className = 'result-item-header';
      
      const resultId = document.createElement('div');
      resultId.className = 'result-item-id';
      resultId.textContent = nodeId;
      
      const resultScore = document.createElement('div');
      resultScore.className = 'result-item-score';
      resultScore.textContent = `Score: ${score.toFixed(4)}`;
      
      resultHeader.appendChild(resultId);
      resultHeader.appendChild(resultScore);
      resultItem.appendChild(resultHeader);
      
      resultsContainer.appendChild(resultItem);
    }
  }
  
  /**
   * Visualize the current graph
   */
  async visualizeGraph() {
    this.updateStatus('Visualizing graph...');
    
    try {
      // Get graph statistics to extract nodes and edges
      const stats = await this.graphrag.getStats();
      
      if (stats && stats.error) {
        throw new Error(stats.error);
      }
      
      // Check if vis.js is available
      if (typeof vis === 'undefined') {
        this.updateStatus('Visualization library not available. Please include vis.js in your project.', 'error');
        return;
      }
      
      // Create graph data
      const nodes = stats.nodes.map(node => ({
        id: node.id,
        label: node.data.slice(0, 20), // Truncate long labels
        title: node.data,
        group: node.metadata?.type || 'default'
      }));
      
      const edges = stats.edges.map(edge => ({
        from: edge.source,
        to: edge.target,
        value: edge.weight,
        title: `Weight: ${edge.weight.toFixed(2)}`
      }));
      
      // Create visualization
      const container = document.getElementById('graph-visualization');
      if (!container) return;
      
      const data = { nodes, edges };
      this.visualizationNetwork = new vis.Network(container, data, this.visOptions);
      
      this.updateStatus('Graph visualization updated', 'success');
    } catch (error) {
      this.updateStatus(`Error visualizing graph: ${error.message}`, 'error');
      console.error('Error visualizing graph:', error);
    }
  }
  
  /**
   * Save the current graph
   * 
   * @param {string} destination - Where to save ('disk' or 'ipfs')
   */
  async saveGraph(destination = 'disk') {
    try {
      if (destination === 'disk') {
        // In a real app, we'd use a file dialog
        // For this demo, we'll use a fixed path
        const savePath = prompt('Enter save path:', './graph.json');
        if (!savePath) return;
        
        this.updateStatus('Saving graph to disk...');
        const result = await this.graphrag.saveToDisk(savePath);
        
        if (result && result.error) {
          throw new Error(result.error);
        }
        
        this.updateStatus(`Graph saved to disk at ${savePath}`, 'success');
      }
    } catch (error) {
      this.updateStatus(`Error saving graph: ${error.message}`, 'error');
      console.error('Error saving graph:', error);
    }
  }
  
  /**
   * Load a graph
   * 
   * @param {string} source - Where to load from ('disk' or 'ipfs')
   */
  async loadGraph(source = 'disk') {
    try {
      if (source === 'disk') {
        // In a real app, we'd use a file dialog
        // For this demo, we'll use a fixed path
        const loadPath = prompt('Enter load path:', './graph.json');
        if (!loadPath) return;
        
        this.updateStatus('Loading graph from disk...');
        const result = await this.graphrag.loadFromDisk(loadPath);
        
        if (result && result.error) {
          throw new Error(result.error);
        }
        
        this.updateStatus(`Graph loaded from disk from ${loadPath}`, 'success');
        
        // Update visualization
        await this.visualizeGraph();
      }
    } catch (error) {
      this.updateStatus(`Error loading graph: ${error.message}`, 'error');
      console.error('Error loading graph:', error);
    }
  }
  
  /**
   * Handle IPFS operations
   * 
   * @param {string} operation - Operation to perform ('save' or 'load')
   */
  async handleIpfsOperation(operation) {
    try {
      // Check if IPFS is available
      if (!this.graphrag.ipfsKit) {
        this.updateStatus('IPFS Kit not available. Cannot perform IPFS operations.', 'error');
        return;
      }
      
      if (operation === 'save') {
        this.updateStatus('Saving graph to IPFS...');
        const cid = await this.graphrag.saveToIpfs();
        
        if (cid && cid.error) {
          throw new Error(cid.error);
        }
        
        this.updateStatus(`Graph saved to IPFS with CID: ${cid}`, 'success');
      } else if (operation === 'load') {
        const cid = prompt('Enter IPFS CID:');
        if (!cid) return;
        
        this.updateStatus(`Loading graph from IPFS (CID: ${cid})...`);
        const result = await this.graphrag.loadFromIpfs(cid);
        
        if (result && result.error) {
          throw new Error(result.error);
        }
        
        this.updateStatus(`Graph loaded from IPFS (CID: ${cid})`, 'success');
        
        // Update visualization
        await this.visualizeGraph();
      }
    } catch (error) {
      this.updateStatus(`Error with IPFS operation: ${error.message}`, 'error');
      console.error('Error with IPFS operation:', error);
    }
  }
  
  /**
   * Clear the current graph
   */
  async clearGraph() {
    try {
      // In a real implementation, this would call a clearGraph method on the GraphRAG instance
      // For now, we'll just re-initialize and update the visualization
      await this.graphrag.init();
      this.updateStatus('Graph cleared', 'success');
      
      // Clear visualization
      const container = document.getElementById('graph-visualization');
      if (container) {
        container.innerHTML = '';
      }
      
      // Clear results
      const resultsContainer = document.getElementById('query-results');
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
      }
    } catch (error) {
      this.updateStatus(`Error clearing graph: ${error.message}`, 'error');
      console.error('Error clearing graph:', error);
    }
  }
  
  /**
   * Update status message
   * 
   * @param {string} message - Status message
   * @param {string} type - Message type ('info', 'error', 'success')
   */
  updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status-message');
    if (!statusElement) return;
    
    // Update message
    statusElement.textContent = message;
    
    // Update class
    statusElement.className = '';
    statusElement.classList.add('status-message', type);
    
    // Log to console
    const logMethod = type === 'error' ? console.error : 
                     type === 'success' ? console.log : console.info;
    logMethod(`[GraphRAG Dashboard] ${message}`);
  }
}

export default GraphRAGDashboard;