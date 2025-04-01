// Production configuration for hallucinate_app
// This file defines real resource settings rather than using mock implementations.

module.exports = {
  // Database resources configuration for production
  databaseResources: {
    orbitDb: {
      provider: "real",
      connectionString: "ipfs://orbitdb/production-db",
      options: {
        replicationFactor: 3
      }
    },
    fireproofDb: {
      provider: "real",
      connectionString: "ipfs://fireproofdb/production-backup",
      options: {
        mirror: true
      }
    },
    duckDb: {
      provider: "real",
      connectionString: "./data/duckdb/production.db",
      options: {
        enableIPLDConversion: true
      }
    }
  },
  // Synchronization directory for Database Sync Manager
  syncDir: "./sync_test",
  // Disable mock implementations in production
  useMock: false,
  
  // Additional production configuration settings
  ipfs: {
    nodeAddress: "http://127.0.0.1:5001",
    gateway: "https://ipfs.io/ipfs/"
  },
  auth: {
    ucanExpirySeconds: 3600
  },
  keystore: {
    encryptionKey: process.env.KEYSTORE_MASTER_KEY || "REPLACE_WITH_REAL_MASTER_KEY"
  }
};
