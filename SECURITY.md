# Security and data flow

This document describes Chatlate's intended scope. Automated tests use simulated HTTP and native interfaces; they cannot establish Android compatibility or guarantee the absence of vulnerabilities. Complete the [device checklist](docs/RELEASE_CHECKLIST.md) before publication.

## Translation and settings

Inugram supplies the text selected for translation. Unprotected fragments and the target language go over HTTPS to Google, Yandex, Microsoft or DeepL. Enabled backups may receive the same fragments when earlier services fail. Text travels in request bodies, not URLs. Providers may retain requests under their own policies; plugin requests do not use Inugram's proxy.

There is no telemetry or persistent message archive. Translation caches are bounded and memory-only. Local preferences store language, provider order, cooldowns and a pending update version. Chatlate does not read clipboard contents or request arbitrary filesystem access.

- Translation requests use fixed hosts, encoded parameters and disabled redirects. Response text is not executed or interpreted as message formatting.
- Source entities and UTF-16 boundaries are validated. Protected spans and rebuilt offsets come from the source, not the provider response.
- Input, output, queues and caches are bounded. Body-size validation occurs after reading a response, not as a streaming limit.
- Each provider serializes requests and isolates shared-subscriber cancellation. HTTP 429 cooldowns persist and are capped at 15 minutes.
- Fallback visits eligible services once within a shared budget. A service gets 3.5 seconds, not counting its own request spacing, before the next one is tried; one that did not answer is tried last for a minute. A short note in the open chat (or a top notice elsewhere) names both services, at most once a minute per pair. Connection failures, rate limits (including Google's CAPTCHA redirect), temporary HTTP errors and malformed responses move to the next service; cancellation, invalid source formatting and permanent HTTP errors stop the chain.
- Google, Microsoft and DeepL detect the language of each text in a request. For Yandex, which detects one language per request, fragments are grouped by the app-detected language or, when unknown, by writing system.
- Stored priorities accept registered IDs only. Native provider changes are read back before saving; unload resets Chatlate's active selection to Telegram and leaves external providers alone.

## Native UI and community links

Native permissions support provider synchronization, localized descriptions, settings views, the chat translate bar's service picker and the backup note. UI hooks are scoped to Chatlate's views, its plugin ID or the translate bar's own menu (selected by a Java-side filter, so other popups never enter the plugin), and are disposed on close/unload. Choosing a service in a chat clears only that chat's loaded translations so they are made again. While a Chatlate service is selected, Translate on a profile description is answered in place instead of Telegram's popup; links, usernames and hashtags in it are kept out of the request, and the translation is forgotten when the profile closes. While a Chatlate service is selected, a routine hook on Telegram's language check honours the Do Not Translate list without Premium and treats text in the target language as not translatable, while a chat that is being translated, or whose translation the user turned on before, keeps its translate bar until Hide, and Undo on the Hide notice brings it back (Chatlate stores up to 200 such chat IDs locally), and the chat menu's Translate entry stays available whenever the chat is not being translated; the translate bar menu offers Don't translate for the chat's language, which adds it to that list and hides the bar there. With Inugram's Show original text setting on, a routine hook on its translation view appends the original to whole-chat translations for display only; stored messages are not changed. Cleanup invalidates queued work, detaches listeners and restores recycled cells.

The broad `account.read(peers)` host grant is used only to resolve the configured public community channel/group's name and avatar while their section is expanded. These lookups use the active Inugram account and are not sent to a developer server. The banner and icon drawings are bundled locally.

Support links open only after a tap. The fixed USDT TON address is copied only by an explicit button action; the full address is not displayed. Clipboard access is write-only. Chatlate cannot send funds or access a wallet.

Draft translation is initiated from the send-button long-press menu or chat menu and uses the same selected provider and enabled backups. It replaces composer text only when the original chat and draft (including formatting) still match. It never sends a message. The original draft is held in memory for restoration and released when the chat closes or the plugin unloads.

## Release updates

Opening settings checks `api.github.com` for this repository's latest published stable Release. The request contains no translation text, account credentials or token. Private/unpublished repositories return no available update. GitHub receives ordinary connection metadata such as the requesting IP address. Opening version history or release notes separately fetches the current `CHANGELOG.md` from `main` through the same API host, without authentication or translation data. Notes are displayed as formatted text, not executed. They are translated into the app's language only after a tap on the header's translate icon, through the selected service and its enabled backups, like a message. Requests have a 10-second timeout and a 128,000-character response limit after reading; closing the page cancels them. Failed or private-repository requests show an error and retry action rather than offline notes.

Downloads begin only after an Update tap. The adapter rechecks the selected version tag, requires exactly one correctly named installation asset and GitHub's SHA-256 digest, and accepts download responses only from `api.github.com` or `release-assets.githubusercontent.com`. Metadata and package sizes are bounded after reading; packages are limited to 512 KiB.

Before native import, Chatlate verifies the digest and asks Inugram's manifest parser to confirm the plugin ID and selected version. It then opens Inugram's normal import flow, which owns compatibility checks, permission consent and reload. It does not invoke the plugin manager's update method directly. Completion is confirmed by the successor instance's actual version, not by download completion.

The digest checks integrity against GitHub metadata; it is not an independent publisher signature. Control of the repository or release account is a trust boundary. An accepted update runs with the permissions approved in Inugram. No access token is bundled in the installation file.

DeepL uses `oneshot-free.www.deepl.com`, with no account or API key. Requests contain at most 1,500 UTF-16 units. Oversized fragments are preserved for an enabled backup; requests are never truncated.

## Grants and limits

Fetch grants cover the four translation hosts plus the two GitHub hosts above. Other grants are `openUrl`, `clipboard.write`, `account.read(peers)`, `unsafe.jvm` and `unsafe.xposed`. Native and peer grants are broad host permissions: the source scopes its use, but those limits would not constrain a modified plugin.

Unofficial translation endpoints and native host internals may change. Tests do not replace real-device checks of installation, cancellation, saved settings, native rendering and provider availability.
