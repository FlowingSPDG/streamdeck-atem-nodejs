import { Atem } from "atem-connection";
import { EventEmitter } from "events";

/**
 * ATEM connection information
 */
interface AtemConnection {
	atem: Atem;
	isConnected: boolean;
	connectionPromise: Promise<void> | null;
	retryCount: number;
	lastRetryTime: number;
}

/**
 * State change listener information
 */
interface StateChangeListener {
	ip: string;
	callback: (ip: string, state: any) => void;
}

/**
 * ATEM Connection Manager
 * Provides connection pooling for ATEMs with the same IP address and automatic retry functionality.
 */
export class AtemConnectionManager extends EventEmitter {
	private connections: Map<string, AtemConnection> = new Map();
	private stateListeners: Map<string, StateChangeListener[]> = new Map();
	private readonly maxRetries: number = 10;
	private readonly retryDelay: number = 5000; // 5 seconds
	private readonly connectionTimeout: number = 10000; // 10 seconds

	/**
	 * Connects to an ATEM.
	 * Reuses an existing connection if one already exists for the same IP.
	 * @param ip ATEM IP address
	 * @returns ATEM instance
	 */
	async getConnection(ip: string): Promise<Atem> {
		const existingConnection = this.connections.get(ip);

		// Reuse existing connection if already connected and valid
		if (existingConnection && existingConnection.isConnected) {
			return existingConnection.atem;
		}

		// Wait for ongoing connection if in progress
		if (existingConnection && existingConnection.connectionPromise) {
			await existingConnection.connectionPromise;
			if (existingConnection.isConnected) {
				return existingConnection.atem;
			}
		}

		// Create new connection
		return this.createConnection(ip);
	}

	/**
	 * Creates a new ATEM connection.
	 * @param ip ATEM IP address
	 * @returns ATEM instance
	 */
	private async createConnection(ip: string): Promise<Atem> {
		let connection = this.connections.get(ip);

		if (!connection) {
			const atem = new Atem();
			connection = {
				atem,
				isConnected: false,
				connectionPromise: null,
				retryCount: 0,
				lastRetryTime: 0,
			};
			this.connections.set(ip, connection);

			// Set up event listeners
			this.setupEventListeners(ip, atem);
		}

		// Start connection process
		connection.connectionPromise = this.connectWithRetry(ip, connection);
		await connection.connectionPromise;

		if (!connection.isConnected) {
			throw new Error(`Failed to connect to ATEM at ${ip} after ${this.maxRetries} retries`);
		}

		return connection.atem;
	}

