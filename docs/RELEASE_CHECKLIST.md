# Release checklist

Run these checks on the final installation file. HTTP/JVM fixtures cannot verify Android rendering, live endpoints or the native installer. Record Android and Inugram build versions when claiming compatibility.

## Device checks

- [ ] Fresh install: name, author, third Plumgins sticker, static banner, permissions and automatic Google selection.
- [ ] Google and Yandex translations: nested bold/italic, spoilers, quotes, link labels, code, usernames, custom emoji and line breaks.
- [ ] Whole-chat translation without Premium, new incoming messages and excluded-language rules.
- [ ] Enable both services, drag priorities and toggle individual services. Label taps do not reorder; the last service stays enabled.
- [ ] Connection tests report enabled services in order with separate status and timing. Closing settings cancels the test.
- [ ] A naturally unavailable primary uses its enabled backup without permanently promoting it. Do not flood a provider to trigger a failure.
- [ ] Disable Chatlate while selected: Telegram becomes active. Re-enable/restart: saved language, provider order and preferences return. External provider selections remain untouched.
- [ ] English/Turkish interface, automatic app language, manual override, disabled-plugin description and language flags.
- [ ] Expand/collapse community links, verify current titles/photos and responsive blue previews in both screen orientations.
- [ ] GitHub opens this repository. Version history shows the installed notes with readable Markdown and no footer links.
- [ ] Support heart cycles smoothly; Buy Me a Coffee opens the correct profile. USDT shows TON and copies the exact configured address only on tap. No payment is required for this check.
- [ ] Close/reopen settings during native work; check recycled views, listeners and rapid toggles. Review first-open banner corners separately.

## Real update path

- [ ] While the repository is private or has no public Release, no update banner appears and translations still work.
- [ ] After publication, test with a genuine older installation and a newer stable Release: two bright pulses, release-specific GitHub link and Markdown notes.
- [ ] Returning without installing resets the strip's brightness. Closing during download cancels without a false success notification.
- [ ] The downloaded package opens Inugram's native confirmation flow, including permission changes. Cancelling leaves the current installation working.
- [ ] Confirming reloads the new version, preserves preferences and produces completion feedback once. Reopen version history after updating.

## Publish

- [ ] Keep `PLUGIN_VERSION`, package and lockfile versions equal; retain the plugin, provider and preference identities.
- [ ] Update bundled English/Turkish notes, release history and user-facing English Release notes.
- [ ] Run `npm ci` and `npm run package` on the finished source. Review the staged file list; exclude credentials, dependencies, generated installers and demo files.
- [ ] Create tag `vVERSION` from the reviewed commit and attach `dist/Chatlate-VERSION.inu.js` and `dist/Chatlate-VERSION.sha256` to its Release. The exact installer name is required by the updater.
- [ ] Check the uploaded asset's SHA-256 and GitHub digest. Source archives include the GNU GPLv3 license and lockfile; source ZIPs are not installers.
- [ ] Keep the repository private until the agreed public launch. Anonymous update checks become available only after public publication.

Use 1.0.1 for fixes, 1.1.0 for compatible features/providers and 2.0.0 for incompatible changes. The first public version is 1.0.0. Do not uninstall a development installation merely to change its version; updating preserves settings.
