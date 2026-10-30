# Chatlate for exteraGram

`chatlate.plugin` is the exteraGram version of Chatlate: one Python file that exteraGram imports as a plugin.

It answers Telegram's own translation requests with Google, Yandex or Microsoft, keeping formatting, mentions, links and custom emoji where they were. Choose the primary service, enable backups and test the connection in the plugin's settings.

Whole-chat translation uses Chatlate wherever Telegram already offers it to the account.

## Development

The translation core is plain Python and is tested without the app:

```sh
npm run test:extera
```

Private previews are sent by Plumgins Bot with `plugin=chatlate-extera`, `development=true` and `version` equal to `__version__`.
