import copy
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import preview
import publish


def private_chat(user_id=123, chat_type='private', username='renamed_account'):
    return {'id': user_id, 'type': chat_type, 'username': username}


def valid_replies():
    return [{'is_bot': True, 'username': 'PlumginsBot'}, private_chat()]


class PreviewTests(unittest.TestCase):
    def test_recipient_is_a_pinned_positive_id_and_does_not_depend_on_a_username(self):
        self.assertEqual(preview.private_recipient('123'), 123)
        self.assertEqual(preview.private_recipient(' 123\n'), 123)
        self.assertEqual(preview.private_recipient(str(2 ** 52 - 1)), 2 ** 52 - 1)
        for value in ['', 'berkmirsatk', '@berkmirsatk', '-123', '0', '0123',
                      '123.0', '1e3', '+123', '123 abc', str(2 ** 52), None, True, 123]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'PLUMGINS_OWNER_ID'):
                preview.private_recipient(value)

    def test_missing_or_invalid_owner_id_stops_before_api_calls(self):
        for value in ['', 'berkmirsatk', '-123', str(2 ** 52)]:
            with self.subTest(value=value), patch('preview.api') as api, patch('preview.send') as send:
                with self.assertRaisesRegex(ValueError, 'PLUMGINS_OWNER_ID'):
                    preview.run('123:' + 'x' * 35, Path('unused'), Path('unused'), value)
                api.assert_not_called()
                send.assert_not_called()

    def test_valid_preview_uses_the_pinned_id_after_a_username_change(self):
        with tempfile.TemporaryDirectory() as temp:
            installer = Path(temp) / 'Chatlate-1.0.0.inu.js'
            installer.write_text('// ==InuPlugin==\n// fixture')
            notes = Path(temp) / 'notes.md'
            notes.write_text('### Translation\n\n- Current shared notes.')
            with patch('preview.api', side_effect=valid_replies()) as api, patch('preview.send', return_value=987) as send, patch('sys.stdout', new_callable=io.StringIO):
                preview.run('123:' + 'x' * 35, installer, notes, '123')
        self.assertEqual(send.call_count, 2)
        payload, files, _ = send.call_args_list[0].args
        self.assertEqual(payload['chat_id'], 123)
        self.assertTrue(payload['disable_notification'])
        self.assertIn('<details>', payload['rich_message']['markdown'])
        self.assertIn('### Translation\n\n- Current shared notes.', payload['rich_message']['markdown'])
        self.assertNotIn('{{NOTES}}', payload['rich_message']['markdown'])
        self.assertNotIn('installer_file', files)
        self.assertNotIn('tg://document', payload['rich_message']['markdown'])
        self.assertEqual([item['media']['type'] for item in payload['rich_message']['media']], ['photo'])
        document, attachments, _ = send.call_args_list[1].args
        self.assertEqual(send.call_args_list[1].kwargs, {'method': 'sendDocument'})
        self.assertEqual(document['chat_id'], payload['chat_id'])
        self.assertEqual(document['reply_parameters'], {'message_id': 987})
        self.assertTrue(document['disable_notification'])
        self.assertEqual(document['document'], 'attach://installer_file')
        self.assertNotIn('rich_message', document)
        self.assertEqual(attachments['installer_file'].name, 'Chatlate-1.0.0.inu.js')
        self.assertEqual(api.call_count, 2)
        self.assertEqual(api.call_args.args[1:], ('getChat', {'chat_id': 123}))

    def test_wrong_bot_or_mismatched_chat_never_sends(self):
        for replies in [
            [{'is_bot': True, 'username': 'OtherBot'}],
            [valid_replies()[0], private_chat(456, username='berkmirsatk')],
            [valid_replies()[0], private_chat(chat_type='supergroup')],
            [valid_replies()[0], private_chat(user_id='123')],
            [valid_replies()[0], private_chat(user_id=-123)],
            [valid_replies()[0], {}],
        ]:
            with patch('preview.api', side_effect=copy.deepcopy(replies)), patch('preview.send') as send:
                with self.assertRaises(ValueError):
                    preview.run('123:' + 'x' * 35, Path('unused'), Path('unused'), '123')
            send.assert_not_called()
        with patch('preview.api') as api:
            with self.assertRaises(ValueError):
                preview.run('', Path('unused'), Path('unused'), '123')
        api.assert_not_called()

    def test_multipart_keeps_the_installation_filename(self):
        with tempfile.TemporaryDirectory() as temp:
            installer = Path(temp) / 'Chatlate-1.0.0.inu.js'
            installer.write_text('// ==InuPlugin==\n// fixture')
            notes = Path(temp) / 'notes.md'
            notes.write_text('### Translation\n\n- Current shared notes.')
            payload, files = publish.prepare_installer(123, installer, 987)
            body, mime = publish.multipart(payload, files)
        self.assertIn('boundary=', mime)
        self.assertIn(b'filename="Chatlate-1.0.0.inu.js"', body)
        self.assertIn(b'// ==InuPlugin==\n', body)

    def test_invalid_installer_prevents_sending_either_message(self):
        with tempfile.TemporaryDirectory() as temp:
            installer = Path(temp) / 'Chatlate-1.0.0.inu.js'
            installer.write_text('not an Inugram plugin')
            with patch('preview.api', side_effect=valid_replies()), patch('preview.send') as send:
                with self.assertRaisesRegex(ValueError, 'manifest header'):
                    preview.run('123:' + 'x' * 35, installer, Path('unused'), '123')
            send.assert_not_called()

    def test_failed_announcement_is_not_followed_by_an_installer_or_a_retry(self):
        with tempfile.TemporaryDirectory() as temp:
            installer = Path(temp) / 'Chatlate-1.0.0.inu.js'
            installer.write_text('// ==InuPlugin==\n// fixture')
            notes = Path(temp) / 'notes.md'
            notes.write_text('### Translation')
            with patch('preview.api', side_effect=valid_replies()), patch('preview.send', side_effect=ValueError('send failed')) as send:
                with self.assertRaisesRegex(ValueError, 'send failed'):
                    preview.run('123:' + 'x' * 35, installer, notes, '123')
            self.assertEqual(send.call_count, 1)

    def test_embedded_installers_cannot_be_reintroduced_in_the_post(self):
        with tempfile.TemporaryDirectory() as temp:
            installer = Path(temp) / 'Chatlate-1.0.0.inu.js'
            installer.write_text('// ==InuPlugin==\n// fixture')
            notes = Path(temp) / 'notes.md'
            notes.write_text('### Translation')
            post = Path(temp) / 'post.md'
            post.write_text('{{VERSION}} {{NOTES}} tg://photo?id=banner tg://document?id=installer')
            with self.assertRaisesRegex(ValueError, 'normal document'):
                publish.prepare(123, post, preview.ROOT / 'banner.png', installer, notes)


if __name__ == '__main__':
    unittest.main()
