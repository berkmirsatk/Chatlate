"""Small Telegram JSON client shared by private previews and channel synchronization."""

import json
import re
import urllib.error
import urllib.request

BOT_USERNAME = 'PlumginsBot'


def api(token, method, payload=None):
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}', token):
        raise ValueError('TELEGRAM_BOT_TOKEN is missing or invalid')
    request = urllib.request.Request(
        'https://api.telegram.org/bot' + token + '/' + method,
        data=json.dumps(payload or {}).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError(f'Telegram {method} failed (HTTP {error.code})') from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('Telegram connection failed') from None
    if not result.get('ok'):
        raise ValueError('Telegram did not confirm ' + method)
    return result['result']

