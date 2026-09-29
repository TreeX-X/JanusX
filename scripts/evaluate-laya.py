"""Source-separated memory evaluation. A report never enables automatic acceptance.
Note: see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
"""
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
from datetime import datetime
from collections import Counter

QUESTIONS = ['retention', 'kind', 'support', 'duplicate', 'supersede', 'conflict']
KINDS = ['fact', 'preference', 'decision', 'procedure']


def validated_result(raw):
    """Count a prediction only if the complete output satisfies the host contract."""
    if isinstance(raw, dict) and raw.get('status') == 'unavailable':
        return {'status': 'unavailable', 'reason': raw.get('reason') if isinstance(raw.get('reason'), str) else 'scorer-unavailable'}
    if not isinstance(raw, dict) or raw.get('status') != 'ready':
        return {'status': 'unavailable', 'reason': 'scorer-unavailable'}
    answers = raw.get('answers')
    valid = isinstance(answers, list) and len(answers) == len(QUESTIONS)
    if valid:
        valid = all(isinstance(answer, dict) for answer in answers)
    if valid:
        valid = sorted(str(answer.get('question')) for answer in answers) == sorted(QUESTIONS)
    for answer in answers if valid else []:
        question = answer['question']
        options = KINDS if question == 'kind' else ['true', 'false']
        value, distribution = answer.get('answer'), answer.get('distribution')
        if (question == 'kind' and (type(value) is not str or value not in options)
                or question != 'kind' and type(value) is not bool
                or not isinstance(distribution, dict) or set(distribution) != set(options)):
            valid = False
            break
        values = [*distribution.values(), answer.get('answer_confidence')]
        if any(type(p) not in [int, float] or not math.isfinite(p) or not 0 <= p <= 1 for p in values):
            valid = False
            break
        selected = distribution[str(value).lower()]
        if (abs(sum(distribution.values()) - 1) > 1e-6
                or abs(selected - answer['answer_confidence']) > 1e-6
                or selected + 1e-6 < max(distribution.values())
                or question != 'kind' and (type(answer.get('noul')) not in [int, float]
                    or not math.isfinite(answer['noul']) or not 0 <= answer['noul'] <= 1
                    or abs(answer['noul'] - distribution['true']) > 1e-6)):
            valid = False
            break
    return raw if valid else {'status': 'unavailable', 'reason': 'invalid-output'}


def temperature_distribution(distribution, temperature):
    if type(temperature) not in [int, float] or not math.isfinite(temperature) or not .05 <= temperature <= 20:
        raise ValueError('Invalid calibration temperature')
    if not distribution or any(type(p) not in [int, float] or not math.isfinite(p) or not 0 <= p <= 1 for p in distribution.values()) or abs(sum(distribution.values()) - 1) > 1e-6:
        raise ValueError('Invalid calibration distribution')
    logits = {key: math.log(max(1e-12, p)) / temperature for key, p in distribution.items()}
    peak = max(logits.values())
    weights = {key: math.exp(value - peak) for key, value in logits.items()}
    total = sum(weights.values())
    return {key: value / total for key, value in weights.items()}


def fit_temperatures(results, min_count=20):
    if type(min_count) is not int or min_count < 1:
        raise ValueError('Calibration sample floor must be positive')
    selected = [row for row in results if row['split'] == 'calibration' and row['result'].get('status') == 'ready']
    temperatures = {}
    for i, question in enumerate(QUESTIONS):
        rows = [(answer['distribution'], str(row['labels'][i]).lower()) for row in selected
                for answer in row['result'].get('answers', []) if answer['question'] == question]
        if len(rows) < min_count:
            raise ValueError('Insufficient calibration samples for ' + question)
        def loss(temperature):
            return sum(-math.log(max(1e-12, temperature_distribution(distribution, temperature)[label])) for distribution, label in rows) / len(rows)
        # Deterministic bounded NLL search. Holdout labels never enter fitting.
        choices = [1.] + [math.exp(math.log(.05) + index * math.log(400) / 240) for index in range(241)]
        choices = [max(.05, min(20., value)) for value in choices]
        temperatures[question] = min(choices, key=loss)
    return temperatures


