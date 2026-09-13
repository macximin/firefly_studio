#!/usr/bin/env python3
"""Prepare a complete local planning input without model calls or human waiting.

Outputs can contain licensed source excerpts and private historical feedback;
the default destination is the ignored .firefly/ directory.
"""
import argparse
import datetime as dt
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
from zoneinfo import ZoneInfo

HQ = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HQ / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


planning = load("planning_input_offline", "planning-input.py")
craft_input = load("craft_input_offline", "author-craft-input.py")
feedback_input = load("feedback_input_offline", "reviewed-feedback-input.py")


def save_input(destination, text, receipt):
    """Publish one immutable directory; never replace a partial or different run."""
    destination = Path(destination)
    expected = planning.digest(text)
    if destination.exists():
        try:
            previous = json.loads((destination / "input-receipt.json").read_text())
            bound_previous = {key: value for key, value in previous.items() if key not in ("createdAt", "inputBundleSha256")}
            previous_bundle = planning.digest(json.dumps(bound_previous, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
            same = (previous["promptSha256"] == expected
                    and previous_bundle == previous["inputBundleSha256"]
                    and previous["inputBundleSha256"] == receipt["inputBundleSha256"]
                    and planning.digest((destination / "input.md").read_text()) == expected)
        except (OSError, ValueError, KeyError):
            same = False
        if not same:
            raise ValueError("Existing input is partial or different; choose a new output directory")
        return {"path": str(destination), "created": False, "receipt": previous}
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".author-input-", dir=destination.parent))
    try:
        (staging / "input.md").write_text(text)
        (staging / "input-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        for file in staging.iterdir():
            file.chmod(0o600)
        # The directory appears only after both files have been written.
        try:
            staging.rename(destination)
        except OSError:
            if destination.exists():
                return save_input(destination, text, receipt)
            raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return {"path": str(destination), "created": True, "receipt": receipt}


def prepare(config, date, *, feedback=None, query=None, case_ids=None, destination=None, lab=None, template=None):
    dt.date.fromisoformat(date)
    history = [] if feedback is None else feedback
    if not isinstance(history, list):
        raise ValueError("Local feedback must be a list of historical decision records")
    scope = feedback_input.load_reviewed_feedback(planning.scope_hil(history))
    selected = planning.select_sources(config["sourcePool"], date)
    materials = planning.load_source_materials(lab or HQ / "edge_repos/firefly_reference_lab", selected)
    template = template if template is not None else (HQ / "docs/templates/webnovel-project-plan-v1.md").read_text()
    focus_problem = query
    query = query if query is not None else config["genre"] + " 기획: " + ", ".join(item["title"] for item in selected)
    craft_config = dict(config["authorCraft"]) if config.get("authorCraft") else None
    selection_mode = "disabled" if craft_config is None else "configured"
    if craft_config is not None and case_ids is not None:
        craft_config["caseIds"] = list(case_ids)
        selection_mode = "explicit"
    elif craft_config is not None and focus_problem is not None:
        # A deliberate problem query should search all eligible cases, rather
        # than only reorder the daily configuration's three default cases.
        craft_config.pop("caseIds", None)
        selection_mode = "query"
    craft = craft_input.select_craft(craft_config, query, work_ids=[source["id"] for source in selected])
    text = planning.build_input(template, config["genre"], materials, scope, craft)
    if focus_problem is not None and focus_problem.strip():
        text += "\n\n# 이번 기획의 집중 문제\n" + focus_problem.strip() + "\n"
    receipt = {
        "schemaVersion": "firefly-author-input/v1", "date": date,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "genre": config["genre"], "promptSha256": planning.digest(text),
        "templateFullSha256": planning.digest(template), "sources": materials["sources"],
        "feedbackMode": "none" if feedback is None else "local-history",
        "craftSelectionMode": selection_mode,
        "focusProblem": focus_problem,
        "humanReviewRequired": False, "modelCalls": 0, "externalWrites": 0,
        "hilScope": scope["receipt"],
        "authorCraft": None if craft is None else {"selection": craft["receipt"], "adapter": craft["adapter"]},
    }
    if craft and craft.get("sceneExamples"):
        receipt["authorSceneExamples"] = {key: value for key, value in craft["sceneExamples"].items() if key != "rendered"}
    bound = {key: value for key, value in receipt.items() if key != "createdAt"}
    receipt["inputBundleSha256"] = planning.digest(json.dumps(bound, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    destination = destination or HQ / ".firefly/author-inputs" / date / receipt["inputBundleSha256"]
    return save_input(destination, text, receipt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=dt.datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat())
    parser.add_argument("--query", help="Focus problem included in the input; searches all eligible craft cases")
    parser.add_argument("--case", action="append", dest="case_ids", help="Explicit craft case ID; repeat to select several, overriding query matching")
    parser.add_argument("--feedback-file", type=Path, help="Optional saved decision list; never requests new HIL")
    parser.add_argument("--output", type=Path, help="New local output directory; default .firefly/author-inputs")
    parser.add_argument("--no-craft", action="store_true", help="Prepare the same input without craft cases")
    options = parser.parse_args()
    config = json.loads((HQ / "config/daily-planning.json").read_text())
    if options.no_craft:
        config.pop("authorCraft", None)
    feedback = None
    if options.feedback_file:
        feedback = json.loads(options.feedback_file.read_text())
        if isinstance(feedback, dict):
            feedback = feedback.get("decisions")
        if not isinstance(feedback, list):
            parser.error("feedback file must contain a decision list or a decisions field")
    try:
        result = prepare(config, options.date, feedback=feedback, query=options.query, case_ids=options.case_ids, destination=options.output)
    except (OSError, ValueError, craft_input.subprocess.TimeoutExpired) as error:
        parser.exit(1, f"{error}\n")
    # Do not print source excerpts or private historical feedback to console.
    print(json.dumps({"path": result["path"], "created": result["created"], "promptSha256": result["receipt"]["promptSha256"], "authorCraft": result["receipt"]["authorCraft"], "authorSceneExamples": result["receipt"].get("authorSceneExamples"), "humanReviewRequired": False, "modelCalls": 0}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
