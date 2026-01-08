import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { atemConnectionManager } from "../atem-connection-manager-singleton";
import streamDeck from "@elgato/streamdeck";

/**
 * ATEM Cut Action
 * Executes a Cut (immediate transition) between Program and Preview on the specified Mix Effect.
 */
@action({ UUID: "dev.flowingspdg.atemnodejs.cut" })
export class AtemCut extends SingletonAction<AtemCutSettings> {
	/**
	 * Called when the action appears in Stream Deck.
	 */
	override async onWillAppear(ev: WillAppearEvent<AtemCutSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Set default values
		if (!settings.atemIp) {
			settings.atemIp = "192.168.10.240";
		}
		if (settings.mixEffect === undefined) {
			settings.mixEffect = 0;
		}

		await ev.action.setSettings(settings);

		// Update connection status display
		await this.updateConnectionStatus(ev.action.id, settings);
	}

	/**
	 * Called when the key is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<AtemCutSettings>): Promise<void> {
		const { settings } = ev.payload;

		// Check required parameters
		if (!settings.atemIp) {
			await ev.action.showAlert();
			streamDeck.logger.error("ATEM IP address is not set");
			return;
		}

		// Convert Mix Effect number to integer (sdpi-select returns string)
		const mixEffect = typeof settings.mixEffect === "string" 
			? parseInt(settings.mixEffect, 10) 
			: (settings.mixEffect ?? 0);

		try {
			// Get connection (with connection pooling)
			streamDeck.logger.info(`Connecting to ATEM at ${settings.atemIp}...`);
			const atem = await atemConnectionManager.getConnection(settings.atemIp);

			// Execute Cut command
			streamDeck.logger.info(`Executing Cut on ME ${mixEffect}...`);
			await atem.cut(mixEffect);

			// Show success
			await ev.action.showOk();
			streamDeck.logger.info(`Cut executed successfully on ME ${mixEffect}`);
		} catch (error) {
			// Show error
			await ev.action.showAlert();
			streamDeck.logger.error(`Failed to execute Cut: ${error}`);

			// Display error message on title (optional)
			if (settings.showErrorOnTitle) {
				await ev.action.setTitle("Error");
				setTimeout(async () => {
					await ev.action.setTitle("");
				}, 2000);
			}
		}
	}

	/**
	 * Updates the connection status display.
	 */
	private async updateConnectionStatus(actionId: string, settings: AtemCutSettings): Promise<void> {
		if (!settings.atemIp) {
			return;
		}

		// Check connection status
		const isConnected = atemConnectionManager.isConnected(settings.atemIp);

		// Display status on title (optional)
		if (settings.showConnectionStatus) {
			const action = streamDeck.actions.getActionById(actionId);
			if (action) {
				const status = isConnected ? "●" : "○";
				await action.setTitle(status);
			}
		}
	}
}

/**
 * Settings for the ATEM Cut action.
 */
type AtemCutSettings = {
	/** ATEM IP address */
	atemIp?: string;
	/** Mix Effect number (0-based) - returned as string or number from sdpi-select */
	mixEffect?: number | string;
	/** Whether to show connection status on title */
	showConnectionStatus?: boolean;
	/** Whether to show error message on title */
	showErrorOnTitle?: boolean;
};
