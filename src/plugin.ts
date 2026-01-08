import streamDeck from "@elgato/streamdeck";

import { AtemCut } from "./actions/atem-cut";

// Enable "trace" logging so that all messages between the Stream Deck and the plugin are recorded.
streamDeck.logger.setLevel("trace");

// Register the ATEM Cut action.
streamDeck.actions.registerAction(new AtemCut());

// Finally, connect to the Stream Deck.
streamDeck.connect();