	/**
	 * Attempts to connect with retry functionality.
	 * @param ip ATEM IP address
	 * @param connection Connection information
	 */
	private async connectWithRetry(ip: string, connection: AtemConnection): Promise<void> {
		const atem = connection.atem;
		console.log(`[DEBUG ConnectionManager] Starting connection to ${ip}`);

		while (connection.retryCount < this.maxRetries) {
			try {
				// Set connection timeout
				const connectPromise = new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Connection timeout"));
					}, this.connectionTimeout);

					atem.once("connected", () => {
						clearTimeout(timeout);
						connection.isConnected = true;
						connection.retryCount = 0;
						connection.lastRetryTime = Date.now();
						console.log(`[DEBUG ConnectionManager] Connected to ${ip}, isConnected: ${connection.isConnected}`);
						this.emit("connected", ip);
						resolve();
					});

					atem.once("error", (error: string) => {
						clearTimeout(timeout);
						console.log(`[DEBUG ConnectionManager] Connection error for ${ip}: ${error}`);
						reject(new Error(error));
					});

					console.log(`[DEBUG ConnectionManager] Calling atem.connect(${ip})`);
					atem.connect(ip);
				});

				await connectPromise;
				console.log(`[DEBUG ConnectionManager] Connection successful for ${ip}`);
				return; // Connection successful
			} catch (error) {
				connection.retryCount++;
				connection.lastRetryTime = Date.now();
				this.emit("retry", ip, connection.retryCount, error);

				if (connection.retryCount >= this.maxRetries) {
					connection.isConnected = false;
					connection.connectionPromise = null;
					this.emit("connectionFailed", ip, error);
					throw error;
				}

				// Wait before retry
				await this.delay(this.retryDelay);
			}
		}
	}

	/**
	 * Sets up event listeners.
	 * @param ip ATEM IP address
	 * @param atem ATEM instance
	 */
	private setupEventListeners(ip: string, atem: Atem): void {
		atem.on("connected", () => {
			const connection = this.connections.get(ip);
			if (connection) {
				connection.isConnected = true;
				connection.retryCount = 0;
			}
			this.emit("connected", ip);
		});

		atem.on("disconnected", () => {
			const connection = this.connections.get(ip);
			if (connection) {
				connection.isConnected = false;
				connection.connectionPromise = null;
			}
			this.emit("disconnected", ip);

			// Attempt automatic reconnection
			if (connection) {
				this.attemptReconnect(ip, connection);
			}
		});

		atem.on("error", (error: string) => {
			this.emit("error", ip, error);
			const connection = this.connections.get(ip);
			if (connection) {
				connection.isConnected = false;
				// Attempt reconnection on error as well
				this.attemptReconnect(ip, connection);
			}
		});

		// Listen for state changes
		atem.on("stateChanged", (state: any, pathToChange: string[]) => {
			this.emit("stateChanged", ip, state, pathToChange);
			
			// Notify registered listeners
			const listeners = this.stateListeners.get(ip);
			if (listeners) {
				listeners.forEach(listener => {
					try {
						listener.callback(ip, state);
					} catch (error) {
						console.error(`[ConnectionManager] Error in state listener for ${ip}:`, error);
					}
				});
			}
		});
	}

	/**
	 * Attempts to reconnect.
	 * @param ip ATEM IP address
	 * @param connection Connection information
	 */
	private async attemptReconnect(ip: string, connection: AtemConnection): Promise<void> {
		// Skip if reconnection is already in progress
		if (connection.connectionPromise) {
			return;
		}

		// If retry limit reached, wait a bit longer before retrying
		if (connection.retryCount >= this.maxRetries) {
			await this.delay(this.retryDelay * 2);
			connection.retryCount = 0; // Reset and retry
		}

		// Attempt reconnection
		try {
			connection.connectionPromise = this.connectWithRetry(ip, connection);
			await connection.connectionPromise;
		} catch (error) {
			// Log reconnection failure but don't throw exception
			this.emit("reconnectFailed", ip, error);
		}
	}

	/**
	 * Disconnects the connection for the specified IP.
	 * @param ip ATEM IP address
	 */
	async disconnect(ip: string): Promise<void> {
		const connection = this.connections.get(ip);
		if (connection) {
			connection.connectionPromise = null;
			if (connection.isConnected) {
				connection.atem.disconnect();
			}
			this.connections.delete(ip);
		}
	}

	/**
	 * Disconnects all connections.
	 */
	async disconnectAll(): Promise<void> {
		const disconnectPromises = Array.from(this.connections.keys()).map((ip) =>
			this.disconnect(ip)
		);
		await Promise.all(disconnectPromises);
	}

	/**
	 * Waits for the specified number of milliseconds.
	 * @param ms Wait time in milliseconds
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Gets the connection status.
	 * @param ip ATEM IP address
	 * @returns true if connected
	 */
	isConnected(ip: string): boolean {
		const connection = this.connections.get(ip);
		return connection?.isConnected ?? false;
	}

	/**
	 * Gets a list of all connected ATEM IP addresses.
	 * @returns Array of connected ATEM IP addresses
	 */
	getConnectedIPs(): string[] {
		const connectedIPs: string[] = [];
		console.log(`[DEBUG ConnectionManager] Getting connected IPs. Total connections in map: ${this.connections.size}`);
		this.connections.forEach((connection, ip) => {
			console.log(`[DEBUG ConnectionManager] IP: ${ip}, isConnected: ${connection.isConnected}`);
			if (connection.isConnected) {
				connectedIPs.push(ip);
			}
		});
		console.log(`[DEBUG ConnectionManager] Returning ${connectedIPs.length} connected IPs: ${JSON.stringify(connectedIPs)}`);
		return connectedIPs;
	}

	/**
	 * Gets the number of Mix Effects for a connected ATEM.
	 * @param ip ATEM IP address
	 * @returns Number of Mix Effects, or 0 if not connected or unavailable
	 */
	getMixEffectCount(ip: string): number {
		const connection = this.connections.get(ip);
		if (!connection || !connection.isConnected) {
			console.log(`[DEBUG ConnectionManager] ATEM ${ip} is not connected`);
			return 0;
		}

		if (!connection.atem.state) {
			console.log(`[DEBUG ConnectionManager] ATEM ${ip} state is not available`);
			return 0;
		}

		const mixEffectCount = connection.atem.state.info.capabilities?.mixEffects ?? 0;
		console.log(`[DEBUG ConnectionManager] ATEM ${ip} has ${mixEffectCount} Mix Effect(s)`);
		return mixEffectCount;
	}

	/**
	 * Gets the current state of an ATEM.
	 * @param ip ATEM IP address
	 * @returns ATEM state, or null if not connected
	 */
	getState(ip: string): any | null {
		const connection = this.connections.get(ip);
		if (!connection || !connection.isConnected || !connection.atem.state) {
			return null;
		}
		return connection.atem.state;
	}

	/**
	 * Registers a state change listener for a specific ATEM.
	 * @param listenerId Unique identifier for the listener
	 * @param ip ATEM IP address
	 * @param callback Callback function to be called when state changes
	 */
	addStateListener(listenerId: string, ip: string, callback: (ip: string, state: any) => void): void {
		if (!this.stateListeners.has(ip)) {
			this.stateListeners.set(ip, []);
		}
		
		const listeners = this.stateListeners.get(ip)!;
		
		// Remove existing listener with same ID if exists
		const existingIndex = listeners.findIndex(l => l.callback === callback);
		if (existingIndex !== -1) {
			listeners.splice(existingIndex, 1);
		}
		
		listeners.push({ ip, callback });
		console.log(`[DEBUG ConnectionManager] Added state listener for ${ip}. Total listeners: ${listeners.length}`);
	}

	/**
	 * Removes a state change listener.
	 * @param listenerId Unique identifier for the listener
	 * @param ip ATEM IP address
	 */
	removeStateListener(listenerId: string, ip: string, callback: (ip: string, state: any) => void): void {
		const listeners = this.stateListeners.get(ip);
		if (!listeners) {
			return;
		}

		const index = listeners.findIndex(l => l.callback === callback);
		if (index !== -1) {
			listeners.splice(index, 1);
			console.log(`[DEBUG ConnectionManager] Removed state listener for ${ip}. Remaining listeners: ${listeners.length}`);
		}

		// Clean up empty listener arrays
		if (listeners.length === 0) {
			this.stateListeners.delete(ip);
		}
	}

	/**
	 * Gets available input sources for a connected ATEM.
	 * @param ip ATEM IP address
	 * @returns Array of input sources
	 */
	getInputSources(ip: string): Array<{ id: number; name: string }> {
		const connection = this.connections.get(ip);
		if (!connection || !connection.isConnected || !connection.atem.state) {
			return [];
		}

		const inputs = connection.atem.state.inputs;
		const sources: Array<{ id: number; name: string }> = [];

		for (const [key, value] of Object.entries(inputs)) {
			const inputId = parseInt(key, 10);
			if (!isNaN(inputId) && value && typeof value === 'object' && 'longName' in value) {
				sources.push({
					id: inputId,
					name: (value as any).longName || (value as any).shortName || `Input ${inputId}`
				});
			}
		}

		// Sort by input ID
		sources.sort((a, b) => a.id - b.id);

		return sources;
	}
}
