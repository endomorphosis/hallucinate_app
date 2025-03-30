/**
 * IPFS Kit Dashboard Panel Component
 * 
 * This module provides a dashboard panel component for displaying IPFS Kit status and operations.
 */

import { registerIPFSKitDashboard } from '../register_ipfs_dashboard.js';

/**
 * Initialize IPFS Kit panel component.
 * 
 * @param {Object} dashboard - Dashboard instance
 * @param {Object} options - Component options
 */
export function initComponent(dashboard, options = {}) {
  return registerIPFSKitDashboard(dashboard, {
    ...options,
    autoInitialize: options.autoInitialize !== false,
  });
}

// Component metadata
export const metadata = {
  name: 'IPFS Kit',
  description: 'Monitor and control IPFS operations',
  version: '1.0.0',
  author: 'Hallucinate App',
  icon: 'network',
  priority: 50,
  category: 'Storage',
};

export default {
  initComponent,
  metadata,
};