import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Downstream Keyer (DSK) Control Action
 * Controls DSK on/off state on the ATEM switcher.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.dskcontrol" })
export class AtemDskControl extends SingletonAction<AtemDskControlSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemDskControlSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.dskIndex === undefined) {
			settings.dskIndex = 0;
		}
		if (settings.onAir === undefined) {
			settings.onAir = true;
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemDskControlSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert DSK index to integer
		const dskIndex = typeof settings.dskIndex === "string" 
			? parseInt(settings.dskIndex, 10) 
			: (settings.dskIndex ?? 0);

		// Determine onAir state (toggle if not specified)
		let onAir: boolean;
		if (settings.onAir !== undefined) {
			onAir = typeof settings.onAir === "string" 
				? settings.onAir === "true" 
				: settings.onAir;
		} else {
			// Toggle: get current state and invert
			const state = atemConnectionManager.getState(settings.atemIp);
			const currentOnAir = state?.video?.downstreamKeyers?.[dskIndex]?.onAir ?? false;
			onAir = !currentOnAir;
		}

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Set DSK On Air
			streamDeck.logger.info(`Setting DSK ${dskIndex} On Air to ${onAir}...`);
			await atem.setDownstreamKeyOnAir(onAir, dskIndex);

			streamDeck.logger.info(`DSK ${dskIndex} On Air set to ${onAir} successfully`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to set DSK On Air: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemDskControlSettings>): Promise<void> {
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
}

/**
 * Settings for the ATEM DSK Control action.
 */
type AtemDskControlSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** DSK index (0-based) */
	dskIndex?: number | string;
	/** On Air state (true/false, or undefined for toggle) */
	onAir?: boolean | string;
};
