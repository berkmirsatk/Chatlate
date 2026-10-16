# Development

## Build and check

Use Node.js 22 or later.

```sh
npm ci
npm run verify
npm run package
```

`verify` checks formatting, types and the manifest, builds the classic-script IIFE and runs tests. `package` also validates release versions and native routine fingerprints, then writes the versioned installation file, checksum and generated Release notes. Source archives are available from the repository; they are not installation files.

Run `npm run format` after editing code. The installer preserves indentation and line breaks; whitespace, identifiers and syntax are not minified. Keep both source modules and the distributed script readable.

## Code map

| Modules | Responsibility |
| --- | --- |
| `providers/`, `http.js`, `cache.js`, `limits.js` | HTTP adapters, bounded queues, rate limits and caching |
| `formatting.js`, `translation.js` | Telegram entities, protected spans and rebuilt offsets |
| `fallback.js`, `provider-selection.js`, `provider-editor.js` | Provider order, native selection and editing |
| `settings.js`, native view modules | Settings composition, language controls, dragging and status |
| `updates/` | Release checks, package verification, native import, notes and completion |
| `distribution.js`, `identity.js` | Repository configuration and stable plugin identities |
| `i18n.js`, `language-catalog.js`, `storage.js` | Language selection, preferences and migration |
| `tests/helpers/` | Shared plugin sandbox and native UI fixtures |

Translation text is user data: never log it or send it to the distribution service. Keep the plugin ID, `multi.*` provider IDs and `multi-translate.*` preference keys stable. Some internal names predate Chatlate and are migration contracts.

## Add a provider

Implement `Provider` from `src/provider.js`, register it in `src/index.js`, add its stable ID to `identity.js` and declare only its required fetch host. Reuse `createQueuedProvider` for caching, spacing, cancellation and cooldowns. Preserve the complete fragment contract: reject missing or changed separators instead of applying partial translations. Add request, cancellation, quota and formatting regression coverage.

## Add a language

Add its base code, display name and flag ID to `language-catalog.js`, a full translation object to `i18n.js`, and update UI messages in `updates/messages.js`. Keep English first and preserve placeholders such as `{name}` and `{version}`. Optional localized manifest descriptions live in `identity.js`.

`flags.js` contains local drawings; `language-flags.js` applies the shared rounded shape and produces image labels. Reuse a flag ID when appropriate. Verify selection, fallback to English, automatic app-language detection and layout on Android.

## Artwork and support

The static 2:1 banner is `assets/chatlate-settings-poster.webp`. Run `npm run embed:banner` after changing it. Current branding exports stay in `assets/`; keep design experiments out of the repository.

Community destinations are defined in `community-links.js`. Channel/group photos are resolved only while expanded and refreshed from the active account's public peer cache. The GitHub menu uses `distribution.js` when configured and otherwise opens the author profile. `community-icons.js` contains fixed local marks.

`donation-config.js` holds the fixed support URL and USDT TON receiving address. Both actions require a tap; the address is not rendered as text. The Buy Me a Coffee SVG is bundled locally. No QR or wallet access is included.

## Release distribution

`REPOSITORY` in `distribution.js` points to `berkmirsatk/Chatlate`. No token is bundled. The build adds the two GitHub fetch hosts only when a repository is configured; private repositories produce no anonymous updates until publication.

Public GitHub Releases use tags `vMAJOR.MINOR.PATCH` and an asset named `Chatlate-VERSION.inu.js`. The release source reads stable published releases, requires GitHub's SHA-256 asset digest, rechecks the chosen tag on install and bounds metadata/package size. It never accepts a download URL from release text. Drafts, prereleases and private/unpublished repositories do not produce update banners.

The native installer verifies SHA-256 and the host-parsed plugin ID/version before calling `PluginImportHelper.startImport`. Inugram's normal installation sheet owns trust, permission changes, compatibility and reload. It must not be replaced by a direct `PluginManager.update` call that bypasses the sheet.

The controller cancels requests on close/unload. An installer handoff is not proof of completion: the next running instance confirms the pending target against its own version, then shows the completion effect when settings opens. Test actual native import, cancellation and page behavior on Android before announcing automatic updates.

`CHANGELOG.md` on `main` is the single source of English release notes. Add each stable version under `## MAJOR.MINOR.PATCH` and retain previous sections. `npm run notes` generates the current Release body; `-- --all` generates one body per version, and `-- --body` omits the Release title for the Telegram post. The CLI and plugin share the section parser in `updates/changelog.js`.

Version history, selected history entries and update pages fetch the current file on opening through GitHub's Contents API. Notes are neither bundled nor persisted. A failed request shows a localized retry action; closing a page aborts its request and disposes its renderer. The English content stays the same in either UI language. The SDK uses Telegram's Markdown subset, so GitHub headings outside code fences become bold lines. The changelog styles only its own transparent native cell, restoring colors, sizes and hooks on close/recycle.

Pushing a `CHANGELOG.md` change to `main` runs **Sync release notes**, updating the bodies of existing GitHub Releases without changing their assets or creating new Releases. The manual Telegram preview inserts the same version section into its Rich Markdown template. **Sync Telegram changelogs** separately edits registered `@Plumgins` announcements from that source; its registry remains empty until publication. It never creates channel posts, changes installer attachments or imports Telegram edits back into GitHub. See [the Telegram tooling instructions](.github/telegram/README.md). Anonymous note requests cannot read a private repository; do not add credentials to the plugin.

## Version and publish

Update `package.json`, `package-lock.json` and `PLUGIN_VERSION` in `identity.js` together. Use 1.0.1 for fixes, 1.1.0 for compatible features and 2.0.0 for breaking changes. The current first public release is 1.0.0.

Complete [the device checklist](docs/RELEASE_CHECKLIST.md), run `npm run package`, commit the finished source and create a release from that commit. Do not publish demo scenarios or fake versions. GitHub's source ZIP includes the lockfile and license; the installer belongs in Release assets rather than the source tree.

Alternatively, manually run **Actions → Prepare release** on the reviewed `main` commit. It installs dependencies, runs all package checks and uploads the installer/checksum to a draft Release using GitHub's own token. It refuses to overwrite a published Release and leaves publication to a separate explicit action. No personal access token is needed.

SDK reference: https://github.com/teidesu/inugram/tree/main/sdk/docs
