"""Pinned local Laya adapter. No HTTP listener and no network access during scoring.
Note: see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
"""
import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
import shutil
import tempfile
import time
import urllib.request

QUESTIONS = {
    "retention": {"type": "noul", "instructions": "Is the candidate useful durable knowledge rather than temporary chatter?"},
    "kind": {"type": "choice", "instructions": "Which category describes the candidate?", "criteria": {
        "fact": "A factual statement", "decision": "A chosen approach with rationale",
        "preference": "A person's preference or habit", "procedure": "Instructions for performing a task"}},
    "support": {"type": "noul", "instructions": "Does the evidence directly support the candidate, including its subject and any negation?"},
    "duplicate": {"type": "noul", "instructions": "Does an existing fact express the same claim as the candidate? If there are no existing facts, answer false."},
    "supersede": {"type": "noul", "instructions": "Does the evidence explicitly say that the candidate replaces an existing fact? If none, answer false."},
    "conflict": {"type": "noul", "instructions": "Does the candidate contradict an existing fact about the same subject? If none, answer false."},
}


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(root, manifest):
    for name, spec in manifest["files"].items():
        path = root / name
        if not path.is_file() or path.stat().st_size != spec["size"] or digest(path) != spec["sha256"]:
            raise ValueError("artifact-verification-failed")


@contextlib.contextmanager
def runtime_checkpoint(root, manifest):
    # SDK 0.3.21 rewrites tokenizer_config.json. Keep downloaded artifacts immutable.
    # The same volume permits hard links for the large, read-only tensor/tokenizer files.
    with tempfile.TemporaryDirectory(prefix=".runtime-", dir=root, ignore_cleanup_errors=True) as directory:
        runtime = Path(directory)
        for name in manifest["files"]:
            target = runtime / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if name.endswith("tokenizer_config.json"):
                shutil.copyfile(root / name, target)
            else:
                try: os.link(root / name, target)
                except OSError: shutil.copyfile(root / name, target)
        yield runtime


def prepare(root, manifest):
    for name, spec in manifest["files"].items():
        path = root / name
        if path.is_file() and path.stat().st_size == spec["size"] and digest(path) == spec["sha256"]:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(path.suffix + ".part")
        url = "https://huggingface.co/{}/resolve/{}/{}".format(manifest["model"], manifest["revision"], name)
        with urllib.request.urlopen(url, timeout=60) as response, part.open("wb") as output:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > spec["size"]:
                    raise ValueError("download-size-mismatch")
                output.write(chunk)
        if part.stat().st_size != spec["size"] or digest(part) != spec["sha256"]:
            raise ValueError("download-integrity-mismatch")
        os.replace(part, path)
    verify(root, manifest)


def normalize_answers(raw):
    if set(raw) != set(QUESTIONS):
        raise ValueError("question-mismatch")
    out = []
    for question, result in raw.items():
        confidence = result["answer_confidence"]
        if not isinstance(confidence, (float, int)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise ValueError("invalid-confidence")
        if question == "kind":
            probabilities = result["probabilities"]
            if set(probabilities) != set(QUESTIONS["kind"]["criteria"]):
                raise ValueError("option-mismatch")
            answer = result["choice"]
        else:
            p = result["noul"]
            probabilities = {"true": p, "false": 1 - p}
            answer = p >= 0.5
        values = list(probabilities.values())
        if any(not isinstance(p, (float, int)) or not math.isfinite(p) or not 0 <= p <= 1 for p in values):
            raise ValueError("invalid-probability")
        key = str(answer).lower() if isinstance(answer, bool) else answer
        total = sum(values)
        # SDK reports four decimal places. Validate rounding before normalization.
        if abs(total - 1) > 0.0003 or abs(probabilities[key] - confidence) > 0.0002 or probabilities[key] < max(values):
            raise ValueError("invalid-distribution")
        distribution = {k: p / total for k, p in probabilities.items()}
        out.append({"question": question, "answer": answer, "distribution": distribution,
                    "answer_confidence": distribution[key], **({"noul": distribution["true"]} if question != "kind" else {})})
    return out


def score(agent, data):
    from laya.common import build_sequence
    state = json.dumps({"candidate": data["content"], "evidence": [item["text"] for item in data["evidence"]],
                        "existing_facts": [item["content"] for item in data["relatedFacts"]]}, ensure_ascii=False)
    if len(state) > 60000 or data.get("truncated"):
        return {"status": "unavailable", "reason": "incomplete-context"}
    for definition in QUESTIONS.values():
        seq, markers, stats = build_sequence(agent.tok, state, agent._to_internal(definition), 1000000, 256, return_stats=True)
        if len(seq) > 1024 or stats["options_distinct"] != stats["options"] or len(markers) != stats["options"]:
            return {"status": "unavailable", "reason": "token-budget-exceeded"}
    result = agent.predict(state, QUESTIONS, max_len=1024, head_max_len=256)
    if result.get("usage", {}).get("options"):
        return {"status": "unavailable", "reason": "collapsed-options"}
    return {"status": "ready", "answers": normalize_answers(result["answers"])}


def emit(value):
    print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args()
    root = Path(args.model_dir).resolve()
    manifest = json.loads(Path(__file__).with_name("model-manifest.json").read_text(encoding="utf-8"))
    if args.prepare:
        prepare(root, manifest)
        emit({"protocol": 1, "status": "installed", "revision": manifest["revision"]})
        return
    started = time.perf_counter()
    verify(root, manifest)
    with runtime_checkpoint(root, manifest) as checkpoint:
        serve(checkpoint, manifest, started)


def serve(root, manifest, started):
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", TOKENIZERS_PARALLELISM="false")
    with contextlib.redirect_stdout(sys.stderr):
        if importlib.metadata.version("laya") != manifest["sdk"]:
            raise ValueError("sdk-version-mismatch")
        import torch
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        from laya import Agent
        agent = Agent(str(root), device="cpu", expected_sha256={k: v["sha256"] for k, v in manifest["files"].items()})
        warm = score(agent, {"content": "The project uses TypeScript.", "evidence": [{"text": "The project uses TypeScript."}], "relatedFacts": []})
        if warm["status"] != "ready":
            raise ValueError("warmup-failed")
    emit({"protocol": 1, "status": "ready", "revision": manifest["revision"], "sdk": manifest["sdk"], "pid": os.getpid(), "warmupMs": round((time.perf_counter() - started) * 1000)})
    while line := sys.stdin.buffer.readline(262145):
        if len(line) > 262144 or not line.endswith(b"\n"):
            raise ValueError("request-limit")
        request = json.loads(line)
        started = time.perf_counter()
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = score(agent, request["input"])
        except Exception:
            result = {"status": "unavailable", "reason": "inference-failed"}
        emit({"id": request["id"], "result": result, "elapsedMs": round((time.perf_counter() - started) * 1000)})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No candidate text, paths, environment values or exception messages on stdout.
        emit({"protocol": 1, "status": "unavailable", "reason": type(error).__name__})
        sys.exit(1)
