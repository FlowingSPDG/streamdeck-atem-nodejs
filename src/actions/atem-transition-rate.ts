import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Transition Rate Action
 * Sets the transition rate (speed) for the specified Mix Effect.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.transitionrate" })
export class AtemTransitionRate extends SingletonAction<AtemTransitionRateSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemTransitionRateSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}
		if (settings.rate === undefined) {
			settings.rate = 25; // Default 25 frames (1 second at 25fps)
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemTransitionRateSettings>): Promise<void> {
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

		// Convert rate to integer and clamp to valid range (1-250)
		let rate = typeof settings.rate === "string" 
			? parseInt(settings.rate, 10) 
			: (settings.rate ?? 25);
		
		// Clamp rate to valid range
		rate = Math.max(1, Math.min(250, rate));

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Set Transition Rate
			streamDeck.logger.info(`Setting Transition Rate to ${rate} frames on ME ${mixEffect}...`);
			await atem.setMixTransitionSettings({ rate }, mixEffect);

			streamDeck.logger.info(`Transition Rate set successfully on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to set Transition Rate: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemTransitionRateSettings>): Promise<void> {
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
}

/**
 * Settings for the ATEM Transition Rate action.
 */
type AtemTransitionRateSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) */
	mixEffect?: number | string;
	/** Transition rate in frames (1-250) */
	rate?: number | string;
};
