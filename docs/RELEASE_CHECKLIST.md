# Release checklist

Run these checks on the final installation file. HTTP/JVM fixtures cannot verify Android rendering, live endpoints or the native installer. Record Android and Inugram build versions when claiming compatibility.

## Device checks

- [ ] Fresh install: name, author, icon, banner, permissions and automatic Google selection.
- [ ] Google, Yandex and Microsoft translations: nested bold/italic, spoilers, quotes, link labels, code, usernames, custom emoji and line breaks.
- [ ] Draft translation: long-press Send to choose a language, search for a language in the bottom sheet, review and edit the translated draft, then send normally. Verify bold, links, custom emoji and reply context. Restore the unchanged translated draft; edits made during translation or before restoration must never be overwritten. Close the chat during translation and confirm no late write. Cancelling language selection makes no request.
- [ ] Whole-chat translation without Premium, new incoming messages and excluded-language rules.
- [ ] Enable all services, drag priorities and toggle individual services. Label taps do not reorder; the last service stays enabled.
- [ ] Connection tests report enabled services in order with separate status and timing. Closing settings cancels the test.
- [ ] A naturally unavailable primary uses its enabled backup without permanently promoting it. Do not flood a provider to trigger a failure. With airplane mode toggled mid-translation or a blocked host, the note appears above the translate bar (below pinned messages) for a few seconds, once.
- [ ] Long-press a group, channel and user description and tap Translate: it changes in place, links and usernames stay, and Translate again restores it. With Telegram's own service selected, the popup still opens.
- [ ] Turn on Inugram's **Show original text** and translate a whole chat: each message shows its translation, the separator and the original with its formatting and links. Single-message translations show the original once, not twice. Turning it off shows only translations.
- [ ] Without Premium, a chat in the translate-to language with a few foreign words shows no translate bar after a restart. In a foreign-language chat, the menu offers Don't translate for its language; it adds the language to Do Not Translate and hides the bar. A chat that is being translated always shows the bar, so Show original can turn it off. In a mostly Turkish group with a few English messages, the chat's ⋯ menu offers Translate only while its translation bar is unavailable or hidden; it translates only the foreign messages. After Show original the bar stays, also after a restart, until Hide. After Hide/Undo, the restored bar and menu entry must never appear together.
- [ ] Translate one message, then the whole chat, then choose Show original: the individually translated message returns to its original too. Closing a profile during translation cancels the work; reopening shows the original description.
- [ ] Article translation (open https://telegra.ph/api in Instant View): the menu shows Translation service with the active service; the page translates without untranslated parts, and choosing another service translates it again.
- [ ] Article translate bar: it appears under the header on a foreign article, follows the header while scrolling, translates and shows the original, its menu switches services and Hide removes it without leaving a gap; it does not appear on an article in the target language.
- [ ] Translate bar menu: **Translation service** sits under **Translate to**, marks the active service, opens and returns from its list; picking another one retranslates the chat with it.
- [ ] Version history and update notes: with a non-English app language, a translate icon sits in the top-right corner of the header. It translates the notes into that language and turns blue; tapping it again shows the original. The back button still works.
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
- [ ] Add the version section to `CHANGELOG.md`; keep previous sections. Review the generated stable notes in `dist/release-notes.md`. Development previews use separate notes in the bot repository; released-version private previews require already published assets.
- [ ] Merge the reviewed changes into `main`, then run **Actions → Prepare release**. It runs every check, builds the installer and uploads it with its checksum to a draft Release.
- [ ] Review the draft's notes and assets, then publish it as the latest release. Plumgins Bot announces it in `@Plumgins` automatically; check its **Sync Telegram changelogs** run and the channel post.
- [ ] Install from the channel post or the Release once, and confirm the in-app update banner on an older installation.

Increment the patch version for fixes, the minor version for compatible features/providers and the major version for incompatible changes. Do not uninstall a development installation merely to change its version; updating preserves settings.
