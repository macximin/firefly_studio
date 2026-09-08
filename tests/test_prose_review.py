import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prose_review", ROOT / "scripts/prose-review.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ProseReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "plan.md"
        self.original = "## 1. 작품명\n그는 협상에 있어서 돈을 챙긴다.\n| WHAT | 결론적으로 성공한다 |\n“요약하면 내 돈이다.”\n## 8. 참고 작품\n원작에 있어서 성공했다.\n## 9. 집필 계획\n요약하면 빠른 보상을 쓴다.\n".encode()
        self.source.write_bytes(self.original)
        self.directory = self.root / "review"
        self.request = review.prepare(self.source, self.directory)
        self.request_path = self.directory / "request.json"
        self.response = self.root / "stdout.raw"
        self.output = self.root / "observation.json"

    def payload(self):
        return {"inputSha256": review.sha(self.original), "findings": [{"ruleId": "A-3", "surface": "에 있어서",
                "exactLine": 2, "reason": "거래 행동을 소개하는 서술에서 불필요한 연결 표현일 가능성이 있다.",
                "keepReason": "협상 범위를 강조하려는 의도라면 유지한다."}], "summary": "보호 구역을 제외한 문체 후보 하나를 관찰했다."}

    def run_validation(self, payload=None, **kwargs):
        self.response.write_bytes(review.json_bytes(self.payload() if payload is None else payload))
        return review.validate(self.request_path, self.response, self.output, **kwargs)

    def test_prepare_includes_every_active_pattern_and_masks_protected_source(self):
        self.assertEqual(self.request["upstream"]["totalPatternIds"], 85)
        ids = self.request["upstream"]["activePatternIds"]
        self.assertEqual(len(ids), 84)
        self.assertIn("J-1", ids)
        self.assertNotIn("A-17", ids)
        prompt = (self.directory / "prompt.md").read_text()
        self.assertIn("## J-1. 과도한 **볼드**", prompt)
        self.assertNotIn("### A-17.", prompt)
        masked = (self.directory / "masked-input.txt").read_bytes().decode()
        self.assertEqual(len(masked), len(self.original.decode()))
        self.assertEqual(masked.count("\n"), self.original.count(b"\n"))
        self.assertNotIn("원작에 있어서 성공했다", masked)
        self.assertNotIn("내 돈이다", masked)
        self.assertEqual(len(self.request["inkosReferences"]), 3)
        self.assertEqual(self.source.read_bytes(), self.original)
        with self.assertRaisesRegex(ValueError, "directory must be new"):
            review.prepare(self.source, self.directory)

    def test_validates_exact_original_spans_without_changing_input(self):
        result = self.run_validation()
        item = result["findings"][0]
        self.assertEqual(self.original.decode()[item["start"]:item["end"]], "에 있어서")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertFalse(result["writes"]["inputModified"])
        self.assertFalse(result["providerEvidence"]["modelExecutionVerified"])

    def test_grok_envelope_preserves_usage_and_binds_receipt_to_prompt(self):
        envelope = {"text": "```json\n" + json.dumps(self.payload(), ensure_ascii=False) + "\n```", "stopReason": "end_turn",
                    "usage": {"input_tokens": 100, "output_tokens": 25}, "modelUsage": {"grok-test": {"modelCalls": 1}},
                    "num_turns": 1, "total_cost_usd": 0.01}
        self.response.write_bytes(review.json_bytes(envelope))
        receipt = self.root / "receipt.json"
        receipt.write_bytes(review.json_bytes({"status": "process_completed", "exitCode": 0,
                            "inputSha256": self.request["prompt"]["sha256"],
                            "rawFiles": {"stdout.raw": review.sha(self.response.read_bytes())}}))
        result = review.validate(self.request_path, self.response, self.output, receipt)
        self.assertTrue(result["providerEvidence"]["modelExecutionVerified"])
        self.assertEqual(result["providerEvidence"]["providerUsage"], envelope["usage"])
        self.output.unlink()
        wrong = json.loads(receipt.read_text());wrong["inputSha256"] = "0" * 64
        receipt.write_bytes(review.json_bytes(wrong))
        with self.assertRaisesRegex(ValueError, "prompt hash mismatch"):
            review.validate(self.request_path, self.response, self.output, receipt)

    def test_rejects_unknown_deferred_invented_and_protected_findings(self):
        cases = [({"ruleId": "A-17"}, "Unknown or deferred"), ({"ruleId": "Z-1"}, "Unknown or deferred"),
                 ({"surface": "없는 문장"}, "absent or ambiguous"), ({"exactLine": 3, "surface": "결론적으로"}, "protected"),
                 ({"exactLine": 4, "surface": "요약하면"}, "protected"),
                 ({"exactLine": 6}, "protected"), ({"exactLine": True}, "exactLine")]
        for change, message in cases:
            with self.subTest(change=change):
                payload = self.payload();payload["findings"][0].update(change)
                with self.assertRaisesRegex(ValueError, message):
                    self.run_validation(payload)
                self.assertFalse(self.output.exists())

    def test_rejects_rewrites_scores_missing_keep_reason_and_wrong_input_hash(self):
        payload = self.payload();payload["score"] = 90
        with self.assertRaisesRegex(ValueError, "schema"):
            self.run_validation(payload)
        payload = self.payload();payload["findings"][0]["suggestedRewrite"] = "수정문"
        with self.assertRaisesRegex(ValueError, "schema"):
            self.run_validation(payload)
        payload = self.payload();del payload["findings"][0]["keepReason"]
        with self.assertRaisesRegex(ValueError, "keep reason"):
            self.run_validation(payload)
        payload = self.payload();payload["inputSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "input hash"):
            self.run_validation(payload)

    def test_original_prompt_and_output_are_immutable(self):
        self.source.write_bytes(self.original + b"\n")
        with self.assertRaisesRegex(ValueError, "artifact changed"):
            self.run_validation()
        self.source.write_bytes(self.original)
        self.run_validation()
        before = self.output.read_bytes()
        with self.assertRaisesRegex(ValueError, "new sidecar"):
            self.run_validation()
        self.assertEqual(self.output.read_bytes(), before)
        self.output.unlink()
        prompt = self.directory / "prompt.md"
        prompt.write_bytes(prompt.read_bytes() + b"\n")
        with self.assertRaisesRegex(ValueError, "artifact changed"):
            self.run_validation()

    def test_empty_findings_are_valid_and_html_comments_are_not(self):
        payload = self.payload();payload["findings"] = []
        self.assertEqual(self.run_validation(payload)["findings"], [])
        self.output.unlink()
        payload["summary"] = "<!-- report -->"
        with self.assertRaisesRegex(ValueError, "HTML"):
            self.run_validation(payload)

    def test_column_resolves_repeated_surface_and_duplicates_are_rejected(self):
        self.source.write_text("에 있어서 에 있어서\n")
        directory = self.root / "second-review"
        request = review.prepare(self.source, directory)
        payload = self.payload();payload["inputSha256"] = request["input"]["sha256"]
        payload["findings"][0].update(exactLine=1)
        self.response.write_bytes(review.json_bytes(payload))
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            review.validate(directory / "request.json", self.response, self.output)
        payload["findings"][0]["column"] = 7
        self.response.write_bytes(review.json_bytes(payload))
        result = review.validate(directory / "request.json", self.response, self.output)
        self.assertEqual(result["findings"][0]["start"], 6)
        self.output.unlink()
        payload["findings"].append(copy.deepcopy(payload["findings"][0]))
        self.response.write_bytes(review.json_bytes(payload))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            review.validate(directory / "request.json", self.response, self.output)


if __name__ == "__main__":
    unittest.main()
