import collections
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("planning_input", ROOT / "scripts/planning-input.py")
planning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planning)


def decision(identifier, packet="packet-a", candidate="p01", day=1,
             comment="이 후보의 첫 사건을 더 구체적으로.", choice="hold"):
    return {"id": identifier, "packetId": packet, "candidateId": candidate,
            "packetSha256": "packet-hash", "candidateSha256": "candidate-hash",
            "decision": choice, "comment": comment, "status": "pending",
            "createdAt": f"2026-09-{day:02d}T00:00:00Z",
            "surfaceClassifications": [], "actorEmail": "private@example.test"}


def plan(six_w=None):
    six_w = six_w or "\n".join(f"| **{word}** | 인물은 자신의 목표를 위해 구체적으로 행동한다. |"
                               for word in planning.WORDS)
    return "\n\n".join(f"## {n}. 기획 항목\n" + (six_w if n == 2 else "인물은 사건의 결과를 얻어 다음 행동을 선택한다.")
                         for n in range(1, 10))


class InputTests(unittest.TestCase):
    def test_rotation_covers_all_twenty_bundles_and_balances_each_work(self):
        pool = [{"id": str(n), "title": f"작품 {n}"} for n in range(6)]
        anchor = dt.date(2026, 9, 6)
        days = [planning.select_sources(pool, (anchor + dt.timedelta(days=n)).isoformat())
                for n in range(20)]
        bundles = [tuple(sorted(row["id"] for row in group)) for group in days]
        self.assertEqual(len(set(bundles)), 20)
        self.assertEqual(collections.Counter(row["id"] for group in days for row in group),
                         {str(n): 10 for n in range(6)})
        self.assertEqual(planning.select_sources(pool, "2026-09-26"), days[0])
        self.assertEqual(planning.select_sources(pool, "2026-09-08"), days[2])
        self.assertEqual(len({row["id"] for row in days[0] + days[1]}), 6)
        with self.assertRaises(ValueError):
            planning.select_sources(pool + [pool[0]], "2026-09-08")

    def test_hil_keeps_latest_candidate_and_deduplicates_without_globalizing(self):
        rows = [decision("old", day=1, comment="기획서 양식이 싫어.", choice="reject"),
                decision("new", day=2, comment="양식 변경 후 선택.", choice="select"),
                decision("dup-a", packet="packet-b", comment="이 후보의 사건이 지루해."),
                decision("dup-b", packet="packet-c", comment="이 후보의 사건이 지루해."),
                decision("ops", packet="packet-d", comment="실운영 왕복 카나리: 정본 변경 없이 Storyyard→HQ→InkOS 영수증 경로만 검증"),
                decision("real", packet="packet-e", comment="카나리의 주인공이 좋다.")]
        untouched = json.loads(json.dumps(rows))
        result = planning.scope_hil(rows)
        receipt = result["receipt"]
        self.assertEqual(rows, untouched)
        self.assertEqual(receipt["rawDecisions"], rows)
        self.assertEqual(receipt["supersededDecisionIds"], ["old"])
        self.assertEqual(receipt["operationalOnlyDecisionIds"], ["ops"])
        self.assertIn("real", receipt["includedDecisionIds"])
        self.assertEqual(receipt["writerGroupCount"], 3)
        groups = result["writerContext"]["candidateFeedback"]
        duplicate = next(group for group in groups if "지루해" in group["comment"])
        self.assertEqual({item["packetId"] for item in duplicate["targets"]}, {"packet-b", "packet-c"})
        self.assertTrue(all(group["scope"] == "reviewed-candidates-only" for group in groups))
        self.assertNotIn("private@example.test", json.dumps(result["writerContext"]))
        self.assertEqual(receipt["rawSha256"], planning.digest(json.dumps(rows, ensure_ascii=False)))

    def test_hil_equal_time_conflicts_are_not_arbitrarily_dropped(self):
        result = planning.scope_hil([decision("a", choice="select"), decision("b", choice="hold")])
        self.assertCountEqual(result["receipt"]["includedDecisionIds"], ["a", "b"])
        self.assertEqual(len(result["writerContext"]["candidateFeedback"]), 2)
        with self.assertRaises(ValueError):
            planning.scope_hil([decision("a"), decision("a")])
        mixed = decision("mixed", comment="실운영 왕복 카나리: 정본 변경 없이 Storyyard→HQ→InkOS 영수증 경로만 검증. 그리고 이 후보의 첫 장면이 좋다.")
        self.assertEqual(planning.scope_hil([mixed])["receipt"]["operationalOnlyDecisionIds"], [])

    def test_shared_input_keeps_nine_sections_and_final_checklist(self):
        template = (ROOT / "docs/templates/webnovel-project-plan-v1.md").read_text()
        text = planning.build_input(template, "현대판타지", {"promptParts": ["SOURCE_DATA"]}, planning.scope_hil([]))
        self.assertIn("## 1. 작품 정보와 독자 약속", text)
        self.assertIn("## 9. 기획 의도와 집필 계획", text)
        self.assertIn("## 최종 읽기", text)
        self.assertIn("인명·세력명·능력·각성 시점과 사건 순서", text)
        self.assertNotIn("## 부록 A.", text)
        self.assertNotIn("## 부록 B.", text)
        self.assertIn("모든 작품에 강요하지 않습니다", text)
        self.assertNotIn("가문·회사·이전 생·시작 자본·회귀 시점과 정보 우위가", text)

    def test_source_receipt_distinguishes_raw_excerpt_and_derived_event_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            lab = Path(temporary)
            analysis = lab / "analyses/work-a"
            analysis.mkdir(parents=True)
            (analysis / "project_pitch.md").write_text("# 분석 피치\n전체 내용은 분석 근거이다.")
            bible = "# Bible\n## 인물\n인물 정보\n## 전체 사건 진행\n첫 거래가 다음 사건으로 이어진다.\n\n이후 다른 물건을 획득한다.\n## 다른 절\n제외 내용\n"
            (analysis / "project_bible.md").write_text(bible)
            source = lab / "private_sources/korean_webnovel_corpus"
            source.mkdir(parents=True)
            (source / "source.txt").write_text("원작 장면의 시작과 이후.")
            result = planning.load_source_materials(lab, [{"id": "work-a", "title": "작품", "source": "source.txt"}], excerpt_characters=4)
            receipt = result["sources"][0]
            self.assertEqual(receipt["excerptCharacters"], 4)
            self.assertEqual(receipt["excerptSha256"], planning.digest("원작 장"))
            detail = receipt["additionalAnalysis"]
            self.assertEqual(detail["fileSha256"], planning.digest(bible))
            selected_lines = bible.splitlines(keepends=True)[detail["startLine"] - 1:detail["endLine"]]
            self.assertEqual(detail["excerptSha256"], planning.digest("".join(selected_lines)))
            self.assertIn("해당 구간의 원문을 직접 읽었다는 뜻이 아니다", result["promptParts"][0])
            self.assertNotIn("제외 내용", result["promptParts"][0])

    def test_valid_complete_document_and_six_w_bullets(self):
        self.assertEqual(planning.format_body(plan())[1], [])
        bullets = "\n".join(f"- **{word}:** 인물이 자신의 결과를 위해 구체적으로 행동한다."
                             for word in planning.WORDS)
        self.assertEqual(planning.format_body(plan(bullets))[1], [])
        self.assertEqual(planning.format_body("```markdown\n" + plan() + "\n```")[1], [])
        paragraphs = "\n\n".join(f"{word} — {label}\n\n인물이 자신의 결과를 위해 구체적으로 행동한다."
                                   for word, label in zip(planning.WORDS, ("누가", "무엇을", "어떻게", "어디서", "언제", "왜")))
        self.assertEqual(planning.format_body(plan(paragraphs))[1], [])

    def test_empty_sections_six_w_tokens_and_template_placeholders_fail(self):
        empty = "\n".join(f"## {n}. 기획 항목\n" + ("WHO WHAT HOW WHERE WHEN WHY" if n == 2 else "")
                            for n in range(1, 10))
        issues = planning.format_body(empty)[1]
        self.assertIn("1절 본문 확인 필요", issues)
        self.assertIn("WHAT 답변 확인 필요", issues)
        self.assertIn("HOW 답변 확인 필요", issues)
        template = (ROOT / "docs/templates/webnovel-project-plan-v1.md").read_text().split("## 부록 A.")[0]
        self.assertTrue(any("자리표시자" in issue for issue in planning.format_body(template)[1]))
        empty_table = plan().replace("인물은 사건의 결과를 얻어 다음 행동을 선택한다.", "| 항목 | 기입 |\n| --- | --- |", 1)
        self.assertIn("1절 본문 확인 필요", planning.format_body(empty_table)[1])
        self.assertIn("HOW 확인 필요", planning.format_body(plan().replace("HOW", "REMOVED"))[1])
        empty_answer_cells = "\n".join(f"|{word}|구체화할 질문은 무엇인가?||" for word in planning.WORDS)
        issues = planning.format_body(plan(empty_answer_cells))[1]
        self.assertTrue(all(word + " 답변 확인 필요" in issues for word in planning.WORDS))

    def test_plain_numbered_legacy_remains_incomplete_but_six_w_is_read(self):
        body = plan().replace("## ", "")
        self.assertEqual(planning.format_body(body)[1], ["합의한 1~9절 확인 필요"])

    def test_titles_in_brackets_are_not_blank_placeholders(self):
        body = plan().replace("인물은 사건의 결과를 얻어 다음 행동을 선택한다.", "[오너 일가의 천재 기획자]", 1)
        self.assertEqual(planning.format_body(body)[1], [])


if __name__ == "__main__":
    unittest.main()
