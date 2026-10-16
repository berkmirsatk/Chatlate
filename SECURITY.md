# Security and data flow

This document describes Chatlate 1.0.0's intended scope. Automated tests use simulated HTTP and native interfaces; they cannot establish Android compatibility or guarantee the absence of vulnerabilities. Complete the [device checklist](docs/RELEASE_CHECKLIST.md) before publication.

## Translation and settings

Inugram supplies the text selected for translation. Unprotected fragments and the target language go over HTTPS to Google or Yandex. Enabled backups may receive the same fragments when earlier services fail. Google's query URL includes submitted text. Providers may retain requests under their own policies; plugin requests do not use Inugram's proxy.

There is no telemetry or persistent message archive. Translation caches are bounded and memory-only. Local preferences store language, provider order, migration state, cooldowns and a pending update version. Chatlate does not read clipboard contents or request arbitrary filesystem access.

- Translation requests use fixed hosts, encoded parameters and disabled redirects. Response text is not executed or interpreted as message formatting.
- Source entities and UTF-16 boundaries are validated. Protected spans and rebuilt offsets come from the source, not the provider response.
- Input, output, queues and caches are bounded. Body-size validation occurs after reading a response, not as a streaming limit.
- Each provider serializes requests and isolates shared-subscriber cancellation. HTTP 429 cooldowns persist and are capped at 15 minutes.
- Fallback visits eligible services once within a shared budget. Cancellation, malformed responses and permanent HTTP errors stop the chain.
- Stored priorities accept registered IDs only. Native provider changes are read back before saving; unload resets Chatlate's active selection to Telegram and leaves external providers alone.

## Native UI and community links

Native permissions support provider synchronization, localized descriptions and settings views. UI hooks are scoped to Chatlate's views or plugin ID and disposed on close/unload. Cleanup invalidates queued work, detaches listeners and restores recycled cells.

The broad `account.read(peers)` host grant is used only to resolve the configured public community channel/group's name and avatar while their section is expanded. These lookups use the active Inugram account and are not sent to a developer server. The banner and icon drawings are bundled locally.

Support links open only after a tap. The fixed USDT TON address is copied only by an explicit button action; the full address is not displayed. Clipboard access is write-only. Chatlate cannot send funds or access a wallet.

## Release updates

Opening settings checks `api.github.com` for this repository's latest published stable Release. The request contains no translation text, account credentials or token. Private/unpublished repositories return no available update. GitHub receives ordinary connection metadata such as the requesting IP address. Opening version history or release notes separately fetches the current `CHANGELOG.md` from `main` through the same API host, without authentication or translation data. Notes are displayed as formatted text, not executed. Requests have a 10-second timeout and a 128,000-character response limit after reading; closing the page cancels them. Failed or private-repository requests show an error and retry action rather than offline notes.

Downloads begin only after an Update tap. The adapter rechecks the selected version tag, requires exactly one correctly named installation asset and GitHub's SHA-256 digest, and accepts download responses only from `api.github.com` or `release-assets.githubusercontent.com`. Metadata and package sizes are bounded after reading; packages are limited to 512 KiB.

Before native import, Chatlate verifies the digest and asks Inugram's manifest parser to confirm the plugin ID and selected version. It then opens Inugram's normal import flow, which owns compatibility checks, permission consent and reload. It does not invoke the plugin manager's update method directly. Completion is confirmed by the successor instance's actual version, not by download completion.

The digest checks integrity against GitHub metadata; it is not an independent publisher signature. Control of the repository or release account is a trust boundary. An accepted update runs with the permissions approved in Inugram. No access token is bundled in the installation file.

## Grants and limits

Fetch grants cover the two translation hosts plus the two GitHub hosts above. Other grants are `openUrl`, `clipboard.write`, `account.read(peers)`, `unsafe.jvm` and `unsafe.xposed`. Native and peer grants are broad host permissions: the source scopes its use, but those limits would not constrain a modified plugin.

Unofficial translation endpoints and native host internals may change. Tests do not replace real-device checks of installation, cancellation, saved settings, native rendering and provider availability.
