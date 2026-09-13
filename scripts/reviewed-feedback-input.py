"""Load existing reviewed candidates from local immutable packets, never new HIL."""
import importlib.util
import json
from pathlib import Path
import subprocess

HQ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("feedback_planning_input", HQ / "scripts/planning-input.py")
planning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planning)


def load_reviewed_feedback(scope, *, max_candidates=3, max_characters=20000, node="node", timeout=30):
    targets = [target for group in scope["writerContext"]["candidateFeedback"] for target in group["targets"]]
    if not targets:
        return scope
    targets.sort(key=lambda target: (planning._timestamp(target), target["decisionId"]), reverse=True)
    request = {"targets": targets, "maxCandidates": max_candidates, "maxCharacters": max_characters}
    try:
        process = subprocess.run([node, str(HQ / "scripts/reviewed-feedback-input.mjs")],
                                 input=json.dumps(request, ensure_ascii=False), text=True,
                                 capture_output=True, timeout=timeout, check=False, cwd=HQ)
        if process.returncode:
            raise ValueError(process.stderr.strip()[:240])
        hydration = json.loads(process.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        # History is optional. Preserve every target and record unavailable context.
        hydration = {"contexts": [], "characters": 0, "targets": [
            {"decisionId": target["decisionId"], "packetId": target["packetId"],
             "candidateId": target.get("candidateId"), "status": "context-loader-unavailable",
             "reason": str(error)[:240]} for target in targets]}
    return planning.attach_reviewed_feedback(scope, hydration)
