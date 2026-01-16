import { action, KeyDownEvent, SingletonAction, WillAppearEvent, SendToPluginEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Media Player Control Action
 * Controls media player playback (play/stop) and source selection.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.mediaplayer" })
export class AtemMediaPlayer extends SingletonAction<AtemMediaPlayerSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemMediaPlayerSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.playerIndex === undefined) {
			settings.playerIndex = 0;
		}
		if (settings.action === undefined) {
			settings.action = "play";
		}

		await ev.action.setSettings(settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemMediaPlayerSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert player index to integer
		const playerIndex = typeof settings.playerIndex === "string" 
			? parseInt(settings.playerIndex, 10) 
			: (settings.playerIndex ?? 0);

		const action = typeof settings.action === "string" 
			? settings.action 
			: "play";

		try {
			// Get connection
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			if (action === "play") {
				// Set media player to play
				streamDeck.logger.info(`Setting Media Player ${playerIndex} to play...`);
				await atem.setMediaPlayerSettings({ playing: true }, playerIndex);
				streamDeck.logger.info(`Media Player ${playerIndex} set to play successfully`);
			} else if (action === "stop") {
				// Set media player to stop
				streamDeck.logger.info(`Setting Media Player ${playerIndex} to stop...`);
				await atem.setMediaPlayerSettings({ playing: false }, playerIndex);
				streamDeck.logger.info(`Media Player ${playerIndex} set to stop successfully`);
			} else if (action === "setSource" && settings.sourceIndex !== undefined) {
				// Set media player source
				const sourceIndex = typeof settings.sourceIndex === "string" 
					? parseInt(settings.sourceIndex, 10) 
					: settings.sourceIndex;
				
				// Determine source type: 0-1999 = Clip, 2000+ = Still
				const isStill = sourceIndex >= 2000;
				const sourceProps = isStill 
					? { sourceType: 1, stillIndex: sourceIndex - 2000, clipIndex: 0 } // Still (MediaSourceType.Still = 1)
					: { sourceType: 2, clipIndex: sourceIndex, stillIndex: 0 }; // Clip (MediaSourceType.Clip = 2)
				
				streamDeck.logger.info(`Setting Media Player ${playerIndex} source to ${isStill ? 'Still' : 'Clip'} ${isStill ? sourceIndex - 2000 : sourceIndex}...`);
				await atem.setMediaPlayerSource(sourceProps, playerIndex);
				streamDeck.logger.info(`Media Player ${playerIndex} source set successfully`);
			}
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to control Media Player: ${error}`);
		}
	}

	/**
	 * Called when a message is sent from the Property Inspector.
	 * Handles data-source requests from SDPI-Components.
	 */
	override async onSendToPlugin(ev: SendToPluginEvent<any, AtemMediaPlayerSettings>): Promise<void> {
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
 * Settings for the ATEM Media Player action.
 */
type AtemMediaPlayerSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Media player index (0-based) */
	playerIndex?: number | string;
	/** Action: "play", "stop", or "setSource" */
	action?: string;
	/** Source index (required if action is "setSource") */
	sourceIndex?: number | string;
};
