<p align="center">
  <img src="assets/chatlate-settings-poster.webp" alt="Chatlate" width="640">
</p>

<h1 align="center">Chatlate</h1>

<p align="center">
  Chat translation for Inugram that keeps messages looking the way they were written.
</p>

<p align="center">
  <a href="https://github.com/berkmirsatk/Chatlate/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/berkmirsatk/Chatlate?label=release"></a>
  <img alt="Inugram v13.0.3-49 or later" src="https://img.shields.io/badge/Inugram-v13.0.3--49%2B-8a6cff">
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue"></a>
</p>

## Features

- **Translate anything** – single messages or whole chats, no Telegram Premium needed.
- **Formatting stays** – bold, italics, links, quotes and spoilers keep their place; code, usernames and custom emoji are never changed.
- **Mixed-language chats** – each message is translated from its own language.
- **Google, Yandex and Microsoft** – use any of them, drag them into your preferred order, and let the next one take over within seconds if a service is unavailable. A short note in the chat tells you when it does.
- **Switch in the chat** – pick another service from the translate bar's menu.
- **Descriptions in place** – group, channel and profile descriptions are translated right where they are.
- **Original below** – with Inugram's Show original text setting on, whole-chat translations keep the original under them too.
- **Connection test** – see each service's status and response time.
- **Built-in updates** – new versions and the version history appear in Chatlate's settings, with release notes you can translate.
- **English and Turkish** – the interface follows Inugram's language.

## Installation

1. Download `Chatlate-<version>.inu.js` from the [latest release](https://github.com/berkmirsatk/Chatlate/releases/latest) or the [Plumgins](https://t.me/Plumgins) channel.
2. In Inugram, open **Settings → Plugins** and import the file.
3. Review the permissions and enable Chatlate.
4. Turn on chat translation in Inugram. Google is selected automatically; open Chatlate's settings to change the order.

Requires Inugram v13.0.3-49 or later. To update, install the new version over the old one; your settings are kept.

Google, Yandex and Microsoft are used through their free public endpoints, so availability and limits are up to those services.

## Privacy

Only the text you translate is sent, and only to the translation service you chose (or the next one in your order if it fails). Chatlate has no telemetry and keeps no message log; settings stay on your device. See [SECURITY.md](SECURITY.md) for every permission and data flow.

## Community and support

- 📢 Channel: [@Plumgins](https://t.me/Plumgins)
- 💬 Chat: [@PlumginsChat](https://t.me/PlumginsChat)
- ☕ Support development: [Buy Me a Coffee](https://buymeacoffee.com/berkmirsatk), or USDT on TON from Chatlate's settings

## Development

```sh
npm ci
npm run package
```

The build produces one installable `.inu.js` file. [DEVELOPING.md](DEVELOPING.md) covers the code layout, adding providers or languages, and the release process; notes for each version are in [CHANGELOG.md](CHANGELOG.md).

## License

[GNU GPLv3](LICENSE) (`GPL-3.0-only`). Third-party marks are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

© 2026 [berkmirsatk](https://t.me/berkmirsatk) · Chatlate = **Chat** + trans**late**