def calibrated_results(results, temperatures):
    calibrated = []
    for row in results:
        answers = []
        for answer in row['result'].get('answers', []):
            distribution = temperature_distribution(answer['distribution'], temperatures[answer['question']])
            answers.append({**answer, 'distribution': distribution, 'answer_confidence': distribution[str(answer['answer']).lower()],
                            **({'noul': distribution['true']} if answer['question'] != 'kind' else {})})
        calibrated.append({**row, 'result': {**row['result'], 'answers': answers}})
    return calibrated


def validate_dataset(dataset, kind='synthetic'):
    if not isinstance(dataset, list) or not dataset:
        raise ValueError('Dataset must be a nonempty list')
    ids, groups, inputs = set(), {}, {}
    for row in dataset:
        if not isinstance(row, dict):
            raise ValueError('Dataset rows must be objects')
        for field in ['id', 'source', 'language', 'content']:
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError('Missing or invalid dataset field: ' + field)
        if row['id'] in ids:
            raise ValueError('Duplicate sample ID')
        ids.add(row['id'])
        if row.get('split') not in ['calibration', 'holdout']:
            raise ValueError('Each sample needs a calibration or holdout split')
        for field in ['evidence', 'related']:
            if not isinstance(row.get(field), list) or not all(isinstance(value, str) and value.strip() for value in row[field]):
                raise ValueError('Invalid text array: ' + field)
        if not row['evidence']:
            raise ValueError('A sample requires evidence')
        labels = row.get('labels')
        if not isinstance(labels, list) or len(labels) != len(QUESTIONS):
            raise ValueError('Exactly six human labels are required')
        if labels[1] not in ['fact', 'preference', 'decision', 'procedure'] or any(type(labels[i]) is not bool for i in [0, 2, 3, 4, 5]):
            raise ValueError('Invalid task label type')
        if 'candidateKind' in row and row['candidateKind'] not in KINDS:
            raise ValueError('Invalid initial candidate kind')
        grouping = ['source:' + row['source'].strip()]
        if 'scenario' in row:
            if not isinstance(row['scenario'], str) or not row['scenario'].strip():
                raise ValueError('Invalid scenario ID')
            grouping.append('scenario:' + row['scenario'].strip())
        if kind == 'annotated':
            annotation = row.get('annotation', {})
            if not isinstance(annotation, dict) or annotation.get('origin') != 'redacted-real' or not annotation.get('reviewer'):
                raise ValueError('Annotated data requires redacted-real origin and human reviewer metadata')
            if not isinstance(row.get('scenario'), str) or not row['scenario'].strip():
                raise ValueError('Annotated data requires a shared scenario ID for translations and related events')
            reviewed = datetime.fromisoformat(annotation.get('reviewedAt', '').replace('Z', '+00:00'))
            if reviewed.tzinfo is None:
                raise ValueError('Human review timestamp must include a timezone')
        for group in grouping:
            if group in groups and groups[group] != row['split']:
                raise ValueError('Source or scenario leaks between calibration and holdout')
            groups[group] = row['split']
        key = json.dumps([row['content'].strip(), row['evidence'], row['related']], ensure_ascii=False)
        if key in inputs and inputs[key] != row['split']:
            raise ValueError('Identical model input leaks between calibration and holdout')
        inputs[key] = row['split']
    if {row['split'] for row in dataset} != {'calibration', 'holdout'}:
        raise ValueError('Both calibration and holdout samples are required')
    return {'kind': kind, 'samples': len(dataset), 'languages': sorted({row['language'] for row in dataset}),
            'sources': len({row['source'] for row in dataset})}


