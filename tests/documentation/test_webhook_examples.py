"""Execute public MDX webhook examples with synthetic fixtures and local SQLite only.

No private backend source, network calls, Bridge credentials or sender AST is used.
The existing CI test_*.py discovery picks up this module automatically.
"""
import ast
import concurrent.futures
import copy
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch


SOURCE_ROOT = Path(os.environ.get("BRIDGE_DOCS_SOURCE", Path(__file__).resolve().parents[2])).resolve()
LOCALES = ("en", "es", "pt-br")


def code_blocks(markdown):
    return [(language.strip().split()[0], body) for language, body in
            re.findall(r"(?ms)^```([^\n]+)\n(.*?)^```[ \t]*(?:\n|$)", markdown)]


def has_definition(source, name):
    return any(isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name == name
               for node in ast.parse(source).body)


def one(values, label):
    if len(values) != 1:
        raise AssertionError("Expected one published " + label + ", found " + str(len(values)))
    return values[0]


def load_examples(source_root, locale):
    prefix = "" if locale == "en" else locale + "/"
    verifier_path = Path(source_root) / (prefix + "webhooks/verifying-signatures.mdx")
    receiver_path = Path(source_root) / (prefix + "webhooks/receive-events.mdx")
    verifier_text, receiver_text = verifier_path.read_text(), receiver_path.read_text()
    verifier_blocks, receiver_blocks = code_blocks(verifier_text), code_blocks(receiver_text)
    verifier = one([body for language, body in verifier_blocks
                    if language == "python" and has_definition(body, "verify_webhook")], "verifier")
    receiver = one([body for language, body in receiver_blocks
                    if language == "python" and has_definition(body, "make_wsgi_app")], "receiver")
    configuration = one([body for language, body in receiver_blocks
                         if language == "python" and "from bridge_webhooks import" in body], "WSGI configuration")
    event = json.loads(one([body for language, body in verifier_blocks if language == "json"], "JSON vector"))
    canonical = one([body.rstrip("\n") for language, body in verifier_blocks if language == "text"], "canonical text vector")
    signature = one(re.findall(r"`(sha256=[0-9a-f]{64})`", verifier_text), "signature vector")
    secret = one(re.findall(r"`(bridge-docs-[^`\n]*secret)`", verifier_text), "synthetic secret")
    key = one(re.findall(r"`(bridge-docs-[^`\n]*key)`", verifier_text), "synthetic API key")
    timestamps = set(re.findall(r"`([0-9]{10})`", verifier_text))
    now = int(one(list(timestamps), "timestamp vector"))
    module = types.ModuleType("bridge_webhooks")
    module.__file__ = str(verifier_path)
    exec(compile(verifier, str(verifier_path), "exec"), module.__dict__)
    exec(compile(receiver, str(receiver_path), "exec"), module.__dict__)
    return types.SimpleNamespace(module=module, event=event, canonical=canonical,
                                 signature=signature, secret=secret, key=key, now=now,
                                 configuration=configuration, receiver_path=receiver_path)


