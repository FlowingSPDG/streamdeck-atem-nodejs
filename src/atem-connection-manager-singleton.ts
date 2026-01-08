import { AtemConnectionManager } from "./atem-connection-manager";

/**
 * Singleton instance of AtemConnectionManager
 * A single connection manager shared across the entire plugin
 */
export const atemConnectionManager = new AtemConnectionManager();
