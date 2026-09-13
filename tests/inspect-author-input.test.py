import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("inspect_author_input_test", ROOT / "scripts/inspect-author-input.py")
inspect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspect)


class InspectInputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.saved = self.root / "saved"
        self.saved.mkdir()
        self.lab = self.root / "edge_repos/lab"
        (self.lab / "private_sources/korean_webnovel_corpus").mkdir(parents=True)
        (self.lab / "analyses/work").mkdir(parents=True)
        (self.root / "config").mkdir()
        (self.root / "config/edge-repos.json").write_text(json.dumps({"repos": [{"name": "firefly_reference_lab", "path": "edge_repos/lab"}]}))
        (self.root / "docs/templates").mkdir(parents=True)
        (self.root / "docs/templates/webnovel-project-plan-v1.md").write_text("양식\n")
        self.raw = self.lab / "private_sources/korean_webnovel_corpus/work.txt"
        self.raw.write_bytes("원문\r\n".encode())
        (self.lab / "analyses/work/project_pitch.md").write_text("분석\n")
        self.receipt = {
            "schemaVersion": "firefly-author-input/v1", "createdAt": "2026-09-12T00:00:00Z",
            "date": "2026-09-12", "genre": "시험", "promptSha256": inspect.digest("개인 원문과 피드백"),
            "templateFullSha256": inspect.digest("양식\n"),
            "sources": [{"id": "work", "title": "시험 작품", "source": "work.txt", "sourceSha256": inspect.digest("원문\n"),
                "sourceBytesSha256": inspect.digest(self.raw.read_bytes()), "analysisSha256": inspect.digest("분석\n"), "excerptCharacters": 3}],
            "feedbackMode": "local-history", "hilScope": {"count": 1, "includedDecisionIds": ["one"], "rawDecisions": [{"comment": "개인 의견 비공개"}]},
            "authorCraft": None,
        }
        (self.saved / "input.md").write_text("개인 원문과 피드백")
        self.save()

    def save(self):
        self.receipt["inputBundleSha256"] = inspect.bound_hash(self.receipt)
        (self.saved / "input-receipt.json").write_text(json.dumps(self.receipt, ensure_ascii=False))

    def test_historical_integrity_and_current_source_availability_are_distinct(self):
        result = inspect.inspect_input(self.saved, check_sources=True, hq=self.root)
        self.assertEqual(result["integrity"], "verified")
        self.assertTrue(result["currentEvidenceAllMatched"])
        self.assertEqual(len(result["currentEvidence"]), 3)
        self.assertNotIn("개인 원문", json.dumps(result, ensure_ascii=False))
        self.assertNotIn("개인 의견", json.dumps(result, ensure_ascii=False))
        self.raw.write_text("이후 변경된 원문")
        changed = inspect.inspect_input(self.saved, check_sources=True, hq=self.root)
        self.assertEqual(changed["integrity"], "verified")
        self.assertEqual(changed["currentEvidence"][0]["status"], "changed")
        self.raw.unlink()
        self.assertEqual(inspect.inspect_input(self.saved, check_sources=True, hq=self.root)["currentEvidence"][0]["status"], "unavailable")
        self.assertIsNone(inspect.inspect_input(self.saved)["currentEvidenceAllMatched"])

    def test_prompt_and_receipt_tampering_fail_independently(self):
        self.receipt["genre"] = "변경"
        (self.saved / "input-receipt.json").write_text(json.dumps(self.receipt))
        with self.assertRaisesRegex(ValueError, "bundle hash"):
            inspect.inspect_input(self.saved)
        self.save()
        (self.saved / "input.md").write_text("바뀐 원문")
        with self.assertRaisesRegex(ValueError, "prompt does not match"):
            inspect.inspect_input(self.saved)

    def test_legacy_text_hashes_use_the_recorded_normalization(self):
        self.receipt["sources"][0].pop("sourceBytesSha256")
        self.save()
        self.assertTrue(inspect.inspect_input(self.saved, check_sources=True, hq=self.root)["currentEvidenceAllMatched"])

    def test_evidence_paths_cannot_escape_the_registered_reference_repository(self):
        self.receipt["sources"][0]["source"] = "../../../../outside.txt"
        self.save()
        with self.assertRaisesRegex(ValueError, "outside its repository"):
            inspect.inspect_input(self.saved, check_sources=True, hq=self.root)
        self.receipt["sources"][0]["source"] = "linked.txt"
        self.save()
        outside = self.root / "outside.txt"
        outside.write_text("원문\n")
        (self.raw.parent / "linked.txt").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "outside its repository"):
            inspect.inspect_input(self.saved, check_sources=True, hq=self.root)

    def test_cli_reports_parse_failures_without_leaking_the_input_fragment(self):
        (self.saved / "input-receipt.json").write_text("private manuscript is not JSON")
        result = subprocess.run([sys.executable, str(ROOT / "scripts/inspect-author-input.py"), str(self.saved)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("private manuscript", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_invalid_nested_metadata_is_not_reported_as_a_verified_input(self):
        self.receipt["authorCraft"] = "invalid private data"
        self.save()
        with self.assertRaisesRegex(ValueError, "metadata sections"):
            inspect.inspect_input(self.saved)
        result = subprocess.run([sys.executable, str(ROOT / "scripts/inspect-author-input.py"), str(self.saved)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("invalid private data", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
