# Stream Deck ATEM Plugin

A Stream Deck plugin for controlling Blackmagic Design ATEM video switchers.

## What it does

Control your ATEM switcher from Stream Deck with Cut action support. The plugin automatically manages connections and supports multiple Mix Effects (ME 1-4).

## Installation

1. Clone and install dependencies:
```bash
git clone https://github.com/FlowingSPDG/streamdeck-atem-nodejs.git
cd streamdeck-atem-nodejs
npm install
```

2. Build and link:
```bash
npm run build
streamdeck link dev.flowingspdg.atemnodejs
```

## Usage

Add the Cut action to your Stream Deck and configure:
- ATEM IP address (e.g., 192.168.10.240)
- Mix Effect (ME 1-4)
- Connection status display (optional)

## Development

Build once:
```bash
npm run build
```

Watch mode (auto-rebuild on changes):
```bash
npm run watch
```

Debug at http://localhost:23654/ when in dev mode.

## License

MIT License
