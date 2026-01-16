import streamDeck from "@elgato/streamdeck";

import { AtemCut } from "./actions/atem-cut";
import { AtemAutoTransition } from "./actions/atem-auto-transition";
import { AtemSetProgramInput } from "./actions/atem-set-program-input";
import { AtemSetPreviewInput } from "./actions/atem-set-preview-input";
import { AtemFadeToBlack } from "./actions/atem-fade-to-black";
import { AtemMacroRun } from "./actions/atem-macro-run";
import { AtemTransitionStyle } from "./actions/atem-transition-style";
import { AtemTransitionRate } from "./actions/atem-transition-rate";
import { AtemDskControl } from "./actions/atem-dsk-control";
import { AtemAuxOutput } from "./actions/atem-aux-output";
import { AtemMediaPlayer } from "./actions/atem-media-player";
import { AtemRecordingStreaming } from "./actions/atem-recording-streaming";

// Enable "trace" logging so that all messages between the Stream Deck and the plugin are recorded.
streamDeck.logger.setLevel("trace");

// Register the ATEM actions.
streamDeck.actions.registerAction(new AtemCut());
streamDeck.actions.registerAction(new AtemAutoTransition());
streamDeck.actions.registerAction(new AtemSetProgramInput());
streamDeck.actions.registerAction(new AtemSetPreviewInput());
streamDeck.actions.registerAction(new AtemFadeToBlack());
streamDeck.actions.registerAction(new AtemMacroRun());
streamDeck.actions.registerAction(new AtemTransitionStyle());
streamDeck.actions.registerAction(new AtemTransitionRate());
streamDeck.actions.registerAction(new AtemDskControl());
streamDeck.actions.registerAction(new AtemAuxOutput());
streamDeck.actions.registerAction(new AtemMediaPlayer());
streamDeck.actions.registerAction(new AtemRecordingStreaming());

// Finally, connect to the Stream Deck.
streamDeck.connect();
