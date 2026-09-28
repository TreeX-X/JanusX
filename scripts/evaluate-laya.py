"""Synthetic bilingual smoke evaluation, not a production calibration certificate."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import queue
import statistics
import subprocess
import threading
import time

QUESTIONS = ['retention', 'kind', 'support', 'duplicate', 'supersede', 'conflict']


def peak_memory_bytes(pid):
    if os.name != 'nt':
        return None
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in
                    ['peakWorkingSet', 'workingSet', 'peakPaged', 'paged', 'peakNonPaged', 'nonPaged', 'pagefile', 'peakPagefile']]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    query = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
    query.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    handle = kernel.OpenProcess(0x410, False, pid)
    if not handle: return None
    try:
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        return counters.peakWorkingSet if query(handle, ctypes.byref(counters), counters.cb) else None
    finally: kernel.CloseHandle(handle)


def metrics(rows):
    if not rows:
        return {"count": 0}
    confidence = [max(row["distribution"].values()) for row in rows]
    correct = [row["answer"] == row["label"] for row in rows]
    brier = [sum((p - (key == str(row["label"]).lower())) ** 2 for key, p in row["distribution"].items()) for row in rows]
    ece = 0
    for bucket in range(10):
        ids = [i for i, c in enumerate(confidence) if min(9, int(c * 10)) == bucket]
        if ids:
            ece += len(ids) / len(rows) * abs(statistics.mean(confidence[i] for i in ids) - statistics.mean(correct[i] for i in ids))
    tp = sum(row["answer"] is True and row["label"] is True for row in rows)
    fp = sum(row["answer"] is True and row["label"] is False for row in rows)
    fn = sum(row["answer"] is False and row["label"] is True for row in rows)
    return {"count": len(rows), "accuracy": statistics.mean(correct), "brier": statistics.mean(brier), "ece10": ece,
            "precisionTrue": tp / (tp + fp) if tp + fp else None, "recallTrue": tp / (tp + fn) if tp + fn else None}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--python', required=True)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    dataset_bytes = (root / 'tests/fixtures/laya-memory-eval.json').read_bytes()
    dataset = json.loads(dataset_bytes)
    calibration_sources = {row['source'] for row in dataset if row['split'] == 'calibration'}
    assert not calibration_sources.intersection(row['source'] for row in dataset if row['split'] == 'holdout')
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    with output.with_suffix('.stderr.log').open('w', encoding='utf-8') as errors:
        child = subprocess.Popen([args.python, '-u', str(root / 'resources/laya/sidecar.py'), '--model-dir', args.model_dir],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True, encoding='utf-8',
                                 env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        lines = queue.Queue()
        def reader():
            for line in child.stdout:
                lines.put(line)
        threading.Thread(target=reader, daemon=True).start()
        def receive(timeout):
            return json.loads(lines.get(timeout=timeout))
        try:
            ready = receive(180)
            if ready.get('status') != 'ready':
                raise RuntimeError(str(ready))
            results = []
            # Windows venv python.exe can be a redirector; measure the interpreter.
            runtime_pid = ready.pop('pid')
            peak_memory = peak_memory_bytes(runtime_pid)
            for row in dataset:
                request = {"id": row['id'], "input": {"content": row['content'], "evidence": [{"text": value} for value in row['evidence']],
                           "relatedFacts": [{"content": value} for value in row['related']], "truncated": False}}
                started = time.perf_counter()
                child.stdin.write(json.dumps(request, ensure_ascii=False) + '\n'); child.stdin.flush()
                response = receive(60)
                assert response['id'] == row['id']
                results.append({"id": row['id'], "split": row['split'], "language": row['language'], "labels": row['labels'],
                                "result": response['result'], "wallMs": round((time.perf_counter() - started) * 1000)})
                peak_memory = max(peak_memory or 0, peak_memory_bytes(runtime_pid) or 0) or None
                print(row['id'], results[-1]['wallMs'], flush=True)
            groups = {}
            for split in ['calibration', 'holdout']:
                for language in ['en', 'zh']:
                    selected = [row for row in results if row['split'] == split and row['language'] == language]
                    for i, question in enumerate(QUESTIONS):
                        rows = [{**answer, "label": row['labels'][i]} for row in selected for answer in row['result'].get('answers', []) if answer['question'] == question]
                        groups[f'{split}/{language}/{question}'] = metrics(rows)
            latencies = sorted(row['wallMs'] for row in results)
            report = {"datasetSha256": hashlib.sha256(dataset_bytes).hexdigest(), "platform": platform.platform(), "ready": ready,
                      "adapterSha256": hashlib.sha256((root / 'resources/laya/sidecar.py').read_bytes()).hexdigest(),
                      "requirementsSha256": hashlib.sha256((root / 'resources/laya/requirements.txt').read_bytes()).hexdigest(),
                      "peakWorkingSetBytes": peak_memory,
                      "calibrationId": None, "scope": "24 synthetic cases; no fitted temperature or production quality certification",
                      "p50Ms": statistics.median(latencies), "p95Ms": latencies[math.ceil(len(latencies) * .95) - 1],
                      "coverage": sum(row['result']['status'] == 'ready' for row in results) / len(results),
                      "automaticAcceptanceEnabled": False, "groups": groups, "results": results}
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        finally:
            child.stdin.close()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait()


if __name__ == '__main__': main()
