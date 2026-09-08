#!/usr/bin/env python3
"""Pinned Korean prose observations. Reads input; creates one immutable sidecar."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sys
from types import ModuleType


HQ = Path(__file__).resolve().parents[1]
POLICY = HQ / "config/prose-audit-policy.json"
ALLOWED_METRICS = {"lexical_diversity_ttr", "by_passive_count", "double_particle_count"}
REFERENCE_DIR = "skills/humanize-korean/references"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def _verified_file_contents(snapshot, upstream):
    contents = {}
    for relative, expected in upstream["files"].items():
        path = (snapshot / relative).resolve()
        if not path.is_relative_to(snapshot):
            raise ValueError("Upstream file escapes its snapshot")
        content = path.read_bytes()
        if sha(content) != expected["sha256"] or len(content) != expected["bytes"]:
            raise ValueError(f"Pinned upstream file hash mismatch: {relative}")
        contents[relative] = content
    return contents


def verify_vendor(policy, root=HQ, *, include_contents=False):
    if policy.get("mode") != "observe-only" or policy.get("automaticRewrite") is not False or policy.get("automaticQualityVerdict") is not False:
        raise ValueError("Only an observe-only policy is supported")
    if policy["baselinePolicy"].get("usedForScoring") is not False or policy["baselinePolicy"].get("unknownGenreFallbackAllowed") is not False:
        raise ValueError("Baseline scoring and genre fallback are not supported")
    if set(policy["metrics"]) - ALLOWED_METRICS:
        raise ValueError("Only approved descriptive functions may be called")
    upstream = policy["upstream"]
    snapshot = (Path(root) / upstream["snapshot"]).resolve()
    manifest_bytes = (snapshot / "manifest.json").read_bytes()
    if sha(manifest_bytes) != upstream["manifestSha256"]:
        raise ValueError("Pinned upstream manifest hash mismatch")
    manifest = json.loads(manifest_bytes)
    if any(manifest.get(key) != upstream[key] for key in ("repository", "commit", "license", "files")):
        raise ValueError("Pinned upstream identity mismatch")
    contents = _verified_file_contents(snapshot, upstream)
    if "MIT License" not in contents["LICENSE"].decode("utf-8"):
        raise ValueError("Pinned MIT notice is missing")
    taxonomy = contents[f"{REFERENCE_DIR}/ai-tell-taxonomy.md"].decode("utf-8")
    for rule in policy["rules"]:
        if rule.get("mode") != "observe-only":
            raise ValueError("Rules cannot authorize editing")
        if not re.search(r"^###\s+" + re.escape(rule["id"]) + r"\.", taxonomy, re.M):
            raise ValueError("Rule ID is not present in pinned taxonomy")
        re.compile(rule["pattern"])
    return (snapshot, contents) if include_contents else snapshot


def _load_metrics(snapshot, verified_contents):
    directory = snapshot / REFERENCE_DIR
    saved_path = list(sys.path)
    saved_bytecode = sys.dont_write_bytecode
    missing = object()
    saved_module = sys.modules.get("metrics", missing)
    try:
        sys.dont_write_bytecode = True
        first = ModuleType("metrics")
        first.__file__ = str(directory / "metrics.py")
        sys.modules["metrics"] = first
        # Compile exactly the verified source bytes. SourceFileLoader can read an
        # unpinned existing .pyc even when dont_write_bytecode is true.
        exec(compile(verified_contents[f"{REFERENCE_DIR}/metrics.py"], first.__file__, "exec"), first.__dict__)
        second = ModuleType("firefly_pinned_metrics_v2")
        second.__file__ = str(directory / "metrics_v2.py")
        exec(compile(verified_contents[f"{REFERENCE_DIR}/metrics_v2.py"], second.__file__, "exec"), second.__dict__)
        return second
    finally:
        sys.dont_write_bytecode = saved_bytecode
        sys.path[:] = saved_path
        if saved_module is missing:
            sys.modules.pop("metrics", None)
        else:
            sys.modules["metrics"] = saved_module


def protected_ranges(text, scope="planning"):
    """Conservative masks retain character offsets; never transform the input."""
    ranges = []
    def protect(start, end, kind):
        if end > start:
            ranges.append({"start": start, "end": end, "kind": kind})
    lines = []
    offset = 0
    for line in text.splitlines(keepends=True):
        lines.append((offset, line))
        offset += len(line)
    fence = None
    for start, line in lines:
        token = re.match(r"^\s*(`{3,}|~{3,})", line)
        if token:
            if fence is None:
                fence = (start, token[1][0], len(token[1]))
            elif token[1][0] == fence[1] and len(token[1]) >= fence[2]:
                protect(fence[0], start + len(line), "code-block")
                fence = None
    if fence:
        protect(fence[0], len(text), "code-block")
    for pattern, kind in [
        (r"<!--[\s\S]*?(?:-->|\Z)", "comment-or-receipt"),
        (r"(`+)[^`\n]+\1", "inline-code"),
        (r'"[^"\n]*"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』', "quote"),
        (r"(?<!\w)'[^'\n]+'(?!\w)", "quote"),
        (r"\[[^\]\n]+\]\([^\)\n]+\)", "reference-link"),
    ]:
        for match in re.finditer(pattern, text):
            protect(match.start(), match.end(), kind)
    front = re.match(r"\A---\s*\n[\s\S]*?\n---\s*(?:\n|$)", text)
    if front:
        protect(front.start(), front.end(), "structured-metadata")
    try:
        if isinstance(json.loads(text), (dict, list)):
            protect(0, len(text), "structured-data")
    except (ValueError, TypeError):
        pass
    headings = [(start, len(match[1]), match[2], len(line)) for start, line in lines
                if (match := re.match(r"^(#{1,6})\s+(.+)", line))]
    for n, (start, depth, title, length) in enumerate(headings):
        protect(start, start + length, "heading")
        is_reference = (scope == "planning" and re.match(r"8\.\s", title)) or re.search(
            r"HIL|영수증|실행 기록|검토 기록|사람 검토|참고 자료|참고작|참고 작품|원문|역설계 분석|receipt|source", title, re.I)
        if is_reference:
            end = next((pos for pos, level, _, _ in headings[n + 1:] if level <= depth), len(text))
            protect(start, end, "reference-hil-receipt-section")
    quoted = None
    for n, (start, line) in enumerate(lines):
        if line.lstrip().startswith(">"):
            if quoted is None:
                quoted = start
        elif quoted is not None and not line.strip():
            protect(quoted, start, "block-quote")
            quoted = None
        if re.search(r"(?<!\\)\|", line):
            protect(start, start + len(line), "table")
        if scope == "manuscript" and re.match(r"^\s*[-—]\s+", line):
            protect(start, start + len(line), "dialogue-line")
        if re.match(r"^\s*(?:\*\*)?(?:참고한 작품|참고 작품|참고작|참고 자료|출처|원문|HIL|영수증)[^\n:：]*[:：]", line, re.I):
            end = len(text)
            for after, following in lines[n + 1:]:
                if re.match(r"^\s*(?:#{1,6}\s|\*\*[^*]+\*\*)", following):
                    end = after
                    break
            protect(start, end, "reference-hil-receipt-field")
    if quoted is not None:
        protect(quoted, len(text), "block-quote")
    return sorted(ranges, key=lambda item: (item["start"], item["end"], item["kind"]))


def mask_text(text, ranges):
    masked = list(text)
    for region in ranges:
        for n in range(region["start"], region["end"]):
            if masked[n] not in "\r\n":
                masked[n] = " "
    return "".join(masked)


def analyze(text, policy, snapshot, scope="planning", *, verified_contents=None):
    if scope not in {"planning", "manuscript"}:
        raise ValueError("Unknown audit scope")
    ranges = protected_ranges(text, scope)
    visible = mask_text(text, ranges)
    findings = []
    for rule in policy["rules"]:
        for match in re.finditer(rule["pattern"], visible):
            # Whitespace masks must not join phrases across protected text.
            if any(match.start() < item["end"] and match.end() > item["start"] for item in ranges):
                continue
            findings.append({"ruleId": rule["id"], "mode": "observe-only",
                             "start": match.start(), "end": match.end(),
                             "line": text.count("\n", 0, match.start()) + 1,
                             "surface": text[match.start():match.end()], "note": rule["note"]})
    findings.sort(key=lambda item: (item["start"], item["ruleId"]))
    if verified_contents is None:
        verified_contents = _verified_file_contents(snapshot, policy["upstream"])
    metrics = _load_metrics(snapshot, verified_contents)
    stats = {name: getattr(metrics, name)(visible) for name in policy["metrics"]}
    baseline = json.loads(verified_contents[f"{REFERENCE_DIR}/baseline_v2.json"])
    return {"scope": scope, "mode": "observe-only", "findings": findings,
            "descriptiveStatistics": stats, "protectedRanges": ranges,
            "analyzedNonWhitespaceCharacters": len(re.sub(r"\s", "", visible)),
            "baseline": {"used": False, "fallbackUsed": False,
                         "upstreamCalibrationDue": bool(baseline.get("calibration_due")),
                         "warning": "Upstream v2 baseline declares placeholder calibration. Statistics are not a quality or AI-authorship score."},
            "interpretation": "후보 위치와 기술통계만 기록. 짧은 문장·의도된 반복·자기 이득·보상·고유 표면의 품질을 판정하거나 수정하지 않음."}


def audit_file(input_path, output_path, policy_path=POLICY, scope="planning", root=HQ):
    input_path, output_path = Path(input_path).resolve(), Path(output_path).resolve()
    if input_path == output_path or output_path.exists():
        raise ValueError("Output must be a new sidecar, separate from the input")
    if input_path.suffix.lower() not in {".md", ".txt"}:
        raise ValueError("Only Markdown or plain-text candidates are audit inputs")
    policy_bytes = Path(policy_path).read_bytes()
    adapter_path = Path(__file__).resolve()
    adapter_bytes = adapter_path.read_bytes()
    policy = json.loads(policy_bytes)
    snapshot, verified_contents = verify_vendor(policy, root, include_contents=True)
    original = input_path.read_bytes()
    text = original.decode("utf-8")
    result = analyze(text, policy, snapshot, scope, verified_contents=verified_contents)
    result.update(schemaVersion="firefly-prose-observation/v1",
                  createdAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                  input={"path": str(input_path), "sha256": sha(original), "bytes": len(original),
                         "characters": len(text), "offsetUnit": "Unicode code points; end exclusive"},
                  policySha256=sha(policy_bytes),
                  adapter={"path": str(adapter_path), "sha256": sha(adapter_bytes), "bytes": len(adapter_bytes)},
                  upstream={"repository": policy["upstream"]["repository"], "commit": policy["upstream"]["commit"],
                            "manifestSha256": policy["upstream"]["manifestSha256"], "license": "MIT"},
                  writes={"inputModified": False, "sidecarOnly": True, "modelCalls": 0})
    if input_path.read_bytes() != original:
        raise ValueError("Input changed during audit; no sidecar was created")
    if adapter_path.read_bytes() != adapter_bytes:
        raise ValueError("Adapter changed during audit; no sidecar was created")
    with output_path.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--scope", choices=["planning", "manuscript"], default="planning")
    parser.add_argument("--policy", default=str(POLICY))
    parser.add_argument("--verify-vendor", action="store_true")
    args = parser.parse_args()
    try:
        if args.verify_vendor:
            policy = json.loads(Path(args.policy).read_text())
            snapshot = verify_vendor(policy)
            print(json.dumps({"status": "verified", "snapshot": str(snapshot), "commit": policy["upstream"]["commit"]}))
            return
        if not args.input or not args.output:
            parser.error("--input and --output are required for an audit")
        result = audit_file(args.input, args.output, args.policy, args.scope)
        print(json.dumps({"status": "observation-written", "findings": len(result["findings"]),
                          "output": str(Path(args.output).resolve()), "inputModified": False, "modelCalls": 0}))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"prose-audit: {error}\n")


if __name__ == "__main__":
    main()
