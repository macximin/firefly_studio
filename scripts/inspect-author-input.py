#!/usr/bin/env python3
"""Verify a saved author input and summarize it without printing manuscript or feedback text."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

HQ = Path(__file__).resolve().parents[1]
SHA = re.compile(r"^[a-f0-9]{64}$")


def digest(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def read_text(path, max_bytes=16 * 1024 * 1024):
    if not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError("Input file is missing or exceeds the inspection size limit")
    data = path.read_bytes()
    if len(data) > max_bytes:
        raise ValueError("Input file exceeds the inspection size limit")
    return data.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")


def bound_hash(receipt):
    bound = {key: value for key, value in receipt.items() if key not in ("createdAt", "inputBundleSha256")}
    return digest(json.dumps(bound, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def evidence_check(root, relative_path, expected, *, normalized=False):
    """Current availability is separate from integrity of the historical bundle."""
    if not isinstance(relative_path, str) or not isinstance(expected, str) or not SHA.fullmatch(expected):
        raise ValueError("Saved evidence binding is invalid")
    root = root.resolve()
    path = (root / relative_path).resolve()
    if Path(relative_path).is_absolute() or not path.is_relative_to(root):
        raise ValueError("Saved evidence path is outside its repository")
    result = {"path": relative_path, "expectedSha256": expected, "normalization": "utf8-universal-newlines" if normalized else "original-bytes"}
    if not path.exists():
        return {**result, "status": "unavailable"}
    if not path.is_file() or path.stat().st_size > 100 * 1024 * 1024:
        return {**result, "status": "unreadable"}
    try:
        if normalized:
            actual = digest(read_text(path, 100 * 1024 * 1024))
        else:
            hasher = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(chunk)
            actual = hasher.hexdigest()
    except (OSError, UnicodeError):
        return {**result, "status": "unreadable"}
    return {**result, "actualSha256": actual, "status": "matched" if actual == expected else "changed"}


def inspect_input(directory, *, check_sources=False, hq=HQ):
    directory = Path(directory).resolve()
    try:
        receipt = json.loads(read_text(directory / "input-receipt.json"))
        prompt = read_text(directory / "input.md")
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Saved input or receipt cannot be read as UTF-8 text/JSON") from error
    if not isinstance(receipt, dict) or receipt.get("schemaVersion") != "firefly-author-input/v1":
        raise ValueError("Unsupported saved author input receipt")
    if bound_hash(receipt) != receipt.get("inputBundleSha256"):
        raise ValueError("Saved receipt content does not match its bundle hash")
    if digest(prompt) != receipt.get("promptSha256"):
        raise ValueError("Saved prompt does not match its receipt")
    sources = receipt.get("sources", [])
    if not isinstance(sources, list) or any(not isinstance(source, dict) for source in sources):
        raise ValueError("Saved source list is invalid")
    craft = receipt.get("authorCraft") or {}
    scene_block = receipt.get("authorSceneExamples") or {}
    hil = receipt.get("hilScope", {})
    if any(not isinstance(value, dict) for value in (craft, scene_block, hil)):
        raise ValueError("Saved input metadata sections are invalid")
    scenes = scene_block.get("receipt", {})
    reviewed = hil.get("reviewedContext", {})
    if any(not isinstance(value, dict) for value in (craft.get("selection", {}), scenes, reviewed)):
        raise ValueError("Saved input selection metadata is invalid")
    for rows in (scenes.get("selected", []), reviewed.get("targets", [])):
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("Saved input metadata rows are invalid")
    current = []
    if check_sources:
        registry = json.loads(read_text(hq / "config/edge-repos.json"))
        reference = next((entry for entry in registry["repos"] if entry["name"] == "firefly_reference_lab"), None)
        if reference is None:
            raise ValueError("Reference Lab is not registered")
        lab = (hq / reference["path"]).resolve()
        for source in sources:
            if not isinstance(source.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", source["id"]):
                raise ValueError("Saved work ID is invalid")
            if not isinstance(source.get("source"), str):
                raise ValueError("Saved source path is invalid")
            source_path = str(Path("private_sources/korean_webnovel_corpus") / source["source"])
            current.append({"workId": source["id"], "kind": "original-prose", **evidence_check(lab, source_path,
                source.get("sourceBytesSha256", source.get("sourceSha256")), normalized="sourceBytesSha256" not in source)})
            current.append({"workId": source["id"], "kind": "derived-pitch", **evidence_check(lab,
                f"analyses/{source['id']}/project_pitch.md", source.get("analysisSha256"), normalized=True)})
            detail = source.get("additionalAnalysis")
            if detail:
                current.append({"workId": source["id"], "kind": "derived-analysis", **evidence_check(lab,
                    detail.get("path"), detail.get("fileSha256"), normalized=True)})
        current.append({"kind": "planning-template", **evidence_check(hq,
            "docs/templates/webnovel-project-plan-v1.md", receipt.get("templateFullSha256"), normalized=True)})
    return {
        "schemaVersion": "firefly-author-input-inspection/v1", "path": str(directory),
        "integrity": "verified", "inputBundleSha256": receipt["inputBundleSha256"],
        "promptSha256": receipt["promptSha256"], "promptCharacters": len(prompt),
        "date": receipt.get("date"), "genre": receipt.get("genre"),
        "works": [{"id": source.get("id"), "title": source.get("title"), "excerptCharacters": source.get("excerptCharacters")} for source in sources],
        "craft": {"packSha256": craft.get("selection", {}).get("packSha256"),
            "selectionMode": receipt.get("craftSelectionMode", "legacy-unspecified"),
            "caseIds": craft.get("selection", {}).get("selectedCaseIds", []),
            "omittedCaseIds": craft.get("selection", {}).get("omittedCaseIds", [])},
        "scenes": [{key: scene.get(key) for key in ("sceneId", "workId", "chapterNumberInBody", "selectionOrdinal", "characters")} for scene in scenes.get("selected", [])],
        "feedback": {"mode": receipt.get("feedbackMode"), "rawDecisionCount": hil.get("count", 0),
            "includedDecisionCount": len(hil.get("includedDecisionIds", [])),
            "loadedRepresentations": len(reviewed.get("loadedContextIds", [])),
            "representationCharacters": reviewed.get("characters", 0),
            "targetStatuses": dict(Counter(target.get("status", "unknown") for target in reviewed.get("targets", [])))},
        "currentEvidenceChecked": check_sources, "currentEvidence": current,
        "currentEvidenceAllMatched": all(item["status"] == "matched" for item in current) if check_sources else None,
        "modelCalls": 0, "externalWrites": 0, "humanReviewRequired": False,
        "meaning": "Checks saved input integrity and optional current source hashes; does not establish execution, canon, or literary quality.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--check-sources", action="store_true", help="Also compare currently available original and derived sources")
    options = parser.parse_args()
    try:
        result = inspect_input(options.directory, check_sources=options.check_sources)
    except (OSError, ValueError, KeyError, TypeError) as error:
        # Never forward a JSON parser fragment containing manuscript/feedback text.
        message = str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else "Saved input inspection failed"
        parser.exit(1, message + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["currentEvidenceAllMatched"] is False:
        parser.exit(2)


if __name__ == "__main__":
    main()
