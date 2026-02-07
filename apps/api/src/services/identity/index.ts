/**
 * Identity Service - Main Export
 * 
 * Persistent NOEMA identity and lifetime tracking.
 */

export {
  loadIdentity,
  refreshIdentity,
  recordRunStart,
  getAge,
  formatIdentityStatement,
  type NoemaIdentity,
} from "./noema_identity.js";
