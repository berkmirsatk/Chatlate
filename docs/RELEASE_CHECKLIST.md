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
- [ ] GitHub opens this repository. Version history loads current notes with readable Markdown and no footer links in either UI language. Reopening reflects an edited `CHANGELOG.md`; connection failures show Retry.
- [ ] Support heart cycles smoothly; Buy Me a Coffee opens the correct profile. USDT shows TON and copies the exact configured address only on tap. No payment is required for this check.
- [ ] Close/reopen settings during native work; check recycled views, listeners and rapid toggles. Review first-open banner corners separately.

## Real update path

- [ ] Test with a genuine older installation and the newer stable Release: two bright pulses, release-specific GitHub link and Markdown notes.
- [ ] Returning without installing resets the strip's brightness. Closing during download cancels without a false success notification.
- [ ] The downloaded package opens Inugram's native confirmation flow, including permission changes. Cancelling leaves the current installation working.
- [ ] Confirming reloads the new version, preserves preferences and produces completion feedback once. Reopen version history after updating.

## Publish

- [ ] Keep `PLUGIN_VERSION`, package and lockfile versions equal; retain the plugin, provider and preference identities.
- [ ] Add the version section to `CHANGELOG.md`; keep previous sections. Send a **Telegram private preview** with **development** to read the notes as the channel will show them.
- [ ] Merge the reviewed changes into `main`, then run **Actions → Prepare release**. It runs every check, builds the installer and uploads it with its checksum to a draft Release.
- [ ] Review the draft's notes and assets, then publish it as the latest release. Plumgins Bot announces it in `@Plumgins` automatically; check its **Sync Telegram changelogs** run and the channel post.
- [ ] Install from the channel post or the Release once, and confirm the in-app update banner on an older installation.

Use 1.0.1 for fixes, 1.1.0 for compatible features/providers and 2.0.0 for incompatible changes. Do not uninstall a development installation merely to change its version; updating preserves settings.
