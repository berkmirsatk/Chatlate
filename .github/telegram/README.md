# Telegram tools

Bot code lives in this directory and runs on GitHub Actions; no always-on bot server is deployed. `CHANGELOG.md` on `main` is the source for both previews and registered channel announcements.

## Private previews

Manually run **Actions → Telegram private preview** to send the current Chatlate post to its author. This workflow does not publish to a channel and does not run on pushes or Releases.

Set these repository Actions secrets:

- `PLUMGINS_BOT_TOKEN`: the token for `@PlumginsBot`. GitHub treats secret names case-insensitively, so `Plumgins_Bot_Token` works too.
- `PLUMGINS_OWNER_ID`: your positive numeric Telegram user ID, not a username, phone number or channel ID.

The workflow maps these secrets to `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_ID` for the sending step only. Open the bot from that account and send `/start` once so it can contact you. Every run validates the configured ID, verifies the bot and checks that `getChat` returns that exact private chat before sending anything. A missing/invalid ID or mismatched response stops the run; there is no username-based fallback or automatic account discovery. Changing your Telegram username does not change the recipient.

The preview does not poll incoming updates, read other users' messages or change webhook configuration. The real recipient ID is never written into source, artifacts or logs.

The job tests recipient guards, downloads the actual v1.0.0 installation file, verifies its checksum and sends the banner/changelog with `sendRichMessage`, then replies to it with the unchanged installer using `sendDocument`. The installer stays a normal document message because Inugram's RichDocumentCell opens embedded files through Android instead of its `.inu.js` import handler. The token is passed only to the sending step and is never printed. Private messages and recipient IDs are not logged. There are no automatic retries after a send. If the second request fails, the announcement may already exist; check the conversation before manually retrying an uncertain delivery.

`post.rich.md` is Telegram Rich Markdown, with a collapsed Changelog. The workflow generates the v1.0.0 section from the checked-out `CHANGELOG.md` and inserts it verbatim, so features are not duplicated in the template. To preview the published text, run on `main` after its notes are reviewed. `banner.png` is the settings banner converted to PNG without changing its pixels. The plugin runtime, version and Release are not changed by this workflow.

## Channel changelog synchronization

**Sync Telegram changelogs** runs after `CHANGELOG.md`, the post template or the post registry changes on `main`; it can also be run manually on `main`. It only edits existing announcements in `@Plumgins`. It never creates channel posts or replacement messages.

The registry `channel-posts.json` maps each stable release version to its existing channel announcement's message ID. It is intentionally empty until the first announcement is published. For example, a v1.0.0 announcement at `https://t.me/Plumgins/42` would be registered as:

```json
{
  "1.0.0": 42
}
```

Use the announcement's ID, not the separate installer reply's ID. These are public channel message IDs; the private owner ID stays in Secrets. The bot must be an administrator of `@Plumgins` with permission to edit messages. An empty registry makes no Telegram requests. Invalid versions, duplicate/invalid message IDs, missing notes, an unexpected bot/channel or missing edit permission stop synchronization.

The workflow generates English version sections using `npm run notes -- --all --body`, then renders each registered announcement with the same template and banner as the private preview. `editMessageText` updates the existing rich message. The separate installation document is not edited or resent. A deleted/uneditable post causes a failure instead of a new announcement; an unchanged message is a successful no-op. Telegram errors may leave earlier posts updated; retrying edits the same IDs.

Synchronization is one-way: Telegram edits do not update GitHub and may be overwritten by the next sync. Runs are serialized and check out the latest `main` at startup to avoid queued runs restoring older notes. The bot token is available only to the edit step. This tooling does not alter the plugin installer, its version or Release assets.

## Files

- `preview.py`: private previews pinned to the configured owner ID.
- `sync.py`, `channel-posts.json`: editing registered channel announcements.
- `publish.py`, `post.rich.md`, `banner.png`: shared message rendering and media.
- `telegram_api.py`: shared Telegram JSON requests.
- `../workflows/telegram-preview.yml`, `../workflows/telegram-sync.yml`: manual preview and automatic synchronization jobs.

References: https://core.telegram.org/bots/api#sendrichmessage, https://core.telegram.org/bots/api#editmessagetext and https://core.telegram.org/bots/api#rich-message-formatting-options.
