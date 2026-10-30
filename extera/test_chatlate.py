"""Tests for the pure core of chatlate.plugin, run outside exteraGram."""

import importlib.machinery
import importlib.util
import json
import os
import unittest
from urllib.parse import parse_qs

import sys
import types

# exteraGram's modules exist only in the app; the core under test needs none of them.
for name, attributes in {
    "requests": {},
    "base_plugin": {"BasePlugin": object, "MethodHook": object},
    "client_utils": {"run_on_queue": None},
    "hook_utils": {"find_class": None},
    "java": {"jclass": None},
    "ui": {},
    "ui.settings": dict.fromkeys(["Divider", "Header", "Selector", "Switch", "Text"]),
}.items():
    module = types.ModuleType(name)
    module.__dict__.update(attributes)
    sys.modules.setdefault(name, module)

PATH = os.path.join(os.path.dirname(__file__), "chatlate.plugin")
loader = importlib.machinery.SourceFileLoader("chatlate_plugin", PATH)
spec = importlib.util.spec_from_loader("chatlate_plugin", loader)
chatlate = importlib.util.module_from_spec(spec)
loader.exec_module(chatlate)


def form(body, key):
    return parse_qs(body, keep_blank_values=True)[key]


class Formatting(unittest.TestCase):
    def test_offsets_count_utf16_units_around_emoji(self):
        text = "😀 Hello world"
        # Bold "Hello": two units for the emoji, one for the space.
        planned = chatlate.plan(text, [("TLRPC$TL_messageEntityBold", 3, 5)])
        parts = [p["body"] for p in planned["pieces"] if p["translate"]]
        self.assertEqual(parts, ["Hello", "world"])
        result, entities = chatlate.assemble(planned, ["Merhaba", "dünya"])
        self.assertEqual(result, "😀 Merhaba dünya")
        self.assertEqual(entities, [(3, 7)])

    def test_protected_entities_and_line_breaks_stay_as_written(self):
        text = "See @chatlate\ncode()"
        entities = [("TL_messageEntityMention", 4, 9), ("TL_messageEntityCode", 14, 6)]
        planned = chatlate.plan(text, entities)
        parts = [p["body"] for p in planned["pieces"] if p["translate"]]
        self.assertEqual(parts, ["See"])
        result, ranges = chatlate.assemble(planned, ["Bak"])
        self.assertEqual(result, "Bak @chatlate\ncode()")
        self.assertEqual(ranges, [(4, 9), (14, 6)])

    def test_an_entity_inside_an_emoji_is_rejected(self):
        with self.assertRaises(chatlate.FormattingError):
            chatlate.plan("😀a", [("TL_messageEntityBold", 1, 2)])

    def test_text_without_letters_is_not_sent(self):
        planned = chatlate.plan("12:30 🎉", [])
        self.assertFalse(any(p["translate"] for p in planned["pieces"]))


class FakeTransport:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def __call__(self, url, data=None, json_body=None, headers=None, timeout=8):
        self.calls.append({"url": url, "data": data, "json": json_body})
        return self.reply(url, data, json_body)


class Providers(unittest.TestCase):
    def test_google_escapes_markup_and_sends_one_field_per_text(self):
        transport = FakeTransport(lambda url, data, body: (200, [["Merhaba", "en"], ["a < b", "en"]], ""))
        out = chatlate.Google(transport).translate(["Hello", "a < b"], "tr", 5)
        self.assertEqual(out, ["Merhaba", "a < b"])
        call = transport.calls[0]
        self.assertTrue(call["url"].endswith("&tl=tr"))
        self.assertEqual(form(call["data"], "q"), ["Hello", "a &lt; b"])

    def test_a_google_redirect_is_a_rate_limit(self):
        transport = FakeTransport(lambda url, data, body: (302, None, ""))
        with self.assertRaises(chatlate.RateLimited):
            chatlate.Google(transport).translate(["Hello"], "tr", 5)

    def test_yandex_keeps_each_request_to_one_script(self):
        transport = FakeTransport(lambda url, data, body: (200, {"code": 200, "text": ["x"] * len(form(data, "text"))}, ""))
        chatlate.Yandex(transport).translate(["Hello", "Привет", "World"], "zh-CN", 5)
        groups = sorted(form(call["data"], "text") for call in transport.calls)
        self.assertEqual(groups, [["Hello", "World"], ["Привет"]])
        self.assertIn("lang=zh", transport.calls[0]["url"])

    def test_microsoft_decodes_entities_the_source_did_not_contain(self):
        reply = [{"translations": [{"text": "a &amp;&amp; b"}]}, {"translations": [{"text": "Yaz &amp;amp;"}]}]
        transport = FakeTransport(lambda url, data, body: (200, reply, ""))
        out = chatlate.Microsoft(transport).translate(["a && b", "Write &amp;"], "zh-TW", 5)
        self.assertEqual(out, ["a && b", "Yaz &amp;amp;"])
        self.assertTrue(transport.calls[0]["url"].endswith("to=zh-Hant"))
        self.assertEqual(transport.calls[0]["json"], ["a && b", "Write &amp;"])


class Failover(unittest.TestCase):
    def setup(self, google_reply, yandex_reply, order=("google", "yandex")):
        self.google = FakeTransport(google_reply)
        self.yandex = FakeTransport(yandex_reply)
        self.now = [1000.0]
        return chatlate.Translator(
            [chatlate.Google(self.google), chatlate.Yandex(self.yandex)],
            lambda: list(order),
            clock=lambda: self.now[0],
        )

    def test_a_rate_limited_primary_hands_over_and_pauses(self):
        translator = self.setup(
            lambda *_: (429, None, "120"),
            lambda url, data, body: (200, {"code": 200, "text": ["Merhaba"]}, ""),
        )
        result = translator.translate([("Hello", [])], "tr")
        self.assertEqual(result, [("Merhaba", [])])
        # Google is paused, so the next message goes straight to Yandex.
        translator.translate([("Hello again", [])], "tr")
        self.assertEqual(len(self.google.calls), 1)
        self.assertEqual(len(self.yandex.calls), 2)

    def test_repeated_text_is_served_from_the_cache(self):
        translator = self.setup(lambda *_: (200, [["Merhaba", "en"]], ""), lambda *_: (500, None, ""))
        translator.translate([("Hello", [])], "tr")
        translator.translate([("Hello", [])], "tr")
        self.assertEqual(len(self.google.calls), 1)

    def test_a_permanent_error_stops_without_trying_backups(self):
        translator = self.setup(lambda *_: (403, None, ""), lambda *_: (200, {"code": 200, "text": ["x"]}, ""))
        with self.assertRaises(chatlate.PermanentHttpError):
            translator.translate([("Hello", [])], "tr")
        self.assertEqual(self.yandex.calls, [])

    def test_formatting_survives_a_backup_translation(self):
        translator = self.setup(
            lambda *_: (503, None, ""),
            lambda url, data, body: (200, {"code": 200, "text": ["Merhaba", "dünya"]}, ""),
        )
        result = translator.translate([("Hello world", [("TL_messageEntityItalic", 6, 5)])], "tr")
        self.assertEqual(result, [("Merhaba dünya", [(8, 5)])])


if __name__ == "__main__":
    unittest.main()
