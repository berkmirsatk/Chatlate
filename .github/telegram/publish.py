#!/usr/bin/env python3
"""Build and send one rich Telegram message with local file attachments."""

import json
import mimetypes
import re
import secrets
import urllib.error
import urllib.request

def installer_version(installer):
    if not installer.is_file() or installer.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('Installation file missing or too large')
    version = re.fullmatch(r'Chatlate-(\d+\.\d+\.\d+)\.inu\.js', installer.name)
    if not version:
        raise ValueError('The installation filename must include its version and end with .inu.js')
    header = b'// ==InuPlugin==\n'
    with installer.open('rb') as source:
        if source.read(len(header)) != header:
            raise ValueError('The installation file has no Inugram manifest header')
    return version[1]


def release_version(version):
    pattern = r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)'
    if not isinstance(version, str) or not re.fullmatch(pattern, version):
        raise ValueError('Invalid stable release version')
    return version


def rich_content(post, banner, notes, version):
    release_version(version)
    markdown = post.read_text(encoding='utf-8')
    if '{{NOTES}}' not in markdown or '{{VERSION}}' not in markdown:
        raise ValueError('Post template placeholders are missing')
    markdown = markdown.replace('{{VERSION}}', version)
    markdown = markdown.replace('{{NOTES}}', notes.read_text(encoding='utf-8').strip())
    if 'tg://photo?id=banner' not in markdown:
        raise ValueError('Missing banner reference')
    if 'tg://document' in markdown:
        raise ValueError('Installers must be sent as normal document messages')
    if not banner.is_file() or banner.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('Banner missing or too large')
    return {
        'markdown': markdown,
        'media': [
            {'id': 'banner', 'media': {'type': 'photo', 'media': 'attach://banner_file'}},
        ],
    }, {'banner_file': banner}


def prepare(chat, post, banner, installer, notes):
    # Validate the separate installer before sending any part of the preview.
    version = installer_version(installer)
    content, files = rich_content(post, banner, notes, version)
    return {
        'chat_id': chat,
        'rich_message': content,
        'disable_notification': True,
    }, files


def prepare_edit(chat, message_id, post, banner, notes, version):
    if type(message_id) is not int or message_id <= 0:
        raise ValueError('A positive existing message ID is required')
    content, files = rich_content(post, banner, notes, version)
    return {
        'chat_id': chat,
        'message_id': message_id,
        'rich_message': content,
    }, files


def prepare_installer(chat, installer, reply_to):
    version = installer_version(installer)
    if not isinstance(reply_to, int) or reply_to <= 0:
        raise ValueError('The installer must reply to the preview message')
    return {
        'chat_id': chat,
        'document': 'attach://installer_file',
        'caption': 'Chatlate ' + version + ' · Inugram plugin',
        'disable_content_type_detection': True,
        'disable_notification': True,
        'reply_parameters': {'message_id': reply_to},
    }, {'installer_file': installer}


def multipart(payload, files):
    boundary = 'plumgins_' + secrets.token_hex(16)
    parts = []
    for name, value in payload.items():
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
                      f'\r\n\r\n{text}\r\n').encode('utf-8'))
    for name, path in files.items():
        if any(char in path.name for char in ('"', '\r', '\n')):
            raise ValueError('Invalid attachment filename')
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                      f'filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n').encode('utf-8'))
        parts.extend([path.read_bytes(), b'\r\n'])
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), 'multipart/form-data; boundary=' + boundary


def send(payload, files, token, method='sendRichMessage'):
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}', token):
        raise ValueError('Invalid bot token format')
    if method not in ('sendRichMessage', 'sendDocument', 'editMessageText'):
        raise ValueError('Unsupported Telegram send method')
    body, content_type = multipart(payload, files)
    request = urllib.request.Request(
        'https://api.telegram.org/bot' + token + '/' + method,
        data=body, headers={'Content-Type': content_type}, method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        if method == 'editMessageText' and error.code == 400:
            try:
                details = json.loads(error.read(4096))
                description = details.get('description') if isinstance(details, dict) else None
            except (ValueError, OSError):
                description = ''
            if (
                isinstance(description, str)
                and description.startswith('Bad Request: message is not modified')
            ):
                return None
        raise ValueError(f'Telegram rejected the request (HTTP {error.code})') from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('Telegram connection failed; check the chat before retrying') from None
    if not result.get('ok'):
        raise ValueError('Telegram did not confirm the post')
    message = result['result']
    if method == 'editMessageText' and (
        not isinstance(message, dict)
        or type(message.get('message_id')) is not int
        or message.get('message_id') != payload['message_id']
        or message.get('chat', {}).get('id') != payload['chat_id']
    ):
        raise ValueError('Telegram did not confirm the expected edited message')
    return message['message_id']
