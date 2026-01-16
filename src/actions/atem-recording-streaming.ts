import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent, WillDisappearEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Recording & Streaming Control Action
 * Controls recording and streaming on the ATEM switcher.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.recordingstreaming" })
export class AtemRecordingStreaming extends SingletonAction<AtemRecordingStreamingSettings> {
	private stateListeners: Map<string, (ip: string, state: any) => void> = new Map();

	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemRecordingStreamingSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mode === undefined) {
			settings.mode = "recording";
		}
		if (settings.action === undefined) {
			settings.action = "toggle";
		}

		await ev.action.setSettings(settings);

		// Register state listener for status indicator
		await this.registerStateListener(ev.action.id, settings);

		// Initial state update
		await this.updateStatusIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the action disappears from Stream Deck.
	 */
	override async onWillDisappear(ev: WillDisappearEvent<AtemRecordingStreamingSettings>): Promise<void> {
		// Unregister state listener
		this.unregisterStateListener(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when settings are changed.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<AtemRecordingStreamingSettings>): Promise<void> {
		const { settings } = ev.payload;
		streamDeck.logger.info(`[RecordingStreaming ${ev.action.id}] Settings changed`);
		
		// Re-register state listener with new settings
		await this.registerStateListener(ev.action.id, settings);
		
		// Update status indicator with new settings
		await this.updateStatusIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemRecordingStreamingSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		const mode = typeof settings.mode === "string" 
			? settings.mode 
			: "recording";

		const actionType = typeof settings.action === "string" 
			? settings.action 
			: "toggle";

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			if (mode === "recording") {
				// Handle recording actions
				if (actionType === "start") {
					streamDeck.logger.info("Starting recording...");
					await atem.startRecording();
					streamDeck.logger.info("Recording started successfully");
				} else if (actionType === "stop") {
					streamDeck.logger.info("Stopping recording...");
					await atem.stopRecording();
					streamDeck.logger.info("Recording stopped successfully");
				} else if (actionType === "toggle") {
					// Toggle: get current state and invert
					const state = atemConnectionManager.getState(settings.atemIp);
					const isRecording = state?.recording?.status?.state === 1; // 1 = recording
					if (isRecording) {
						streamDeck.logger.info("Stopping recording...");
						await atem.stopRecording();
					} else {
						streamDeck.logger.info("Starting recording...");
						await atem.startRecording();
					}
				}
			} else if (mode === "streaming") {
				// Handle streaming actions
				if (actionType === "start") {
					streamDeck.logger.info("Starting streaming...");
					await atem.startStreaming();
					streamDeck.logger.info("Streaming started successfully");
				} else if (actionType === "stop") {
					streamDeck.logger.info("Stopping streaming...");
					await atem.stopStreaming();
					streamDeck.logger.info("Streaming stopped successfully");
				} else if (actionType === "toggle") {
					// Toggle: get current state and invert
					const state = atemConnectionManager.getState(settings.atemIp);
					const isStreaming = state?.streaming?.status?.state === 1; // 1 = streaming
					if (isStreaming) {
						streamDeck.logger.info("Stopping streaming...");
						await atem.stopStreaming();
					} else {
						streamDeck.logger.info("Starting streaming...");
						await atem.startStreaming();
					}
				}
			}
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to control ${mode}: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemRecordingStreamingSettings>): Promise<void> {
		const { payload } = ev;

		// Handle data-source request for connected ATEMs
		if (payload && payload.event === "getConnectedATEMs") {
			const connectedIPs = atemConnectionManager.getConnectedIPs();
			streamDeck.logger.info(`Data-source request: Sending ${connectedIPs.length} connected ATEM(s)`);

			await streamDeck.ui.sendToPropertyInspector({
				event: "getConnectedATEMs",
				items: connectedIPs.map(ip => ({
					label: ip,
					value: ip
				}))
			});
		}
	}

	/**
	 * Registers a state listener for status indicator.
	 */
	private async registerStateListener(actionId: string, settings: AtemRecordingStreamingSettings): Promise<void> {
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[RecordingStreaming ${actionId}] Cannot register state listener: No ATEM IP`);
			return;
		}

		// Remove existing listener if any
		this.unregisterStateListener(actionId, settings);

		// Create new listener
		const listener = async (ip: string, state: any) => {
			streamDeck.logger.debug(`[RecordingStreaming ${actionId}] State changed for ${ip}`);
			if (ip === settings.atemIp) {
				await this.updateStatusIndicator(actionId, settings);
			}
		};

		this.stateListeners.set(actionId, listener);
		atemConnectionManager.addStateListener(actionId, settings.atemIp, listener);
		streamDeck.logger.info(`[RecordingStreaming ${actionId}] Registered state listener for ${settings.atemIp}`);
	}

	/**
	 * Unregisters a state listener.
	 */
	private unregisterStateListener(actionId: string, settings: AtemRecordingStreamingSettings): void {
		const listener = this.stateListeners.get(actionId);
		if (listener && settings.atemIp) {
			atemConnectionManager.removeStateListener(actionId, settings.atemIp, listener);
			this.stateListeners.delete(actionId);
		}
	}

	/**
	 * Updates the status indicator based on current ATEM state.
	 */
	private async updateStatusIndicator(actionId: string, settings: AtemRecordingStreamingSettings): Promise<void> {
		streamDeck.logger.debug(`[RecordingStreaming ${actionId}] updateStatusIndicator called`);
		
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[RecordingStreaming ${actionId}] No ATEM IP configured`);
			return;
		}

		const action = streamDeck.actions.getActionById(actionId);
		if (!action) {
			streamDeck.logger.warn(`[RecordingStreaming ${actionId}] Action not found`);
			return;
		}

		const state = atemConnectionManager.getState(settings.atemIp);
		if (!state) {
			// Not connected - clear color
			streamDeck.logger.debug(`[RecordingStreaming ${actionId}] No state available, clearing image`);
			await action.setImage();
			return;
		}

		const mode = typeof settings.mode === "string" 
			? settings.mode 
			: "recording";

		let isActive = false;
		if (mode === "recording") {
			isActive = state.recording?.status?.state === 1; // 1 = recording
		} else if (mode === "streaming") {
			isActive = state.streaming?.status?.state === 1; // 1 = streaming
		}

		if (isActive) {
			// Active - set to red
			await action.setImage("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='%23ff0000'/%3E%3C/svg%3E");
		} else {
			// Not active - clear image to show default
			await action.setImage();
		}
	}
}

/**
 * Settings for the ATEM Recording & Streaming action.
 */
type AtemRecordingStreamingSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mode: "recording" or "streaming" */
	mode?: string;
	/** Action: "start", "stop", or "toggle" */
	action?: string;
};
