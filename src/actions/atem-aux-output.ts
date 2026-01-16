import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Auxiliary Output Control Action
 * Sets the input source for an Auxiliary output bus.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.auxoutput" })
export class AtemAuxOutput extends SingletonAction<AtemAuxOutputSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemAuxOutputSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.auxBus === undefined) {
			settings.auxBus = 0;
		}
		if (settings.input === undefined) {
			settings.input = 1;
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemAuxOutputSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert parameters to integers
		const auxBus = typeof settings.auxBus === "string" 
			? parseInt(settings.auxBus, 10) 
			: (settings.auxBus ?? 0);

		const input = typeof settings.input === "string" 
			? parseInt(settings.input, 10) 
			: (settings.input ?? 1);

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Set Aux Source
			streamDeck.logger.info(`Setting Aux ${auxBus} to Input ${input}...`);
			await atem.setAuxSource(input, auxBus);

			streamDeck.logger.info(`Aux ${auxBus} set to Input ${input} successfully`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to set Aux Source: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemAuxOutputSettings>): Promise<void> {
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
}

/**
 * Settings for the ATEM Aux Output action.
 */
type AtemAuxOutputSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Aux bus number (0-based) */
	auxBus?: number | string;
	/** Input source number */
	input?: number | string;
};
