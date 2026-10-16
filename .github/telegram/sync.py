"""Update registered Plumgins announcements from GitHub notes; never create messages."""

import argparse
import json
import os
from pathlib import Path

from publish import prepare_edit, release_version, send
from telegram_api import api, BOT_USERNAME

ROOT = Path(__file__).resolve().parent
CHANNEL = '@Plumgins'


def registered_posts(path):
    posts = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(posts, dict):
        raise ValueError('Channel posts must map release versions to existing message IDs')
    seen = set()
    for version, message_id in posts.items():
        release_version(version)
        if type(message_id) is not int or message_id <= 0 or message_id in seen:
            raise ValueError('Each release needs its own positive channel message ID')
        seen.add(message_id)
    return posts


def run(token, posts_file, notes_dir):
    posts = registered_posts(posts_file)
    if not posts:
        print('No channel announcements registered; no Telegram requests made.')
        return

    # Validate all local inputs before making the first edit.
    edits = []
    for version, message_id in posts.items():
        payload, files = prepare_edit(
            CHANNEL, message_id, ROOT / 'post.rich.md', ROOT / 'banner.png',
            notes_dir / ('v' + version + '.md'), version,
        )
        edits.append((version, payload, files))
    bot = api(token, 'getMe')
    if (
        bot.get('is_bot') is not True
        or bot.get('username', '').lower() != BOT_USERNAME.lower()
        or type(bot.get('id')) is not int or bot['id'] <= 0
    ):
        raise ValueError('The stored token does not identify @PlumginsBot')
    chat = api(token, 'getChat', {'chat_id': CHANNEL})
    if (
        chat.get('type') != 'channel'
        or chat.get('username', '').lower() != CHANNEL[1:].lower()
        or type(chat.get('id')) is not int or chat['id'] >= 0
    ):
        raise ValueError('The destination is not the expected Plumgins channel')
    member = api(token, 'getChatMember', {'chat_id': chat['id'], 'user_id': bot['id']})
    if (
        member.get('status') != 'administrator'
        or member.get('can_edit_messages') is not True
        or member.get('user', {}).get('id') != bot['id']
    ):
        raise ValueError('PlumginsBot needs channel administrator permission to edit messages')

    for version, payload, files in edits:
        payload['chat_id'] = chat['id']
        edited = send(payload, files, token, method='editMessageText')
        status = 'notes synchronized.' if edited is not None else 'already current.'
        print('Release ' + version + ': ' + status)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--posts', type=Path, default=ROOT / 'channel-posts.json')
    parser.add_argument('--notes-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        run(os.environ.get('TELEGRAM_BOT_TOKEN', ''), args.posts, args.notes_dir)
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
