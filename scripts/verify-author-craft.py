#!/usr/bin/env python3
"""Build and verify author-craft integrations locally; never starts a production model or requests HIL."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

HQ = Path(__file__).resolve().parents[1]


def registered_root(registry, name):
    entry = next((item for item in registry["repos"] if item["name"] == name), None)
    if entry is None:
        raise ValueError(f"Required child is not registered: {name}")
    return (HQ / entry["path"]).resolve()


def changed_files(root, prefixes=None):
    names = subprocess.check_output(["git", "ls-files", "--modified", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
    return [{"path": name, "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest()}
            for name in sorted(set(names)) if name and (root / name).is_file()
            and (prefixes is None or any(name.startswith(prefix) for prefix in prefixes))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full", action="store_true", help="Run all InkOS core and CLI tests instead of the affected integration suites")
    parser.add_argument("--include-private-scenes", action="store_true", help="Also verify the six locally owned source excerpts")
    parser.add_argument("--include-reuse-fixtures", action="store_true", help="Execute pinned external writing-system functions from the existing private research cache with mocked models")
    parser.add_argument("--output", type=Path, help="New directory for logs and the validation receipt")
    args = parser.parse_args()
    if shutil.which("pnpm") is None or shutil.which("node") is None:
        parser.exit(1, "pnpm and Node.js are required; use the configured workspace runtime.\n")
    registry = json.loads((HQ / "config/edge-repos.json").read_text())
    try:
        inkos = registered_root(registry, "inkos")
        reference = registered_root(registry, "firefly_reference_lab")
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = (args.output or HQ / ".firefly/validation/author-craft" / stamp).resolve()
    try:
        output.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        parser.exit(1, "Validation output already exists; choose a new directory.\n")
    def input_files():
        return {"inkos": changed_files(inkos), "reference": changed_files(reference),
                "hq": changed_files(HQ, ("scripts/", "tests/", "config/"))}

    before = input_files()
    receipt = {"schemaVersion": "firefly-author-craft-verification/v1", "startedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
               "scope": "full" if args.full else "affected-integrations", "privateScenesRequested": args.include_private_scenes, "reuseFixturesRequested": args.include_reuse_fixtures,
               "steps": [], "status": "running", "modelCallsStartedByVerifier": 0, "humanReviewRequired": False,
               "literaryQualityClaimed": False, "changedFilesBefore": before}

    def save():
        (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")

    def step(name, command, cwd=HQ, timeout=240, report=None):
        started = time.monotonic()
        log_path = output / f"{name}.log"
        with log_path.open("wb") as log:
            try:
                result = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
                code = result.returncode
            except subprocess.TimeoutExpired:
                code = 124
                log.write(b"\nVerification command exceeded its time limit.\n")
            except OSError:
                code = 126
                log.write(b"\nVerification command could not be started.\n")
        record = {"name": name, "command": command, "cwd": str(cwd), "exitCode": code,
                  "seconds": round(time.monotonic() - started, 3), "log": log_path.name,
                  "logSha256": hashlib.sha256(log_path.read_bytes()).hexdigest()}
        if report and report.exists():
            data = json.loads(report.read_text())
            record["tests"] = {"files": len(data.get("testResults", [])), "total": data.get("numTotalTests"),
                               "passed": data.get("numPassedTests"), "failed": data.get("numFailedTests"), "success": data.get("success")}
            record["testReport"] = report.name
            record["testReportSha256"] = hashlib.sha256(report.read_bytes()).hexdigest()
        receipt["steps"].append(record)
        save()
        print(f"{name}: {'passed' if code == 0 else 'failed'} ({record['seconds']}s)", flush=True)
        return code == 0

    built = step("build", ["pnpm", "--filter", "@actalk/inkos", "build"], inkos)
    if built:
        core_tests = [] if args.full else ["author-craft", "pov-filter", "entity-observations", "entity-observations-integration",
            "memory-retrieval", "material-retrieval", "writing-methodology", "ai-tells", "text-token-estimate", "agent-max-tokens-policy", "production-kernel-phase3",
            "creative-brief", "creative-brief-integration", "book-advisory-files", "scene-decision", "draft-discovery", "draft-discovery-runtime", "runner-draft-discovery",
            "narrative-evidence", "narrative-evidence-integration", "revision-experience", "revision-experience-integration",
            "source-first-handoff", "planner", "writer", "reviser", "composer", "narrative-control", "story-rail-tools", "chapter-review-cycle", "chapter-persistence"]
        for package, tests in [("core", core_tests), ("cli", [] if args.full else ["craft-command-e2e", "pitch-command"])]:
            for test in tests:
                if not (inkos / "packages" / package / "src/__tests__" / f"{test}.test.ts").is_file():
                    parser.exit(1, f"Requested validation test does not exist: {package}/{test}\n")
            report = output / f"{package}-tests.json"
            package_name = "@actalk/inkos-core" if package == "core" else "@actalk/inkos"
            command = ["pnpm", "--filter", package_name, "exec", "vitest", "run"]
            command.extend(f"src/__tests__/{test}.test.ts" for test in tests)
            command.extend(["--reporter=json", f"--outputFile={report}"])
            step(f"{package}-tests", command, inkos, timeout=600, report=report)
        for name in ["author-craft-input", "planning-input", "reviewed-feedback-input", "daily-planning", "inspect-author-input"]:
            step(f"hq-{name}", [sys.executable, f"tests/{name}.test.py"])
        step("hq-reviewed-feedback-js", ["node", "--test", "tests/reviewed-feedback-input.test.mjs"])
        step("hq-writing-system-candidates", ["node", "--test", "tests/writing-system-candidates.test.mjs"])
        if args.include_reuse_fixtures:
            step("writing-system-reuse", [sys.executable, "scripts/writing-system-reuse-fixture.py", "--output", str(output / "writing-system-reuse.json")])
        step("reference-scenes", ["node", "--test", "tests/author-craft-scenes.test.mjs"], reference)
        assets = ["node", "scripts/validate-author-craft-assets.mjs", "--output", str(output / "assets.json")]
        if args.include_private_scenes:
            assets.append("--include-private-scenes")
        step("assets", assets)
        step("retrieval-probes", ["node", "scripts/probe-author-craft-retrieval.mjs", "--require-matches", "--output", str(output / "retrieval-probes.json")])
    receipt["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    receipt["changedFilesAfter"] = input_files()
    receipt["sourceFilesUnchangedDuringVerification"] = before == receipt["changedFilesAfter"]
    receipt["status"] = "passed" if built and receipt["sourceFilesUnchangedDuringVerification"] and all(item["exitCode"] == 0 for item in receipt["steps"]) else "failed"
    receipt["meaning"] = "Local input, contract and state regression checks. No production chapter, publication, or reader quality approval is produced."
    save()
    print(json.dumps({"status": receipt["status"], "receipt": str(output / "receipt.json"), "steps": len(receipt["steps"]), "humanReviewRequired": False}, ensure_ascii=False), flush=True)
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
