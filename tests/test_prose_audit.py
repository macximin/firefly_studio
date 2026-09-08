import copy
import importlib.util
import json
from pathlib import Path
import py_compile
import shutil
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prose_audit", ROOT / "scripts/prose-audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
POLICY = json.loads(audit.POLICY.read_text())


class ProseAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = audit.verify_vendor(POLICY)

    def test_vendor_pin_and_license_are_verified(self):
        self.assertEqual(self.snapshot.name, POLICY["upstream"]["commit"])
        self.assertIn("MIT License", (self.snapshot / "LICENSE").read_text())
        bad = copy.deepcopy(POLICY)
        bad["upstream"]["manifestSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "manifest hash"):
            audit.verify_vendor(bad)

    def test_modified_dependency_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = root / "snapshot"
            shutil.copytree(self.snapshot, snapshot)
            bad = copy.deepcopy(POLICY)
            bad["upstream"]["snapshot"] = "snapshot"
            target = snapshot / audit.REFERENCE_DIR / "metrics.py"
            target.chmod(0o644)
            target.write_text(target.read_text() + "\nraise RuntimeError('must not execute')\n")
            with self.assertRaisesRegex(ValueError, "file hash"):
                audit.verify_vendor(bad, root)

    def test_unverified_existing_bytecode_is_never_executed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = root / "snapshot"
            shutil.copytree(self.snapshot, snapshot)
            local = copy.deepcopy(POLICY)
            local["upstream"]["snapshot"] = "snapshot"
            poison = root / "poison.py"
            poison.write_text("raise RuntimeError('unpinned bytecode executed')\n")
            for filename in ("metrics.py", "metrics_v2.py"):
                source = snapshot / audit.REFERENCE_DIR / filename
                cache = Path(importlib.util.cache_from_source(str(source)))
                cache.parent.mkdir(exist_ok=True)
                py_compile.compile(str(poison), cfile=str(cache), doraise=True,
                                   invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
            verified, contents = audit.verify_vendor(local, root, include_contents=True)
            result = audit.analyze("돈은 내 것이다.", local, verified, verified_contents=contents)
            self.assertEqual(result["findings"], [])
            self.assertEqual(set(result["descriptiveStatistics"]), audit.ALLOWED_METRICS)

    def test_analysis_uses_verified_bytes_without_a_second_dependency_read(self):
        verified, contents = audit.verify_vendor(POLICY, include_contents=True)
        with mock.patch.object(Path, "read_bytes", side_effect=AssertionError("dependency reread")), \
             mock.patch.object(Path, "read_text", side_effect=AssertionError("dependency reread")):
            result = audit.analyze("서술에 있어서.", POLICY, verified, verified_contents=contents)
        self.assertEqual([item["surface"] for item in result["findings"]], ["에 있어서"])

    def test_exact_spans_only_outside_protected_material(self):
        text = """## 1. 결론적으로 제목
평범한 서술에 있어서 판단되어진다. 결론적으로 돈을 챙긴다.
| WHO | 결론적으로 에 있어서 되어진다 |
`결론적으로` 그리고 "에 있어서".
> 되어진다.

```text
결론적으로 에 있어서 되어진다
```
## 8. 참고 작품의 역설계·조합·변주
결론적으로 원작 사실에 있어서 되어진다.
## 9. 기획 의도와 집필 계획
요약하면 그는 돈을 얻는다.
## HIL 기록
결론적으로 에 있어서 되어진다.
"""
        result = audit.analyze(text, POLICY, self.snapshot)
        self.assertEqual([item["surface"] for item in result["findings"]], ["에 있어서", "되어진다", "결론적으로", "요약하면"])
        for item in result["findings"]:
            self.assertEqual(text[item["start"]:item["end"]], item["surface"])
            self.assertTrue(all(item["end"] <= region["start"] or item["start"] >= region["end"] for region in result["protectedRanges"]))

    def test_output_is_exclusive_and_source_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, output = root / "plan.md", root / "audit.json"
            original = "## 1. 계획\n결론적으로 그는 300억을 받는다.\n".encode()
            source.write_bytes(original)
            result = audit.audit_file(source, output)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(result["input"]["sha256"], audit.sha(original))
            before = output.read_bytes()
            with self.assertRaises(ValueError):
                audit.audit_file(source, output)
            self.assertEqual(output.read_bytes(), before)
            with self.assertRaises(ValueError):
                audit.audit_file(source, source)

    def test_no_scores_fallback_or_penalties_and_no_import_pollution(self):
        text = "돈은 내 것이다.\n갚지 않는다.\n웃었다.\n이겼다.\n"
        old = sys.modules.get("metrics")
        paths = list(sys.path)
        bytecode = sys.dont_write_bytecode
        result = audit.analyze(text, POLICY, self.snapshot)
        self.assertEqual(result["findings"], [])
        self.assertEqual(set(result["descriptiveStatistics"]), audit.ALLOWED_METRICS)
        self.assertIs(result["baseline"]["used"], False)
        self.assertIs(result["baseline"]["fallbackUsed"], False)
        self.assertIs(result["baseline"]["upstreamCalibrationDue"], True)
        self.assertEqual(sys.path, paths)
        self.assertIs(sys.modules.get("metrics"), old)
        self.assertEqual(sys.dont_write_bytecode, bytecode)
        self.assertFalse({"score", "quality", "grade", "aiProbability", "rewrite"}.intersection(result))

    def test_metadata_references_and_dialogue_remain_out_of_scope(self):
        text = """---
source: 결론적으로
---
**참고한 작품과 가져올 요소:**
결론적으로 에 있어서 되어진다.
**대표 장면:** 그는 자신의 현금을 챙긴다.
<!-- HUMANIZE-SUMMARY 결론적으로 -->
"""
        self.assertEqual(audit.analyze(text, POLICY, self.snapshot)["findings"], [])
        dialogue = "- 결론적으로 내 돈이다.\n\n서술에 있어서 되돌아본다.\n"
        self.assertEqual([item["surface"] for item in audit.analyze(dialogue, POLICY, self.snapshot, "manuscript")["findings"]], ["에 있어서"])
        self.assertEqual(audit.analyze('{"HIL":"결론적으로"}', POLICY, self.snapshot)["findings"], [])
        reference = "참고작: 결론적으로\n에 있어서 되어진다.\n## 2. 줄거리\n요약하면 내 돈이다.\n"
        self.assertEqual([item["surface"] for item in audit.analyze(reference, POLICY, self.snapshot)["findings"]], ["요약하면"])

    def test_baseline_or_rewrite_policy_cannot_be_enabled_silently(self):
        bad = copy.deepcopy(POLICY)
        bad["automaticRewrite"] = True
        with self.assertRaises(ValueError):
            audit.verify_vendor(bad)
        bad = copy.deepcopy(POLICY)
        bad["metrics"].append("compute_all_v2")
        with self.assertRaises(ValueError):
            audit.verify_vendor(bad)


if __name__ == "__main__":
    unittest.main()
