"""Send one Chatlate draft to its author's private chat, never to a channel."""

import argparse
import os
from pathlib import Path
import re

from publish import prepare, prepare_installer, send
from telegram_api import api, BOT_USERNAME

ROOT = Path(__file__).resolve().parent


def private_recipient(value):
    """Read the pinned account ID from configuration, never from incoming messages."""
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,15}', value.strip()):
        raise ValueError('PLUMGINS_OWNER_ID must contain your positive numeric Telegram user ID')
    recipient = int(value.strip())
    if recipient >= 2 ** 52:
        raise ValueError('PLUMGINS_OWNER_ID is outside the Telegram user ID range')
    return recipient


def run(token, installer, notes, owner_id):
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}', token):
        raise ValueError('TELEGRAM_BOT_TOKEN is missing or invalid')
    recipient = private_recipient(owner_id)
    bot = api(token, 'getMe')
    if not bot.get('is_bot') or bot.get('username', '').lower() != BOT_USERNAME.lower():
        raise ValueError('The stored token does not belong to @PlumginsBot')
    chat = api(token, 'getChat', {'chat_id': recipient})
    if chat.get('type') != 'private' or type(chat.get('id')) is not int or chat['id'] != recipient:
        raise ValueError('The configured recipient is not the expected private chat')
    payload, files = prepare(recipient, ROOT / 'post.rich.md', ROOT / 'banner.png', installer, notes)
    post_id = send(payload, files, token)
    print('Private announcement delivered; sending its separate installer.')
    payload, files = prepare_installer(recipient, installer, post_id)
    send(payload, files, token, method='sendDocument')
    print('Private Chatlate preview and installer delivered. No channel post was created.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--installer', required=True, type=Path)
    parser.add_argument('--notes', required=True, type=Path)
    args = parser.parse_args()
    try:
        run(
            os.environ.get('TELEGRAM_BOT_TOKEN', ''), args.installer, args.notes,
            os.environ.get('TELEGRAM_OWNER_ID', ''),
        )
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
