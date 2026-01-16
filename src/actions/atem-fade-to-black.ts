import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, SendToPluginEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Fade to Black Action
 * Executes Fade to Black on the specified Mix Effect.
 * Provides visual feedback when fade to black is active.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.fadetoblack" })
export class AtemFadeToBlack extends SingletonAction<AtemFadeToBlackSettings> {
	private stateListeners: Map<string, (ip: string, state: any) => void> = new Map();

	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemFadeToBlackSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}

		await ev.action.setSettings(settings);

		// Register state listener for fade to black indicator
		await this.registerStateListener(ev.action.id, settings);

		// Initial state update
		await this.updateFadeToBlackIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the action disappears from Stream Deck.
	 */
	override async onWillDisappear(ev: WillDisappearEvent<AtemFadeToBlackSettings>): Promise<void> {
		// Unregister state listener
		this.unregisterStateListener(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when settings are changed.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<AtemFadeToBlackSettings>): Promise<void> {
		const { settings } = ev.payload;
		streamDeck.logger.info(`[FadeToBlack ${ev.action.id}] Settings changed`);
		
		// Re-register state listener with new settings
		await this.registerStateListener(ev.action.id, settings);
		
		// Update fade to black indicator with new settings
		await this.updateFadeToBlackIndicator(ev.action.id, settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemFadeToBlackSettings>): Promise<void> {
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

			// Execute Fade to Black
			streamDeck.logger.info(`Executing Fade to Black on ME ${mixEffect}...`);
			await atem.fadeToBlack(mixEffect);

			streamDeck.logger.info(`Fade to Black executed successfully on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to execute Fade to Black: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemFadeToBlackSettings>): Promise<void> {
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
	 * Registers a state listener for fade to black indicator.
	 */
	private async registerStateListener(actionId: string, settings: AtemFadeToBlackSettings): Promise<void> {
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[FadeToBlack ${actionId}] Cannot register state listener: No ATEM IP`);
			return;
		}

		// Remove existing listener if any
		this.unregisterStateListener(actionId, settings);

		// Create new listener
		const listener = async (ip: string, state: any) => {
			streamDeck.logger.debug(`[FadeToBlack ${actionId}] State changed for ${ip}`);
			if (ip === settings.atemIp) {
				await this.updateFadeToBlackIndicator(actionId, settings);
			}
		};

		this.stateListeners.set(actionId, listener);
		atemConnectionManager.addStateListener(actionId, settings.atemIp, listener);
		streamDeck.logger.info(`[FadeToBlack ${actionId}] Registered state listener for ${settings.atemIp}`);
	}

	/**
	 * Unregisters a state listener.
	 */
	private unregisterStateListener(actionId: string, settings: AtemFadeToBlackSettings): void {
		const listener = this.stateListeners.get(actionId);
		if (listener && settings.atemIp) {
			atemConnectionManager.removeStateListener(actionId, settings.atemIp, listener);
			this.stateListeners.delete(actionId);
		}
	}

	/**
	 * Updates the fade to black indicator based on current ATEM state.
	 */
	private async updateFadeToBlackIndicator(actionId: string, settings: AtemFadeToBlackSettings): Promise<void> {
		streamDeck.logger.debug(`[FadeToBlack ${actionId}] updateFadeToBlackIndicator called`);
		
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[FadeToBlack ${actionId}] No ATEM IP configured`);
			return;
		}

		const action = streamDeck.actions.getActionById(actionId);
		if (!action) {
			streamDeck.logger.warn(`[FadeToBlack ${actionId}] Action not found`);
			return;
		}

		const state = atemConnectionManager.getState(settings.atemIp);
		if (!state) {
			// Not connected - clear color
			streamDeck.logger.debug(`[FadeToBlack ${actionId}] No state available, clearing image`);
			await action.setImage();
			return;
		}

		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		// Check if fade to black is active
		const meState = state.video?.mixEffects?.[mixEffect];
		if (!meState) {
			streamDeck.logger.debug(`[FadeToBlack ${actionId}] MixEffect ${mixEffect} not found in state`);
			await action.setImage();
			return;
		}

		const fadeToBlackState = meState.fadeToBlack;
		if (!fadeToBlackState) {
			streamDeck.logger.debug(`[FadeToBlack ${actionId}] FadeToBlack state not found`);
			await action.setImage();
			return;
		}

		// Check if fade to black is fully black or in progress
		const isFullyBlack = fadeToBlackState.isFullyBlack;
		const inTransition = fadeToBlackState.inTransition;
		
		if (isFullyBlack || inTransition) {
			// Fade to black is active - set to black/dark gray
			const color = isFullyBlack ? "#000000" : "#333333"; // Black when fully black, dark gray when in transition
			await action.setImage(`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='${encodeURIComponent(color)}'/%3E%3C/svg%3E`);
		} else {
			// Not active - clear image to show default
			await action.setImage();
		}
	}
}

/**
 * Settings for the ATEM Fade to Black action.
 */
type AtemFadeToBlackSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) */
	mixEffect?: number | string;
};
