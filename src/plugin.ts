import streamDeck from "@elgato/streamdeck";

import { AtemCut } from "./actions/atem-cut";
import { AtemAutoTransition } from "./actions/atem-auto-transition";
import { AtemSetProgramInput } from "./actions/atem-set-program-input";
import { AtemSetPreviewInput } from "./actions/atem-set-preview-input";

// Enable "trace" logging so that all messages between the Stream Deck and the plugin are recorded.
streamDeck.logger.setLevel("trace");

// Register the ATEM actions.
streamDeck.actions.registerAction(new AtemCut());
streamDeck.actions.registerAction(new AtemAutoTransition());
streamDeck.actions.registerAction(new AtemSetProgramInput());
streamDeck.actions.registerAction(new AtemSetPreviewInput());

// Finally, connect to the Stream Deck.
streamDeck.connect();
