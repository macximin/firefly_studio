import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("feedback_test", ROOT / "scripts/reviewed-feedback-input.py")
feedback = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feedback)


def fixture():
    row = {"id": "d1", "packetId": "frp-" + "a" * 24, "packetSha256": "a" * 64,
           "candidateId": "p01", "candidateSha256": "b" * 64, "artifactId": "pitch",
           "decision": "hold", "comment": "이 장면의 거래 목적이 불명확하다.",
           "createdAt": "2026-09-12T00:00:00Z", "status": "pending", "actorEmail": "private@example.test"}
    scope = feedback.planning.scope_hil([row])
    context = {"id": "context-1", "packetId": row["packetId"], "packetSha256": row["packetSha256"],
               "candidateId": "p01", "candidateSha256": row["candidateSha256"], "artifactId": "pitch",
               "body": "원래 검토한 기획 본문", "contentSha256": feedback.planning.digest("원래 검토한 기획 본문")}
    hydrated = {"contexts": [context], "characters": len(context["body"]), "targets": [
        {"decisionId": "d1", "packetId": row["packetId"], "candidateId": "p01", "status": "reviewed-text-loaded", "contextId": "context-1"}]}
    return scope, hydrated


class FeedbackTests(unittest.TestCase):
    def test_attaches_content_to_exact_candidate_and_keeps_raw_history_unchanged(self):
        scope, hydrated = fixture()
        before = json.dumps(scope, ensure_ascii=False)
        result = feedback.planning.attach_reviewed_feedback(scope, hydrated)
        self.assertEqual(json.dumps(scope, ensure_ascii=False), before)
        self.assertEqual(result["receipt"]["rawDecisions"], scope["receipt"]["rawDecisions"])
        self.assertEqual(result["writerContext"]["candidateFeedback"][0]["targets"][0]["contextId"], "context-1")
        self.assertIn("새 사람 검토를 기다릴 필요가 없다", result["writerContext"]["application"])
        self.assertNotIn("private@example.test", json.dumps(result["writerContext"]))
        self.assertEqual(result["receipt"]["writerContextSha256"], feedback.planning.digest(json.dumps(result["writerContext"], ensure_ascii=False)))

    def test_invalid_content_or_binding_cannot_be_labelled_reviewed(self):
        for key, value in (("body", "바뀐 본문"), ("candidateSha256", "c" * 64), ("artifactId", "other")):
            with self.subTest(key=key):
                scope, hydrated = fixture()
                hydrated["contexts"][0][key] = value
                with self.assertRaises(ValueError):
                    feedback.planning.attach_reviewed_feedback(scope, hydrated)
        scope, hydrated = fixture()
        hydrated["targets"] = []
        with self.assertRaises(ValueError):
            feedback.planning.attach_reviewed_feedback(scope, hydrated)

    def test_missing_local_runtime_records_an_explicit_gap_without_blocking_work(self):
        scope, _ = fixture()
        with patch.object(feedback.subprocess, "run", side_effect=FileNotFoundError("node unavailable")):
            result = feedback.load_reviewed_feedback(scope)
        self.assertEqual(result["writerContext"]["reviewedContexts"], [])
        self.assertEqual(result["writerContext"]["candidateFeedback"][0]["targets"][0]["contextStatus"], "context-loader-unavailable")
        self.assertFalse(result["receipt"]["reviewedContext"]["humanReviewRequired"])
        with patch.object(feedback.subprocess, "run", side_effect=AssertionError("No lookup needed")):
            empty = feedback.planning.scope_hil([])
            self.assertIs(feedback.load_reviewed_feedback(empty), empty)


if __name__ == "__main__":
    unittest.main()