def make_test_case(locale):
    class PublishedWebhookExamples(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            cls.examples = load_examples(SOURCE_ROOT, locale)

        def setUp(self):
            self.temp = tempfile.TemporaryDirectory(prefix="bridge-docs-webhook-")
            self.addCleanup(self.temp.cleanup)
            self.database = Path(self.temp.name) / "inbox.sqlite"
            self.module = self.examples.module
            self.inbox = self.module.SQLiteInbox(self.database)
            self.event = copy.deepcopy(self.examples.event)
            self.headers = {"X-Bridge-API-Key": self.examples.key,
                            "X-Bridge-Signature": self.examples.signature,
                            "X-Bridge-Timestamp": str(self.examples.now)}

        def verify(self, event=None, headers=None, now=None, raw=None):
            event = self.event if event is None else event
            raw = json.dumps(event, ensure_ascii=False).encode() if raw is None else raw
            return self.module.verify_webhook(raw, self.headers if headers is None else headers,
                                             self.examples.key, self.examples.secret,
                                             now=self.examples.now if now is None else now)

        def row_count(self):
            with sqlite3.connect(self.database) as database:
                return database.execute("SELECT COUNT(*) FROM webhook_inbox").fetchone()[0]

        def request(self, inbox=None, headers=None, start_response=None):
            raw = json.dumps(self.event, ensure_ascii=False).encode()
            headers = self.headers if headers is None else headers
            environment = {"REQUEST_METHOD": "POST", "CONTENT_LENGTH": str(len(raw)),
                           "wsgi.input": io.BytesIO(raw),
                           **{"HTTP_" + name.upper().replace("-", "_"): value
                              for name, value in headers.items()}}
            statuses = []
            app = self.module.make_wsgi_app(self.inbox if inbox is None else inbox,
                                           self.examples.key, self.examples.secret)
            def capture(status, response_headers):
                statuses.append(status)
                if start_response:
                    start_response(status, response_headers)
            with patch.object(self.module.time, "time", return_value=self.examples.now):
                body = b"".join(app(environment, capture))
            return statuses, json.loads(body)

        def test_public_vector_matches_exact_canonical_bytes_and_known_digest(self):
            canonical = self.module.canonical_payload(self.event)
            self.assertEqual(canonical, self.examples.canonical.encode("utf-8"))
            expected = "sha256=" + hmac.new(self.examples.secret.encode(), canonical, hashlib.sha256).hexdigest()
            self.assertEqual(expected, self.examples.signature)
            self.assertEqual(self.verify(), self.event)

        def test_literal_unicode_and_recursively_reordered_keys_verify(self):
            self.assertEqual(self.event["payload"]["name"], "José")
            event = dict(reversed(list(self.event.items())))
            event["payload"] = dict(reversed(list(event["payload"].items())))
            self.assertEqual(self.verify(event), self.event)

        def test_header_names_are_case_insensitive(self):
            self.assertEqual(self.verify(headers={name.lower(): value for name, value in self.headers.items()}), self.event)

        def test_changed_payload_is_rejected(self):
            self.event["payload"]["count"] += 1
            with self.assertRaises(self.module.VerificationError):
                self.verify()

        def test_wrong_key_secret_and_signature_are_rejected(self):
            for header, value in [("X-Bridge-API-Key", "wrong"), ("X-Bridge-Signature", "sha256=no"),
                                  ("X-Bridge-Signature", "sha256=" + "0" * 64)]:
                with self.subTest(header=header, value=value), self.assertRaises(self.module.VerificationError):
                    self.verify(headers={**self.headers, header: value})
            with self.assertRaises(self.module.VerificationError):
                self.module.verify_webhook(json.dumps(self.event).encode(), self.headers,
                                           self.examples.key, "wrong-secret", now=self.examples.now)

        def test_stale_future_and_malformed_timestamps_are_rejected(self):
            for value in [str(self.examples.now - 301), str(self.examples.now + 301), "", "1.5", "invalid"]:
                with self.subTest(timestamp=value), self.assertRaises(self.module.VerificationError):
                    self.verify(headers={**self.headers, "X-Bridge-Timestamp": value})

        def test_timestamp_window_boundaries_are_accepted(self):
            for now in [self.examples.now - 300, self.examples.now + 300]:
                with self.subTest(now=now):
                    self.assertEqual(self.verify(now=now), self.event)

        def test_raw_body_digest_is_not_a_substitute_for_the_canonical_digest(self):
            raw = json.dumps(self.event, ensure_ascii=False, separators=(",", ":")).encode()
            signature = "sha256=" + hmac.new(self.examples.secret.encode(), raw, hashlib.sha256).hexdigest()
            with self.assertRaises(self.module.VerificationError):
                self.verify(raw=raw, headers={**self.headers, "X-Bridge-Signature": signature})

        def test_invalid_json_unicode_duplicate_keys_and_non_objects_are_rejected(self):
            for raw in [b"{", b"\xff", b'{"eventId":"first","eventId":"second"}', b"[]"]:
                with self.subTest(raw=raw), self.assertRaises(self.module.VerificationError):
                    self.verify(raw=raw)

        def test_exact_replay_is_deduplicated_after_a_real_process_restart(self):
            self.assertTrue(self.inbox.accept(self.verify()))
            program = ("import json,runpy,sys\n"
                       "p=json.load(sys.stdin)\n"
                       "helpers=runpy.run_path(p['test_file'],run_name='webhook_test_helpers')\n"
                       "examples=helpers['load_examples'](p['source_root'],p['locale'])\n"
                       "print(json.dumps({'inserted':examples.module.SQLiteInbox(p['database']).accept(p['event'])}))\n")
            payload = {"test_file": str(Path(__file__).resolve()), "source_root": str(SOURCE_ROOT),
                       "locale": locale, "database": str(self.database), "event": self.event}
            child = subprocess.run([sys.executable, "-c", program], input=json.dumps(payload),
                                   text=True, capture_output=True, check=True)
            self.assertFalse(json.loads(child.stdout)["inserted"])
            self.assertEqual(self.row_count(), 1)

        def test_same_identifiers_with_distinct_payloads_are_both_retained(self):
            self.assertTrue(self.inbox.accept(self.event))
            changed = copy.deepcopy(self.event)
            changed["payload"]["count"] += 1
            self.assertTrue(self.inbox.accept(changed))
            self.assertEqual(self.row_count(), 2)

        def test_retimestamped_replay_still_requires_the_durable_inbox(self):
            self.assertTrue(self.inbox.accept(self.verify()))
            later = self.examples.now + 1000
            replay = self.verify(headers={**self.headers, "X-Bridge-Timestamp": str(later)}, now=later)
            self.assertFalse(self.inbox.accept(replay))
            self.assertEqual(self.row_count(), 1)

        def test_acknowledgement_sees_a_committed_row_from_another_connection(self):
            def after_commit(status, _headers):
                self.assertEqual(status, "200 OK")
                self.assertEqual(self.row_count(), 1)
                with sqlite3.connect(self.database) as database:
                    self.assertEqual(database.execute("SELECT processed FROM webhook_inbox").fetchone()[0], 0)
            self.assertEqual(self.request(start_response=after_commit), (["200 OK"], {"accepted": True}))

        def test_storage_failure_returns_503_without_acknowledging_success(self):
            inbox = Mock()
            inbox.accept.side_effect = sqlite3.OperationalError("unavailable")
            self.assertEqual(self.request(inbox=inbox), (["503 Service Unavailable"], {"accepted": False}))
            self.assertEqual(self.row_count(), 0)

        def test_duplicate_wsgi_requests_are_acknowledged_without_a_second_row(self):
            self.assertEqual(self.request(), (["200 OK"], {"accepted": True}))
            self.assertEqual(self.request(), (["200 OK"], {"accepted": True}))
            self.assertEqual(self.row_count(), 1)

        def test_published_wsgi_configuration_runs_with_synthetic_environment(self):
            environment = {"WEBHOOK_INBOX_PATH": str(self.database),
                           "BRIDGE_WEBHOOK_API_KEY": self.examples.key,
                           "BRIDGE_WEBHOOK_CLIENT_SECRET": self.examples.secret}
            namespace = {}
            with patch.dict(sys.modules, {"bridge_webhooks": self.module}), patch.dict(os.environ, environment):
                exec(compile(self.examples.configuration, str(self.examples.receiver_path), "exec"), namespace)
            self.assertTrue(callable(namespace["application"]))

        def test_concurrent_exact_duplicates_have_one_atomic_inbox_record(self):
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                inserted = list(pool.map(lambda _index: self.inbox.accept(self.event), range(8)))
            self.assertEqual(sum(inserted), 1)
            self.assertEqual(self.row_count(), 1)

        def test_lost_ack_after_commit_can_be_retried_without_duplicating(self):
            def lost_ack(_status, _headers):
                raise ConnectionResetError("synthetic acknowledgement loss")
            with self.assertRaises(ConnectionResetError):
                self.request(start_response=lost_ack)
            self.assertEqual(self.row_count(), 1)
            self.assertEqual(self.request(), (["200 OK"], {"accepted": True}))
            self.assertEqual(self.row_count(), 1)

    PublishedWebhookExamples.__name__ = "TestPublishedWebhookExamples_" + locale.replace("-", "_")
    PublishedWebhookExamples.__qualname__ = PublishedWebhookExamples.__name__
    return PublishedWebhookExamples


for _locale in LOCALES:
    globals()["TestPublishedWebhookExamples_" + _locale.replace("-", "_")] = make_test_case(_locale)


if __name__ == "__main__":
    unittest.main(verbosity=2)
