import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, SendToPluginEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Auto Transition Action
 * Executes an Auto Transition (transition with effects like Mix, Dip, Wipe, etc.) 
 * between Program and Preview on the specified Mix Effect.
 * Lights up red while transition is in progress.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.auto" })
export class AtemAutoTransition extends SingletonAction<AtemAutoTransitionSettings> {
	private stateListeners: Map<string, (ip: string, state: any) => void> = new Map();

	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemAutoTransitionSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}

		await ev.action.setSettings(settings);

		// Register state listener for transition indicator
		await this.registerStateListener(ev.action.id, settings);

		// Initial state update
		await this.updateTransitionIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the action disappears from Stream Deck.
	 */
	override async onWillDisappear(ev: WillDisappearEvent<AtemAutoTransitionSettings>): Promise<void> {
		// Unregister state listener
		this.unregisterStateListener(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when settings are changed.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<AtemAutoTransitionSettings>): Promise<void> {
		const { settings } = ev.payload;
		streamDeck.logger.info(`[Auto ${ev.action.id}] Settings changed`);
		
		// Re-register state listener with new settings
		await this.registerStateListener(ev.action.id, settings);
		
		// Update transition indicator with new settings
		await this.updateTransitionIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemAutoTransitionSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert Mix Effect number to integer
		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Execute Auto Transition
			streamDeck.logger.info(`Executing Auto Transition on ME ${mixEffect}...`);
			await atem.autoTransition(mixEffect);

			streamDeck.logger.info(`Auto Transition executed successfully on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to execute Auto Transition: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemAutoTransitionSettings>): Promise<void> {
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

		// Handle data-source request for Mix Effects
		if (payload && payload.event === "getMixEffects") {
			const settings = await ev.action.getSettings();
			const atemIp = settings.atemIp;

			if (!atemIp) {
				streamDeck.logger.info(`Data-source request (getMixEffects): No ATEM IP configured`);
				await streamDeck.ui.sendToPropertyInspector({
					event: "getMixEffects",
					items: [{ label: "ME 1", value: "0" }]
				});
				return;
			}

			const mixEffectCount = atemConnectionManager.getMixEffectCount(atemIp);
			streamDeck.logger.info(`Data-source request: ATEM ${atemIp} has ${mixEffectCount} Mix Effect(s)`);

			// Generate Mix Effect list based on count
			const items = [];
			if (mixEffectCount === 0) {
				// Default to 1 ME if not connected or unavailable
				items.push({ label: "ME 1", value: "0" });
			} else {
				for (let i = 0; i < mixEffectCount; i++) {
					items.push({
						label: `ME ${i + 1}`,
						value: String(i)
					});
				}
			}

			await streamDeck.ui.sendToPropertyInspector({
				event: "getMixEffects",
				items
			});
		}
	}

	/**
	 * Registers a state listener for transition indicator.
	 */
	private async registerStateListener(actionId: string, settings: AtemAutoTransitionSettings): Promise<void> {
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[Auto ${actionId}] Cannot register state listener: No ATEM IP`);
			return;
		}

		// Remove existing listener if any
		this.unregisterStateListener(actionId, settings);

		// Create new listener
		const listener = async (ip: string, state: any) => {
			streamDeck.logger.debug(`[Auto ${actionId}] State changed for ${ip}`);
			if (ip === settings.atemIp) {
				await this.updateTransitionIndicator(actionId, settings);
			}
		};

		this.stateListeners.set(actionId, listener);
		atemConnectionManager.addStateListener(actionId, settings.atemIp, listener);
		streamDeck.logger.info(`[Auto ${actionId}] Registered state listener for ${settings.atemIp}`);
	}

	/**
	 * Unregisters a state listener.
	 */
	private unregisterStateListener(actionId: string, settings: AtemAutoTransitionSettings): void {
		const listener = this.stateListeners.get(actionId);
		if (listener && settings.atemIp) {
			atemConnectionManager.removeStateListener(actionId, settings.atemIp, listener);
			this.stateListeners.delete(actionId);
		}
	}

	/**
	 * Updates the transition indicator based on current ATEM state.
	 */
	private async updateTransitionIndicator(actionId: string, settings: AtemAutoTransitionSettings): Promise<void> {
		streamDeck.logger.debug(`[Auto ${actionId}] updateTransitionIndicator called`);
		
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[Auto ${actionId}] No ATEM IP configured`);
			return;
		}

		const action = streamDeck.actions.getActionById(actionId);
		if (!action) {
			streamDeck.logger.warn(`[Auto ${actionId}] Action not found`);
			return;
		}

		const state = atemConnectionManager.getState(settings.atemIp);
		if (!state) {
			// Not connected - clear color
			streamDeck.logger.debug(`[Auto ${actionId}] No state available, clearing image`);
			await action.setImage();
			return;
		}

		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		// Check if transition is in progress
		const meState = state.video?.mixEffects?.[mixEffect];
		if (!meState) {
			streamDeck.logger.debug(`[Auto ${actionId}] MixEffect ${mixEffect} not found in state`);
			await action.setImage();
			return;
		}

		// transitionPosition is an object with 'inTransition', 'remainingFrames', and 'handlePosition' properties
		let inTransition = false;
		
		if (typeof meState.transitionPosition === 'object' && meState.transitionPosition !== null) {
			// Check if transitionPosition object has inTransition property
			if ('inTransition' in meState.transitionPosition) {
				inTransition = meState.transitionPosition.inTransition;
			} else if ('handlePosition' in meState.transitionPosition) {
				// handlePosition is 0-10000, transition is in progress if > 0 and < 10000
				const handlePosition = meState.transitionPosition.handlePosition;
				inTransition = handlePosition > 0 && handlePosition < 10000;
			}
		} else if (typeof meState.transitionPosition === 'number') {
			// Fallback: if it's a number, check if it's between 0 and 10000
			inTransition = meState.transitionPosition > 0 && meState.transitionPosition < 10000;
		}
		
		if (inTransition) {
			// Transition in progress - set to red
			await action.setImage("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='%23ff0000'/%3E%3C/svg%3E");
		} else {
			// No transition - clear image to show default
			await action.setImage();
		}
	}
}

/**
 * Settings for the ATEM Auto Transition action.
 */
type AtemAutoTransitionSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) */
	mixEffect?: number | string;
};
