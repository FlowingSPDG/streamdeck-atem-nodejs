# Blackmagic Design ATEM Stream Deck Plugin (Node.js)

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/yourusername/streamdeck-atem-nodejs)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An unofficial Stream Deck plugin for controlling Blackmagic Design ATEM video switchers, built with Node.js and TypeScript.

## Features

- 🎬 **Cut Action**: Execute instant transitions (Cut) between Program and Preview
- 🔄 **Connection Pooling**: Efficiently reuse connections to the same ATEM IP address
- 🔁 **Automatic Retry**: Automatically retries connection up to 10 times with 5-second intervals
- 🔌 **Auto Reconnect**: Automatically reconnects when the connection is lost
- 📊 **Connection Status**: Optional visual indicator showing connection status
- 🎛️ **Multi-ME Support**: Control Mix Effects 1-4
- ⚡ **Modern UI**: Built with official Stream Deck UI components

## Requirements

- **Stream Deck Software**: Version 6.9 or later
- **Node.js**: Version 20 (bundled with Stream Deck)
- **OS**: Windows 10+ or macOS 12+
- **ATEM Switcher**: Any model supported by [atem-connection](https://github.com/Sofie-Automation/sofie-atem-connection)

## Installation

### From Source

1. Clone this repository:
```bash
git clone https://github.com/yourusername/streamdeck-atem-nodejs.git
cd streamdeck-atem-nodejs
```

2. Install dependencies:
```bash
npm install
```

3. Build the plugin:
```bash
npm run build
```

4. Install the plugin to Stream Deck:
```bash
streamdeck link dev.flowingspdg.atemnodejs
```

## Development

### Building

Build the plugin once:
```bash
npm run build
```

### Watch Mode (Hot Reload)

Enable automatic rebuild and reload on file changes:
```bash
npm run watch
```

This will:
- Watch for file changes
- Automatically rebuild the plugin
- Restart the plugin in Stream Deck

### Project Structure

```
streamdeck-atem-nodejs/
├── src/
│   ├── actions/
│   │   └── atem-cut.ts                 # Cut action implementation
│   ├── atem-connection-manager.ts      # Connection pooling & retry logic
│   ├── atem-connection-manager-singleton.ts
│   └── plugin.ts                       # Plugin entry point
├── dev.flowingspdg.atemnodejs.sdPlugin/
│   ├── bin/
│   │   ├── plugin.js                   # Compiled plugin
│   │   └── package.json                # ES Module configuration
│   ├── imgs/
│   │   ├── actions/cut/                # Action icons
│   │   └── plugin/                     # Plugin icons
│   ├── ui/
│   │   └── atem-cut.html               # Property Inspector UI
│   ├── logs/                           # Plugin logs
│   └── manifest.json                   # Plugin manifest
├── package.json
├── tsconfig.json
├── rollup.config.mjs
└── README.md
```

### Debugging

1. Enable developer mode (automatically enabled with `npm run watch`):
```bash
streamdeck dev
```

2. Open the remote debugger at http://localhost:23654/

3. View plugin logs in:
   - Windows: `%APPDATA%\Elgato\StreamDeck\logs\`
   - macOS: `~/Library/Logs/ElgatoStreamDeck/`

## Technology Stack

### Core Dependencies

- **[@elgato/streamdeck](https://www.npmjs.com/package/@elgato/streamdeck)** (v2.0.0): Official Stream Deck SDK
- **[atem-connection](https://github.com/Sofie-Automation/sofie-atem-connection)** (v3.0.0): ATEM control library

### Build Tools

- **[TypeScript](https://www.typescriptlang.org/)** (v5.2.2): Type-safe JavaScript
- **[Rollup](https://rollupjs.org/)** (v4.0.2): Module bundler
- **[@elgato/cli](https://www.npmjs.com/package/@elgato/cli)** (v1.6.0): Stream Deck development tools

## Documentation

### Official Documentation

- **Stream Deck SDK**: https://docs.elgato.com/streamdeck/sdk/
  - [Getting Started](https://docs.elgato.com/streamdeck/sdk/guides/getting-started)
  - [Property Inspectors](https://docs.elgato.com/streamdeck/sdk/guides/ui)
  - [Actions](https://docs.elgato.com/streamdeck/sdk/guides/actions)

- **Stream Deck UI Components**: https://sdpi-components.dev/
  - [Components Documentation](https://sdpi-components.dev/docs/components)

- **ATEM Connection Library**: https://github.com/Sofie-Automation/sofie-atem-connection
  - [API Documentation](https://sofie-automation.github.io/sofie-atem-connection/)
  - [Device Support](https://github.com/Sofie-Automation/sofie-atem-connection#device-support)

### Useful Resources

- [Stream Deck Plugin Samples](https://github.com/elgatosf/streamdeck-samples)
- [ATEM Connection Examples](https://github.com/Sofie-Automation/sofie-atem-connection/tree/main/examples)
- [Node.js Documentation](https://nodejs.org/docs/latest-v20.x/api/)

## Architecture

### Connection Management

The plugin implements a sophisticated connection management system:

1. **Connection Pooling**: Multiple actions targeting the same ATEM IP share a single connection
2. **Automatic Retry**: Failed connections are automatically retried (up to 10 attempts)
3. **Auto Reconnect**: Automatically reconnects when connection is lost
4. **Event-Driven**: Uses EventEmitter for connection state notifications

### Key Components

- **AtemConnectionManager**: Manages connection pooling and retry logic
- **AtemCut**: Action implementation for Cut transitions
- **Property Inspector**: Web-based UI for action configuration

## Configuration

### Action Settings

Configure each action instance with:

- **ATEM IP Address**: IP address of your ATEM switcher (e.g., `192.168.10.240`)
- **Mix Effect**: Select ME 1-4
- **Show Connection Status**: Display connection indicator (● connected / ○ disconnected)
- **Show Error on Title**: Display "Error" message on failures

## Troubleshooting

### Plugin Not Appearing

1. Check plugin installation:
```bash
streamdeck list
```

2. Verify manifest.json syntax
3. Check logs for errors

### Connection Issues

1. Verify ATEM IP address is correct
2. Ensure ATEM is powered on and connected to the network
3. Check firewall settings (ATEM uses UDP port 9910)
4. Review plugin logs for connection errors

### Build Issues

1. Clear build artifacts:
```bash
rm -rf dev.flowingspdg.atemnodejs.sdPlugin/bin/*
```

2. Reinstall dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

3. Rebuild:
```bash
npm run build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Sofie Automation](https://github.com/Sofie-Automation) for the excellent [atem-connection](https://github.com/Sofie-Automation/sofie-atem-connection) library
- [Elgato](https://www.elgato.com/) for the Stream Deck SDK and developer tools
- Blackmagic Design for creating amazing video production hardware

## Disclaimer

This is an **unofficial** plugin and is not affiliated with, endorsed by, or supported by Blackmagic Design or Elgato. All trademarks are property of their respective owners.

---

**Author**: Shugo Kawamura  
**Version**: 0.1.0  
**Last Updated**: January 2026
