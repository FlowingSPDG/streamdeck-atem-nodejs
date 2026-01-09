import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, SendToPluginEvent, DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Set Program Input Action
 * Sets the Program input for the specified Mix Effect.
 * Provides tally light feedback when the actual program matches the configured input.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.setprograminput" })
export class AtemSetProgramInput extends SingletonAction<AtemSetProgramInputSettings> {
	private stateListeners: Map<string, (ip: string, state: any) => void> = new Map();

	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemSetProgramInputSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}
		if (settings.input === undefined) {
			settings.input = 1;
		}

		await ev.action.setSettings(settings);

		// Register state listener for tally light
		await this.registerStateListener(ev.action.id, settings);

		// Initial tally update
		await this.updateTallyLight(ev.action.id, settings);
	}

	/**
	 * Called when the action disappears from Stream Deck.
	 */
	override async onWillDisappear(ev: WillDisappearEvent<AtemSetProgramInputSettings>): Promise<void> {
		// Unregister state listener
		this.unregisterStateListener(ev.action.id, ev.payload.settings);
	}

	/**
	 * Called when settings are changed.
	 */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<AtemSetProgramInputSettings>): Promise<void> {
		const { settings } = ev.payload;
		streamDeck.logger.info(`[SetProgram ${ev.action.id}] Settings changed`);
		
		// Re-register state listener with new settings
		await this.registerStateListener(ev.action.id, settings);
		
		// Update tally light with new settings
		await this.updateTallyLight(ev.action.id, settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemSetProgramInputSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert parameters to integers
		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		const input = typeof settings.input === "string" 
			? parseInt(settings.input, 10) 
			: (settings.input ?? 1);

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Set Program Input
			streamDeck.logger.info(`Setting Program Input to ${input} on ME ${mixEffect}...`);
			await atem.changeProgramInput(input, mixEffect);

			streamDeck.logger.info(`Program Input set to ${input} on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to set Program Input: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemSetProgramInputSettings>): Promise<void> {
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
				await streamDeck.ui.sendToPropertyInspector({
					event: "getMixEffects",
					items: [{ label: "ME 1", value: "0" }]
				});
				return;
			}

			const mixEffectCount = atemConnectionManager.getMixEffectCount(atemIp);
			const items = [];
			if (mixEffectCount === 0) {
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

		// Handle data-source request for Input Sources
		if (payload && payload.event === "getInputSources") {
			const settings = await ev.action.getSettings();
			const atemIp = settings.atemIp;

			if (!atemIp) {
				await streamDeck.ui.sendToPropertyInspector({
					event: "getInputSources",
					items: [{ label: "Input 1", value: "1" }]
				});
				return;
			}

			const sources = atemConnectionManager.getInputSources(atemIp);
			const items = sources.length > 0 
				? sources.map(source => ({ label: source.name, value: String(source.id) }))
				: [{ label: "Input 1", value: "1" }];

			await streamDeck.ui.sendToPropertyInspector({
				event: "getInputSources",
				items
			});
		}
	}

	/**
	 * Registers a state listener for tally light functionality.
	 */
	private async registerStateListener(actionId: string, settings: AtemSetProgramInputSettings): Promise<void> {
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[SetProgram ${actionId}] Cannot register state listener: No ATEM IP`);
			return;
		}

		// Remove existing listener if any
		this.unregisterStateListener(actionId, settings);

		// Create new listener
		const listener = async (ip: string, state: any) => {
			streamDeck.logger.debug(`[SetProgram ${actionId}] State changed for ${ip}`);
			if (ip === settings.atemIp) {
				await this.updateTallyLight(actionId, settings);
			}
		};

		this.stateListeners.set(actionId, listener);
		atemConnectionManager.addStateListener(actionId, settings.atemIp, listener);
		streamDeck.logger.info(`[SetProgram ${actionId}] Registered state listener for ${settings.atemIp}`);
	}

	/**
	 * Unregisters a state listener.
	 */
	private unregisterStateListener(actionId: string, settings: AtemSetProgramInputSettings): void {
		const listener = this.stateListeners.get(actionId);
		if (listener && settings.atemIp) {
			atemConnectionManager.removeStateListener(actionId, settings.atemIp, listener);
			this.stateListeners.delete(actionId);
		}
	}

	/**
	 * Updates the tally light based on current ATEM state.
	 */
	private async updateTallyLight(actionId: string, settings: AtemSetProgramInputSettings): Promise<void> {
		streamDeck.logger.debug(`[SetProgram ${actionId}] updateTallyLight called`);
		
		if (!settings.atemIp) {
			streamDeck.logger.warn(`[SetProgram ${actionId}] No ATEM IP configured`);
			return;
		}

		const action = streamDeck.actions.getActionById(actionId);
		if (!action) {
			streamDeck.logger.warn(`[SetProgram ${actionId}] Action not found`);
			return;
		}

		const state = atemConnectionManager.getState(settings.atemIp);
		if (!state) {
			// Not connected - clear color
			streamDeck.logger.debug(`[SetProgram ${actionId}] No state available, clearing image`);
			await action.setImage();
			return;
		}

		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		const input = typeof settings.input === "string" 
			? parseInt(settings.input, 10) 
			: (settings.input ?? 1);

		// Check if current program matches the configured input
		const currentProgram = state.video?.mixEffects?.[mixEffect]?.programInput;
		
		streamDeck.logger.info(`[SetProgram ${actionId}] Current program: ${currentProgram}, Target: ${input}`);
		
		if (currentProgram === input) {
			// Match - set to red for program (tally light)
			streamDeck.logger.info(`[SetProgram ${actionId}] Setting RED tally (ON AIR)`);
			await action.setImage("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='144'%3E%3Crect width='144' height='144' fill='%23ff0000'/%3E%3C/svg%3E");
		} else {
			// No match - clear image to show default
			streamDeck.logger.info(`[SetProgram ${actionId}] Clearing tally (OFF AIR)`);
			await action.setImage();
		}
	}
}

/**
 * Settings for the ATEM Set Program Input action.
 */
type AtemSetProgramInputSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) */
	mixEffect?: number | string;
	/** Input source number */
	input?: number | string;
};
