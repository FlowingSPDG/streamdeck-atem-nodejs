import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Transition Style Action
 * Sets the transition style (Mix, Dip, Wipe, DVE, Stinger) for the specified Mix Effect.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.transitionstyle" })
export class AtemTransitionStyle extends SingletonAction<AtemTransitionStyleSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemTransitionStyleSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}
		if (settings.transitionStyle === undefined) {
			settings.transitionStyle = "0"; // MIX
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemTransitionStyleSettings>): Promise<void> {
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

		// Convert transition style to integer
		const transitionStyle = typeof settings.transitionStyle === "string" 
			? parseInt(settings.transitionStyle, 10) 
			: (settings.transitionStyle ?? 0);

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Set Transition Style
			streamDeck.logger.info(`Setting Transition Style to ${transitionStyle} on ME ${mixEffect}...`);
			await atem.setTransitionStyle({ nextStyle: transitionStyle }, mixEffect);

			streamDeck.logger.info(`Transition Style set successfully on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to set Transition Style: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemTransitionStyleSettings>): Promise<void> {
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
 * Settings for the ATEM Transition Style action.
 */
type AtemTransitionStyleSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) */
	mixEffect?: number | string;
	/** Transition style (0=MIX, 1=DIP, 2=WIPE, 3=DVE, 4=STINGER) */
	transitionStyle?: number | string;
};
