import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


offline = load("offline_input_test", ROOT / "scripts/prepare-author-input.py")
config = json.loads((ROOT / "config/daily-planning.json").read_text())


class AuthorInputTests(unittest.TestCase):
    def test_custom_focus_searches_eligible_cases_and_preserves_the_problem_in_the_input(self):
        craft_config = {key: value for key, value in config["authorCraft"].items() if key != "sceneExamples"}
        cfg = {**config, "authorCraft": craft_config}
        before = json.dumps(cfg, sort_keys=True)
        focus = "가족 각자의 경험과 걱정 때문에 같은 제안을 다르게 받아들인다."
        with tempfile.TemporaryDirectory() as temporary, patch.object(offline.planning, "load_source_materials", return_value={"promptParts": [], "sources": []}):
            first = offline.prepare(cfg, "2026-09-12", query=focus, destination=Path(temporary) / "adaptive", template="양식")
            self.assertEqual(first["receipt"]["craftSelectionMode"], "query")
            self.assertIn("supporting-character-life", first["receipt"]["authorCraft"]["selection"]["selectedCaseIds"])
            self.assertIn(focus, (Path(first["path"]) / "input.md").read_text())
            self.assertEqual(first["receipt"]["focusProblem"], focus)
            pinned = offline.prepare(cfg, "2026-09-12", query=focus, case_ids=["lived-reward"], destination=Path(temporary) / "explicit", template="양식")
            self.assertEqual(pinned["receipt"]["craftSelectionMode"], "explicit")
            self.assertEqual(pinned["receipt"]["authorCraft"]["selection"]["selectedCaseIds"], ["lived-reward"])
        self.assertEqual(json.dumps(cfg, sort_keys=True), before)

    def test_scene_examples_require_explicit_selected_works_and_keep_hashes_and_scope(self):
        no_scope = offline.craft_input.select_craft(config["authorCraft"], "협상")
        self.assertEqual(no_scope["sceneExamples"]["rendered"], "")
        selected = offline.craft_input.select_craft(config["authorCraft"], "협상", work_ids=["doksik-chaebol3"])
        scenes = selected["sceneExamples"]
        # Public checkouts may lack licensed sources; absence is an explicit optional result.
        if not scenes["receipt"]["selected"]:
            self.assertTrue(all(item["reason"] == "local-source-unavailable" for item in scenes["receipt"]["omitted"]))
            return
        self.assertTrue(all(item["workId"] == "doksik-chaebol3" for item in scenes["receipt"]["selected"]))
        self.assertLessEqual(scenes["receipt"]["characters"], 7500)
        self.assertEqual(offline.planning.digest(scenes["rendered"]), scenes["receipt"]["renderedSha256"])
        with self.assertRaisesRegex(ValueError, "selected source works"):
            offline.planning.build_input("양식", "현대판타지", {"promptParts": [], "sources": []}, offline.planning.scope_hil([]), selected)
        source_hash = scenes["receipt"]["selected"][0]["sourceSha256"]
        with self.assertRaisesRegex(ValueError, "source bytes differ"):
            offline.planning.build_input("양식", "현대판타지", {"promptParts": [], "sources": [{"id": "doksik-chaebol3", "sourceBytesSha256": "0" * 64}]}, offline.planning.scope_hil([]), selected)
        built = offline.planning.build_input("양식", "현대판타지", {"promptParts": [], "sources": [{"id": "doksik-chaebol3", "sourceBytesSha256": source_hash}]}, offline.planning.scope_hil([]), selected)
        self.assertIn(scenes["rendered"], built)
        scenes["rendered"] += "변경"
        with self.assertRaisesRegex(ValueError, "scene receipt"):
            offline.planning.build_input("양식", "현대판타지", {"promptParts": []}, offline.planning.scope_hil([]), selected)

    def test_natural_problem_queries_do_not_select_from_scaffolding_or_incidental_title_words(self):
        adaptive = {key: value for key, value in config["authorCraft"].items() if key != "caseIds"}
        selected = offline.craft_input.select_craft(adaptive, "## 회차 목표\n## 이번 장면\n주차장에 도착한다.", "writing")
        self.assertEqual(selected["receipt"]["selectedCaseIds"], [])
        dialogue = offline.craft_input.select_craft(adaptive, "발화자가 헷갈리고 호칭이 달라 대사가 구분되지 않는다.", "writing")
        self.assertIn("dialogue-clarity", dialogue["receipt"]["selectedCaseIds"])
        self.assertNotIn("lived-reward", dialogue["receipt"]["selectedCaseIds"])
        reveal = offline.craft_input.select_craft(adaptive, "독자가 아는 비밀을 주인공도 갑자기 알고 있다.", "writing")
        self.assertEqual(reveal["receipt"]["selectedCaseIds"][0], "reader-reveal")
        unrelated = offline.craft_input.select_craft(adaptive, "돈키호테의 풍차 공격", "writing")
        self.assertNotIn("lived-reward", unrelated["receipt"]["selectedCaseIds"])

    def test_registered_engine_selects_pinned_cases_without_installing_or_generating(self):
        selected = offline.craft_input.select_craft(config["authorCraft"], "현대판타지")
        self.assertEqual(set(selected["receipt"]["selectedCaseIds"]), {"wanted-moment", "independent-counterparty", "lived-reward"})
        self.assertIn("적용하지 않을 경우", selected["rendered"])
        self.assertFalse(selected["adapter"]["humanReviewRequired"])
        self.assertEqual(selected["adapter"]["modelCalls"], 0)
        self.assertLessEqual(selected["receipt"]["characters"], 6000)

    def test_wrong_pin_fails_and_disabled_mode_never_spawns_a_process(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            offline.craft_input.select_craft({**config["authorCraft"], "packSha256": "0" * 64}, "협상")
        with patch.object(offline.craft_input.subprocess, "run", side_effect=AssertionError("disabled")):
            self.assertIsNone(offline.craft_input.select_craft(None, "협상"))

    def test_no_match_keeps_the_existing_input_byte_for_byte(self):
        baseline = offline.planning.build_input("## 1. 양식\n본문", "현대판타지", {"promptParts": ["자료"]}, offline.planning.scope_hil([]))
        selection = offline.craft_input.select_craft({key: value for key, value in config["authorCraft"].items() if key != "caseIds"}, "zzzxxyy")
        result = offline.planning.build_input("## 1. 양식\n본문", "현대판타지", {"promptParts": ["자료"]}, offline.planning.scope_hil([]), selection)
        self.assertEqual(result, baseline)

    def test_wrong_stage_and_tampered_rendering_are_not_sent_to_a_planner(self):
        selected = offline.craft_input.select_craft(config["authorCraft"], "협상", "writing")
        with self.assertRaisesRegex(ValueError, "planning-stage"):
            offline.planning.build_input("양식", "장르", {"promptParts": []}, offline.planning.scope_hil([]), selected)
        selected["rendered"] += "injected"
        with self.assertRaisesRegex(ValueError, "receipt"):
            offline.planning.build_input("양식", "장르", {"promptParts": []}, offline.planning.scope_hil([]), selected)

    def test_offline_prepare_is_complete_local_and_reusable_without_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lab = root / "lab"
            pool = []
            for index in range(3):
                identity = f"work-{index}"
                analysis = lab / "analyses" / identity
                analysis.mkdir(parents=True)
                (analysis / "project_pitch.md").write_text("분석: 자신의 이득을 위해 거래한다.")
                source = lab / "private_sources/korean_webnovel_corpus" / f"{identity}.txt"
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text("독립적으로 작성한 시험용 원문.")
                pool.append({"id": identity, "title": identity, "source": source.name})
            cfg = {**config, "sourcePool": pool}
            destination = root / "input"
            with patch("urllib.request.urlopen", side_effect=AssertionError("No network allowed")):
                first = offline.prepare(cfg, "2026-09-12", lab=lab, destination=destination, template="## 1. 작품\n## 9. 집필 계획")
                again = offline.prepare(cfg, "2026-09-12", lab=lab, destination=destination, template="## 1. 작품\n## 9. 집필 계획")
            self.assertTrue(first["created"])
            self.assertFalse(again["created"])
            receipt = first["receipt"]
            self.assertEqual(receipt["feedbackMode"], "none")
            self.assertEqual(receipt["hilScope"]["count"], 0)
            self.assertFalse(receipt["humanReviewRequired"])
            self.assertEqual(receipt["modelCalls"], 0)
            text = (destination / "input.md").read_text()
            self.assertIn("독립적으로 작성한 시험용 원문", text)
            self.assertIn("선택한 작법 참고", text)
            self.assertEqual(offline.planning.digest(text), receipt["promptSha256"])
            before = (destination / "input-receipt.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "different"):
                offline.prepare(cfg, "2026-09-12", lab=lab, destination=destination, template="바뀐 양식")
            self.assertEqual((destination / "input-receipt.json").read_bytes(), before)
            # Changing source evidence outside its excerpt must also change the input bundle.
            source = lab / "private_sources/korean_webnovel_corpus" / "work-0.txt"
            source.write_text("a" * 8000)
            baseline = offline.prepare(cfg, "2026-09-12", lab=lab, destination=root / "other", template="양식")
            source.write_text("a" * 8000 + "뒤쪽 변경")
            with self.assertRaisesRegex(ValueError, "different"):
                offline.prepare(cfg, "2026-09-12", lab=lab, destination=root / "other", template="양식")
            self.assertTrue(baseline["created"])

    def test_reuse_rejects_receipt_tampering_even_when_stored_bundle_hash_was_not_changed(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "input"
            receipt = {"schemaVersion": "firefly-author-input/v1", "createdAt": "2026-09-12T00:00:00Z", "promptSha256": offline.planning.digest("본문"), "genre": "현대판타지"}
            bound = {key: value for key, value in receipt.items() if key != "createdAt"}
            receipt["inputBundleSha256"] = offline.planning.digest(json.dumps(bound, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
            offline.save_input(target, "본문", receipt)
            changed = {**receipt, "genre": "변조된 장르"}
            (target / "input-receipt.json").write_text(json.dumps(changed, ensure_ascii=False))
            with self.assertRaisesRegex(ValueError, "partial or different"):
                offline.save_input(target, "본문", receipt)
            self.assertEqual(json.loads((target / "input-receipt.json").read_text())["genre"], "변조된 장르")


if __name__ == "__main__":
    unittest.main()
