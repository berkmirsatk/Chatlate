import copy
import io
import json
from contextlib import contextmanager
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import publish
import sync
import telegram_api

TOKEN = '123:' + 'x' * 35


def replies():
    return [
        {'id': 700, 'is_bot': True, 'username': 'PlumginsBot'},
        {'id': -100123, 'type': 'channel', 'username': 'Plumgins'},
        {'status': 'administrator', 'can_edit_messages': True, 'user': {'id': 700}},
    ]


@contextmanager
def fixture(posts=None):
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        registry = root / 'posts.json'
        registry.write_text(json.dumps({'1.0.0': 42} if posts is None else posts))
        (root / 'v1.0.0.md').write_text('### Translation\n\n- Current shared text.')
        yield registry, root


class SyncTests(unittest.TestCase):
    def test_unpublished_channel_makes_no_requests_and_needs_no_token(self):
        with fixture({}) as (registry, notes), patch('sync.api') as api, patch('sync.send') as send:
            with patch('sys.stdout', new_callable=io.StringIO):
                sync.run('', registry, notes)
            api.assert_not_called()
            send.assert_not_called()

    def test_registry_rejects_non_versions_invalid_ids_and_shared_message_ids(self):
        for posts in [[], {'../secret': 42}, {'1.0.0-beta': 42}, {'01.0.0': 42},
                      {'1.0.0': 0}, {'1.0.0': -42}, {'1.0.0': True}, {'1.0.0': '42'},
                      {'1.0.0': 42, '1.0.1': 42}]:
            with self.subTest(posts=posts), fixture(posts) as (registry, notes):
                with patch('sync.api') as api, patch('sync.send') as send:
                    with self.assertRaises(ValueError):
                        sync.run(TOKEN, registry, notes)
                    api.assert_not_called()
                    send.assert_not_called()

    def test_all_notes_are_checked_before_any_message_is_edited(self):
        with fixture({'1.0.0': 42, '1.0.1': 43}) as (registry, notes):
            with patch('sync.api') as api, patch('sync.send') as send:
                with self.assertRaises(FileNotFoundError):
                    sync.run(TOKEN, registry, notes)
                api.assert_not_called()
                send.assert_not_called()

    def test_current_notes_edit_only_the_registered_post_in_the_verified_channel(self):
        with fixture() as (registry, notes):
            with patch('sync.api', side_effect=replies()) as api, patch('sync.send', return_value=42) as send:
                with patch('sys.stdout', new_callable=io.StringIO) as output:
                    sync.run(TOKEN, registry, notes)
                    (notes / 'v1.0.0.md').write_text('### Translation\n\n- Corrected shared text.')
                    api.side_effect = replies()
                    sync.run(TOKEN, registry, notes)
        self.assertEqual(send.call_count, 2)
        first, second = (call.args[0] for call in send.call_args_list)
        self.assertIn('Current shared text.', first['rich_message']['markdown'])
        self.assertIn('Corrected shared text.', second['rich_message']['markdown'])
        self.assertNotIn('Current shared text.', second['rich_message']['markdown'])
        self.assertEqual(second['message_id'], 42)
        self.assertEqual(second['chat_id'], -100123)
        self.assertNotIn('document', second)
        self.assertEqual(send.call_args.kwargs, {'method': 'editMessageText'})
        self.assertEqual(set(send.call_args.args[1]), {'banner_file'})
        self.assertEqual(api.call_args.args[1:], ('getChatMember', {'chat_id': -100123, 'user_id': 700}))
        self.assertNotIn(TOKEN, output.getvalue())
        self.assertNotIn('-100123', output.getvalue())

    def test_wrong_bot_channel_or_admin_permissions_prevent_every_edit(self):
        variants = []
        for index, changes in [
            (0, {'username': 'OtherBot'}), (0, {'id': -700}),
            (1, {'type': 'private'}), (1, {'username': 'OtherChannel'}), (1, {'id': 123}),
            (2, {'status': 'member'}), (2, {'can_edit_messages': False}),
            (2, {'user': {'id': 701}}),
        ]:
            variant = replies()
            variant[index].update(changes)
            variants.append(variant[:index + 1])
        for responses in variants:
            with self.subTest(responses=responses), fixture() as (registry, notes):
                with patch('sync.api', side_effect=copy.deepcopy(responses)), patch('sync.send') as send:
                    with self.assertRaises(ValueError):
                        sync.run(TOKEN, registry, notes)
                    send.assert_not_called()

    def test_missing_or_uneditable_message_is_never_replaced_by_a_new_post(self):
        with fixture() as (registry, notes):
            with patch('sync.api', side_effect=replies()), patch('sync.send', side_effect=ValueError('HTTP 400')) as send:
                with self.assertRaises(ValueError):
                    sync.run(TOKEN, registry, notes)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs, {'method': 'editMessageText'})

    def test_unchanged_notes_are_successful_without_an_extra_send(self):
        with fixture() as (registry, notes):
            with patch('sync.api', side_effect=replies()), patch('sync.send', return_value=None) as send:
                with patch('sys.stdout', new_callable=io.StringIO) as output:
                    sync.run(TOKEN, registry, notes)
        self.assertEqual(send.call_count, 1)
        self.assertIn('already current', output.getvalue())

    def test_edit_request_uses_multipart_and_confirms_the_expected_message(self):
        with fixture() as (_, notes):
            payload, files = publish.prepare_edit(
                -100123, 42, sync.ROOT / 'post.rich.md', sync.ROOT / 'banner.png',
                notes / 'v1.0.0.md', '1.0.0',
            )
            response = io.BytesIO(json.dumps({'ok': True, 'result': {
                'message_id': 42, 'chat': {'id': -100123},
            }}).encode())
            with patch('publish.urllib.request.urlopen', return_value=response) as request:
                self.assertEqual(publish.send(payload, files, TOKEN, method='editMessageText'), 42)
            sent = request.call_args.args[0]
            self.assertTrue(sent.full_url.endswith('/editMessageText'))
            self.assertIn(b'name="message_id"', sent.data)
            self.assertIn(b'name="rich_message"', sent.data)
            self.assertIn(b'filename="banner.png"', sent.data)
            for result in [{'message_id': 43, 'chat': {'id': -100123}},
                           {'message_id': 42, 'chat': {'id': -100456}}, True]:
                response = io.BytesIO(json.dumps({'ok': True, 'result': result}).encode())
                with patch('publish.urllib.request.urlopen', return_value=response):
                    with self.assertRaisesRegex(ValueError, 'expected edited message'):
                        publish.send(payload, files, TOKEN, method='editMessageText')

    def test_only_message_not_modified_is_treated_as_a_successful_noop(self):
        for description, expected in [
            ('Bad Request: message is not modified: content is exactly the same', None),
            ('Bad Request: message to edit not found', ValueError),
            ('Bad Request: not enough rights to edit messages', ValueError),
        ]:
            error = urllib.error.HTTPError(
                'https://api.telegram.org/', 400, 'Bad Request', {},
                io.BytesIO(json.dumps({'ok': False, 'description': description}).encode()),
            )
            with self.subTest(description=description), patch('publish.urllib.request.urlopen', side_effect=error):
                if expected is None:
                    self.assertIsNone(publish.send({}, {}, TOKEN, method='editMessageText'))
                else:
                    with self.assertRaises(expected):
                        publish.send({}, {}, TOKEN, method='editMessageText')

    def test_shared_json_client_rejects_missing_token_without_network_access(self):
        with patch('telegram_api.urllib.request.urlopen') as request:
            with self.assertRaises(ValueError):
                telegram_api.api('', 'getMe')
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
