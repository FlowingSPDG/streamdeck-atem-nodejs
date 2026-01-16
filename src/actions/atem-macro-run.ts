import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Macro Run Action
 * Executes a macro stored on the ATEM switcher.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.macrorun" })
export class AtemMacroRun extends SingletonAction<AtemMacroRunSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemMacroRunSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.macroIndex === undefined) {
			settings.macroIndex = 0;
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemMacroRunSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert macro index to integer
		const macroIndex = typeof settings.macroIndex === "string" 
			? parseInt(settings.macroIndex, 10) 
			: (settings.macroIndex ?? 0);

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Execute Macro
			streamDeck.logger.info(`Executing Macro ${macroIndex}...`);
			await atem.macroRun(macroIndex);

			streamDeck.logger.info(`Macro ${macroIndex} executed successfully`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to execute Macro: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemMacroRunSettings>): Promise<void> {
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
 * Settings for the ATEM Macro Run action.
 */
type AtemMacroRunSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Macro index (0-based) */
	macroIndex?: number | string;
};
