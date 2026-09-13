"""Read-only, local adapter to the one InkOS craft selector; no model or HIL wait."""
import hashlib
import json
from pathlib import Path
import subprocess

HQ = Path(__file__).resolve().parents[1]


def select_craft(config, query, stage="planning", *, work_ids=None, node="node", timeout=30):
    if config is None:
        return None
    request = {**config, "query": query, "stage": stage}
    if work_ids is not None:
        request["workIds"] = work_ids
    run = subprocess.run(
        [node, str(HQ / "scripts/author-craft-input.mjs")],
        input=json.dumps(request, ensure_ascii=False), text=True,
        capture_output=True, timeout=timeout, check=False, cwd=HQ)
    if run.returncode:
        raise ValueError("Author craft selection failed: " + run.stderr.strip()[:1200])
    selected = json.loads(run.stdout)
    rendered = selected["rendered"]
    if selected["receipt"]["renderedSha256"] != hashlib.sha256(rendered.encode()).hexdigest():
        raise ValueError("Author craft selection receipt does not match rendered input")
    scenes = selected.get("sceneExamples")
    if scenes and scenes["receipt"]["renderedSha256"] != hashlib.sha256(scenes["rendered"].encode()).hexdigest():
        raise ValueError("Author scene selection receipt does not match rendered input")
    return selected
