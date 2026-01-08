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
 * ATEM Connection Manager
 * Provides connection pooling for ATEMs with the same IP address and automatic retry functionality.
 */
export class AtemConnectionManager extends EventEmitter {
	private connections: Map<string, AtemConnection> = new Map();
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
						this.emit("connected", ip);
						resolve();
					});

					atem.once("error", (error: string) => {
						clearTimeout(timeout);
						reject(new Error(error));
					});

					atem.connect(ip);
				});

				await connectPromise;
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
}