def quality_gate(groups, policy, coverage, dataset_kind):
    if dataset_kind != 'annotated':
        return {'status': 'not-evaluated', 'reason': 'synthetic-data'}
    if not policy:
        return {'status': 'not-evaluated', 'reason': 'no-pinned-quality-policy'}
    failures = []
    required = policy.get('tasks', {})
    expected = {key for key in groups if key.startswith('holdout/')}
    if not expected or set(required) != expected or not isinstance(policy.get('id'), str) or not policy['id'].strip():
        raise ValueError('Quality policy must name every language/task holdout group and have an ID')
    minimum_coverage = policy.get('minCoverage')
    if type(minimum_coverage) not in [int, float] or not math.isfinite(minimum_coverage) or not 0 < minimum_coverage <= 1:
        raise ValueError('Quality policy needs a positive coverage floor')
    if type(coverage) not in [int, float] or not math.isfinite(coverage) or not 0 <= coverage <= 1:
        raise ValueError('Invalid measured coverage')
    if coverage < minimum_coverage:
        failures.append('coverage')
    for key, limits in required.items():
        if not isinstance(limits, dict) or type(limits.get('minCount')) is not int or limits['minCount'] < 1:
            raise ValueError('Every task requires a positive sample floor')
        result = groups[key]
        # A healthy calibration split or another language cannot hide abstentions.
        if result.get('coverage', 0) < minimum_coverage:
            failures.append(key + '/coverage')
        class_floor = limits.get('minClassCount', 1)
        if type(class_floor) is not int or class_floor < 1:
            raise ValueError('Every task needs a positive class sample floor')
        classes = KINDS if key.endswith('/kind') else ['true', 'false']
        if any(result.get('classSupport', {}).get(label, 0) < class_floor for label in classes):
            failures.append(key + '/class-support')
        for name in ['minAccuracy', 'maxBrier', 'maxEce']:
            value = limits.get(name)
            if type(value) not in [int, float] or not math.isfinite(value) or value < 0 or value > (2 if name == 'maxBrier' else 1):
                raise ValueError('Invalid or missing task threshold: ' + name)
        if result['count'] < limits['minCount'] or result.get('accuracy', -1) < limits['minAccuracy'] or result.get('brier', 3) > limits['maxBrier'] or result.get('ece10', 2) > limits['maxEce']:
            failures.append(key)
        for limit, metric in [('minPositiveRecall', 'recallTrue'), ('minPositivePrecision', 'precisionTrue')]:
            if limit in limits:
                if type(limits[limit]) not in [int, float] or not 0 <= limits[limit] <= 1:
                    raise ValueError('Invalid positive-class threshold')
                if result.get(metric) is None or result[metric] < limits[limit]:
                    failures.append(key + '/' + metric)
    return {'status': 'failed' if failures else 'passed', 'policyId': policy['id'], 'failures': failures}


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
    confidence = [row["distribution"][str(row["answer"]).lower()] for row in rows]
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
    negatives = sum(row['label'] is False for row in rows)
    classes = list(rows[0]['distribution'])
    support = Counter(str(row['label']).lower() for row in rows)
    confusion = {label: {prediction: 0 for prediction in classes} for label in classes}
    for row in rows:
        confusion[str(row['label']).lower()][str(row['answer']).lower()] += 1
    by_class = {}
    for label in classes:
        hits = confusion[label][label]
        predicted = sum(confusion[actual][label] for actual in classes)
        by_class[label] = {'precision': hits / predicted if predicted else None,
                           'recall': hits / support[label] if support[label] else None,
                           'f1': 2 * hits / (predicted + support[label]) if predicted + support[label] else None}
    missing = [label for label in classes if not support[label]]
    accuracy = statistics.mean(correct)
    n, z = len(rows), 1.959963984540054
    center = (accuracy + z * z / (2 * n)) / (1 + z * z / n)
    radius = z * math.sqrt(accuracy * (1 - accuracy) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return {"count": len(rows), "accuracy": statistics.mean(correct), "brier": statistics.mean(brier), "ece10": ece,
            'classSupport': {label: support[label] for label in classes}, 'missingClasses': missing,
            'confusionMatrix': confusion, 'perClass': by_class,
            'balancedAccuracy': None if missing else statistics.mean(value['recall'] for value in by_class.values()),
            'macroF1': None if missing else statistics.mean(value['f1'] for value in by_class.values()),
            'majorityBaseline': max(support.values()) / n,
            'accuracyWilson95': [max(0, center - radius), min(1, center + radius)],
            "precisionTrue": tp / (tp + fp) if tp + fp else None, "recallTrue": tp / (tp + fn) if tp + fn else None,
            "falsePositiveRate": fp / negatives if negatives else None}


def summarize_results(results, languages):
    groups, failures = {}, []
    for split in ['calibration', 'holdout']:
        for language in languages:
            selected = [row for row in results if row['split'] == split and row['language'] == language]
            accepted = [row for row in selected if validated_result(row['result'])['status'] == 'ready']
            for i, question in enumerate(QUESTIONS):
                rows = [{**answer, 'label': row['labels'][i]} for row in accepted
                        for answer in row['result']['answers'] if answer['question'] == question]
                result = metrics(rows)
                result.update(attempted=len(selected), coverage=len(accepted) / len(selected) if selected else 0,
                              correctOverAttempted=sum(row['answer'] == row['label'] for row in rows) / len(selected) if selected else None)
                groups[f'{split}/{language}/{question}'] = result
    for row in results:
        result = validated_result(row['result'])
        if result['status'] != 'ready':
            failures.append({'id': row['id'], 'split': row['split'], 'language': row['language'], 'reason': result['reason']})
            continue
        for answer in result['answers']:
            label = row['labels'][QUESTIONS.index(answer['question'])]
            if answer['answer'] != label:
                failures.append({'id': row['id'], 'split': row['split'], 'language': row['language'],
                                 'question': answer['question'], 'expected': label, 'actual': answer['answer'],
                                 'confidence': answer['answer_confidence']})
    return groups, failures


def summarize_routing(results, languages):
    """Evaluate single-chunk refinement advice; all routes still require review."""
    groups = {}
    for split in ['calibration', 'holdout']:
        for language in languages:
            selected = [row for row in results if row['split'] == split and row['language'] == language]
            rows = [row for row in selected if row.get('candidateKind') in KINDS]
            counts = Counter()
            for row in rows:
                raw = validated_result(row['result'])
                if raw['status'] != 'ready':
                    counts['manualFallback'] += 1
                    continue
                counts['scored'] += 1
                expected = dict(zip(QUESTIONS, [True, row['candidateKind'], True, False, False, False]))
                answers = {answer['question']: answer for answer in raw['answers']}
                needs_refinement = any(label != expected[question] for question, label in zip(QUESTIONS, row['labels']))
                predicts_refinement = any(answer['answer_confidence'] < .9 or answer['answer'] != expected[question]
                                          for question, answer in answers.items())
                exact = all(answers[question]['answer'] == label for question, label in zip(QUESTIONS, row['labels']))
                counts['allSixCorrect'] += exact
                counts['needsRefinement'] += needs_refinement
                counts['needsNoRefinement'] += not needs_refinement
                counts['refine' if predicts_refinement else 'skipRefinement'] += 1
                counts['missedRefinement'] += needs_refinement and not predicts_refinement
                counts['unnecessaryRefinement'] += not needs_refinement and predicts_refinement
            values = {key: counts[key] for key in ['scored', 'manualFallback', 'refine', 'skipRefinement',
                      'needsRefinement', 'needsNoRefinement', 'missedRefinement', 'unnecessaryRefinement']}
            groups[f'{split}/{language}'] = {
                **values, 'attempted': len(rows), 'missingCandidateKind': len(selected) - len(rows),
                'allSixAccuracy': counts['allSixCorrect'] / counts['scored'] if counts['scored'] else None,
                'skipRefinementCoverage': counts['skipRefinement'] / len(rows) if rows else None,
                'missedRefinementRate': counts['missedRefinement'] / counts['needsRefinement'] if counts['needsRefinement'] else None,
                'unnecessaryRefinementRate': counts['unnecessaryRefinement'] / counts['needsNoRefinement'] if counts['needsNoRefinement'] else None,
            }
    return {'scope': 'Single complete evidence chunk; initial candidateKind supplied by dataset; confidence floor 0.9; all outputs require human review',
            'groups': groups}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--python')
    parser.add_argument('--model-dir')
    parser.add_argument('--output')
    parser.add_argument('--dataset', type=Path)
    parser.add_argument('--dataset-kind', choices=['synthetic', 'annotated'], default='synthetic')
    parser.add_argument('--policy', type=Path)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--calibration-output', type=Path, help='Fit on calibration split and export a version-bound artifact')
    parser.add_argument('--min-calibration-count', type=int, default=20)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    dataset_bytes = (args.dataset or root / 'tests/fixtures/laya-memory-eval.json').read_bytes()
    dataset = json.loads(dataset_bytes)
    dataset_info = validate_dataset(dataset, args.dataset_kind)
    policy_bytes = args.policy.read_bytes() if args.policy else None
    policy = json.loads(policy_bytes) if policy_bytes else None
    if args.validate_only:
        print(json.dumps(dataset_info, ensure_ascii=False))
        return
    if not args.python or not args.model_dir or not args.output:
        parser.error('--python, --model-dir and --output are required for inference')
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
            if policy and policy.get('modelRevision') != ready.get('revision'):
                raise ValueError('Quality policy model revision does not match the running checkpoint')
            if policy and policy.get('adapterSha256') != hashlib.sha256((root / 'resources/laya/sidecar.py').read_bytes()).hexdigest():
                raise ValueError('Quality policy adapter hash does not match the question templates')
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
                                "source": row['source'], "scenario": row.get('scenario'),
                                "candidateKind": row.get('candidateKind'),
                                "result": validated_result(response['result']), "wallMs": round((time.perf_counter() - started) * 1000)})
                peak_memory = max(peak_memory or 0, peak_memory_bytes(runtime_pid) or 0) or None
                print(row['id'], results[-1]['wallMs'], flush=True)
            temperatures = fit_temperatures(results, args.min_calibration_count) if args.calibration_output else None
            raw_results = results
            if temperatures:
                results = calibrated_results(results, temperatures)
            groups, failures = summarize_results(results, dataset_info['languages'])
            latencies = sorted(row['wallMs'] for row in results)
            report = {"datasetSha256": hashlib.sha256(dataset_bytes).hexdigest(), "platform": platform.platform(), "ready": ready,
                      "adapterSha256": hashlib.sha256((root / 'resources/laya/sidecar.py').read_bytes()).hexdigest(),
                      "requirementsSha256": hashlib.sha256((root / 'resources/laya/requirements.txt').read_bytes()).hexdigest(),
                      "peakWorkingSetBytes": peak_memory,
                      "calibrationId": None, "scope": "Per-question temperature fitted on calibration only" if temperatures else "No fitted temperature; human annotation metadata does not itself certify label quality",
                      "dataset": dataset_info, "policySha256": hashlib.sha256(policy_bytes).hexdigest() if policy_bytes else None,
                      "p50Ms": statistics.median(latencies), "p95Ms": latencies[math.ceil(len(latencies) * .95) - 1],
                      "coverage": sum(row['result']['status'] == 'ready' for row in results) / len(results),
                      "automaticAcceptanceEnabled": False, "automaticAcceptanceErrorRate": None,
                      'failures': failures, 'routing': summarize_routing(results, dataset_info['languages']),
                      'routingPolicySha256': hashlib.sha256((root / 'src/main/knowledge/decision-scorer.ts').read_bytes()).hexdigest(),
                      "groups": groups, "results": results}
            report['qualityGate'] = quality_gate(groups, policy, report['coverage'], args.dataset_kind)
            if temperatures:
                artifact = {'schema': 'laya-calibration/1', 'modelRevision': ready['revision'], 'templateVersion': 'memory-decision/1',
                            'adapterSha256': report['adapterSha256'], 'datasetSha256': report['datasetSha256'], 'datasetKind': args.dataset_kind,
                            'fittedOn': 'calibration', 'policySha256': report['policySha256'], 'qualityGate': report['qualityGate'],
                            'temperatures': temperatures, 'calibrationSampleIds': [row['id'] for row in raw_results if row['split'] == 'calibration' and row['result'].get('status') == 'ready']}
                artifact_bytes = (json.dumps(artifact, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')
                args.calibration_output.parent.mkdir(parents=True, exist_ok=True)
                args.calibration_output.write_bytes(artifact_bytes)
                report['calibrationId'] = hashlib.sha256(artifact_bytes).hexdigest()
                report['rawResults'] = raw_results
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            return 2 if report['qualityGate']['status'] == 'failed' else 0
        finally:
            child.stdin.close()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait()


if __name__ == '__main__': raise SystemExit(main())
