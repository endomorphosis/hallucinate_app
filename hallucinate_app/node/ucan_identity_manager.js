/**
 * UCAN Identity Manager
 * 
 * Generates and manages a persistent UCAN DID:key identity for the hallucinate app.
 * The identity is created on first launch and persisted to the user data directory.
 * 
 * This identity is used to:
 * - Authenticate with MCP servers via UCAN delegation
 * - Sign content-addressed artifacts (CID provenance)
 * - Establish peer identity in libp2p/IPFS networks
 * - Authorize actions in the SwissKnife virtual desktop
 * 
 * Key format: Ed25519 keypair → DID:key (W3C DID standard)
 */

import { createHash, generateKeyPairSync, sign, verify, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

// DID:key multicodec prefix for Ed25519 public keys (0xed01)
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

/**
 * Generate a DID:key from an Ed25519 public key.
 * Uses multibase base58btc encoding per the did:key specification.
 */
function publicKeyToDID(publicKeyRaw) {
  // Prepend multicodec prefix
  const prefixed = Buffer.concat([ED25519_MULTICODEC_PREFIX, publicKeyRaw]);
  // Encode as base58btc with 'z' multibase prefix
  const encoded = base58Encode(prefixed);
  return `did:key:z${encoded}`;
}

/**
 * Base58 encoder (Bitcoin alphabet)
 */
function base58Encode(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + buffer.toString('hex'));
  let result = '';
  
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    result = ALPHABET[Number(remainder)] + result;
  }
  
  // Leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result;
}

/**
 * UCAN Identity container
 */
class UCANIdentity {
  constructor(did, publicKey, privateKey, createdAt) {
    this.did = did;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.createdAt = createdAt;
    this.capabilities = [];
  }

  /**
   * Sign data with this identity's private key
   */
  sign(data) {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    return sign(null, dataBuffer, {
      key: this.privateKey,
      format: 'der',
      type: 'pkcs8',
    });
  }

  /**
   * Verify a signature against this identity's public key
   */
  verify(data, signature) {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    return verify(null, dataBuffer, {
      key: this.publicKey,
      format: 'der',
      type: 'spki',
    }, signature);
  }

  /**
   * Create a UCAN token (simplified JWT-like format)
   */
  createToken(audience, capabilities, expiration = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'EdDSA', typ: 'JWT', ucv: '0.10.0' };
    const payload = {
      iss: this.did,
      aud: audience,
      exp: now + expiration,
      nbf: now,
      nnc: randomBytes(12).toString('hex'),
      att: capabilities,
      fct: [{ 'ucan/cap': 'mcp-plus-plus/invoke' }],
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;
    const signature = this.sign(sigInput).toString('base64url');

    return `${sigInput}.${signature}`;
  }

  /**
   * Serialize to storable JSON (includes private key — handle securely!)
   */
  toJSON() {
    return {
      did: this.did,
      publicKey: this.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      privateKey: this.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      createdAt: this.createdAt,
      capabilities: this.capabilities,
    };
  }
}

/**
 * UCANIdentityManager handles creation, persistence, and retrieval
 * of the application's DID:key identity.
 */
class UCANIdentityManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.identityPath = path.join(dataDir, 'ucan-identity.json');
    this.identity = null;
    this._initialized = false;
  }

  /**
   * Initialize the identity manager.
   * Creates a new identity if none exists, otherwise loads the existing one.
   */
  async initialize() {
    if (this._initialized) return this.identity;

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    if (existsSync(this.identityPath)) {
      this.identity = this._loadIdentity();
      console.log(`[UCAN] Loaded existing identity: ${this.identity.did}`);
    } else {
      this.identity = this._createIdentity();
      this._saveIdentity();
      console.log(`[UCAN] Created new identity: ${this.identity.did}`);
    }

    this._initialized = true;
    return this.identity;
  }

  /**
   * Get the current identity (must call initialize first)
   */
  getIdentity() {
    if (!this._initialized) {
      throw new Error('UCANIdentityManager not initialized. Call initialize() first.');
    }
    return this.identity;
  }

  /**
   * Get the DID string
   */
  getDID() {
    return this.identity?.did || null;
  }

  /**
   * Create a delegation token for a specific service
   */
  createDelegation(serviceAudience, capabilities = ['*']) {
    if (!this.identity) throw new Error('Identity not initialized');
    return this.identity.createToken(serviceAudience, capabilities);
  }

  /**
   * Get identity info (safe to expose to renderer)
   */
  getPublicInfo() {
    if (!this.identity) return null;
    return {
      did: this.identity.did,
      createdAt: this.identity.createdAt,
      capabilities: this.identity.capabilities,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  _createIdentity() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    
    // Extract raw public key bytes for DID generation
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    // Ed25519 SPKI DER has 12-byte header, raw key starts at offset 12
    const rawPublicKey = spkiDer.slice(12);
    
    const did = publicKeyToDID(rawPublicKey);
    const createdAt = new Date().toISOString();
    
    return new UCANIdentity(did, publicKey, privateKey, createdAt);
  }

  _loadIdentity() {
    try {
      const data = JSON.parse(readFileSync(this.identityPath, 'utf-8'));
      const { createPublicKey, createPrivateKey } = require('crypto');
      
      const publicKey = createPublicKey({
        key: Buffer.from(data.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      
      const privateKey = createPrivateKey({
        key: Buffer.from(data.privateKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
      });
      
      const identity = new UCANIdentity(data.did, publicKey, privateKey, data.createdAt);
      identity.capabilities = data.capabilities || [];
      return identity;
    } catch (err) {
      console.warn('[UCAN] Failed to load identity, creating new one:', err.message);
      const identity = this._createIdentity();
      this._saveIdentity();
      return identity;
    }
  }

  _saveIdentity() {
    try {
      const data = this.identity.toJSON();
      writeFileSync(this.identityPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('[UCAN] Failed to save identity:', err.message);
    }
  }
}

export default UCANIdentityManager;
export { UCANIdentity, UCANIdentityManager, publicKeyToDID };
