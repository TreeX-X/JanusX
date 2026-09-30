"""Offline, synthetic policy experiment; never writes application knowledge/settings.
Note: see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
"""
import argparse
from collections import Counter
import contextlib
import importlib.metadata
import importlib.util
import json
import math
import os
from pathlib import Path
import platform
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sidecar', ROOT / 'resources/laya/sidecar.py')
sidecar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sidecar)
THRESHOLD = .9  # Fixed before inference; exploratory, not a production threshold.
WRITES = {'add', 'merge', 'replace'}
RELATIONS = ['none', 'unrelated', 'duplicate', 'update', 'conflict']
FOCUSED_EN = {
    'support': {'type': 'noul', 'instructions': 'Does the evidence establish the entire candidate as a confirmed statement? Preserve who, project, environment, time, negation and conditions. A suggestion, someone else\'s preference, or unresolved conflicting records do not establish it.'},
    'retention': {'type': 'noul', 'instructions': 'Would the candidate, if supported, be reusable long-term knowledge, such as a configuration, decision, preference or operating rule? A transient progress/status message is not durable knowledge.'},
    'relation': {'type': 'choice', 'instructions': 'Compare candidate with existing_facts using the evidence. Select the relationship. An explicit replacement is update even though the values differ.', 'criteria': {
        'none': 'There are no existing facts.', 'unrelated': 'Different subjects, environments or independent claims; both can hold.',
        'duplicate': 'Same claim and conditions; no change.', 'update': 'Evidence explicitly establishes that the new claim replaces an old claim about the same subject.',
        'conflict': 'Incompatible claims about the same subject and conditions, without an established replacement.'}},
}
FOCUSED_ZH = {
    'support': {'type': 'noul', 'instructions': '证据是否足以确认候选的完整陈述？必须核对主体、项目、环境、时间、否定和适用条件。尚未采纳的建议、别人的偏好、未解决的相互矛盾记录不能确认该候选。'},
    'retention': {'type': 'noul', 'instructions': '假设有证据支持，候选是否属于可长期复用的知识，例如配置、决策、个人偏好或操作规则？短暂的进度和运行状态不属于长期知识。'},
    'relation': {'type': 'choice', 'instructions': '根据证据比较候选与已有知识，选择关系。明确的新旧替代应选择 update，即使新旧值不同。', 'criteria': {
        'none': '没有已有知识。', 'unrelated': '主体、环境不同或描述独立事项，两者可以同时成立。',
        'duplicate': '相同条件下表达同一结论，没有变更。', 'update': '证据明确确认候选替代同一主体的旧结论。',
        'conflict': '同一主体和条件下结论不兼容，而且没有确立新旧替代关系。'}},
}
VARIANTS = {'current-six': sidecar.QUESTIONS, 'focused-en': FOCUSED_EN, 'focused-zh': FOCUSED_ZH}


def validate_dataset(data):
    if data.get('origin') != 'assistant-authored-synthetic' or not data.get('cases'):
        raise ValueError('Expected explicitly synthetic cases')
    ids = set()
    for row in data['cases']:
        if row['id'] in ids or not row['content'] or not row['evidence']:
            raise ValueError('Duplicate identity or missing evidence')
        ids.add(row['id'])
        for values in [row['evidence'], row['related']]:
            if not isinstance(values, list) or not all(isinstance(v, str) and v.strip() for v in values):
                raise ValueError('Invalid context')
        gold = row['gold']
        if type(gold['support']) is not bool or type(gold['retention']) is not bool or gold['relation'] not in RELATIONS:
            raise ValueError('Invalid gold judgment')
        if (gold['relation'] == 'none') != (not row['related']):
            raise ValueError('Inconsistent empty context label')
        answers = {k: {'value': v, 'confidence': 1.0} for k, v in gold.items() if k != 'action'}
        if decide(answers, bool(row['related'])) != gold['action']:
            raise ValueError('Gold action disagrees with declared policy: ' + row['id'])


def decide(answers, has_related, host_valid=True):
    """Sandbox policy only. Conflict defers; kind does not block admission."""
    if not host_valid or not answers:
        return 'defer'
    needed = ['support', 'retention'] + (['relation'] if has_related else [])
    if any(k not in answers or not math.isfinite(answers[k]['confidence']) or answers[k]['confidence'] < THRESHOLD for k in needed):
        return 'defer'
    relation = answers['relation']['value'] if has_related else 'none'
    if has_related and relation == 'none':
        return 'defer'  # The host knows old entries exist; reject contradictory model context.
    if relation == 'conflict':
        return 'defer'
    if not answers['support']['value'] or not answers['retention']['value']:
        return 'reject'
    return {'none': 'add', 'unrelated': 'add', 'duplicate': 'merge', 'update': 'replace'}.get(relation, 'defer')


def normalize(raw, definitions):
    """Validate SDK's rounded outputs before using selected-answer confidence."""
    if set(raw) != set(definitions):
        raise ValueError('Incomplete answers')
    result = {}
    for key, definition in definitions.items():
        entry = raw[key]
        confidence = entry['answer_confidence']
        if definition['type'] == 'noul':
            p = entry['noul']
            distribution = {'true': p, 'false': 1 - p}
            value = p >= .5
            selected = str(value).lower()
        else:
            distribution = entry['probabilities']
            if set(distribution) != set(definition['criteria']):
                raise ValueError('Wrong option set')
            value = selected = entry['choice']
        if any(type(p) not in (float, int) or not math.isfinite(p) or not 0 <= p <= 1 for p in [confidence, *distribution.values()]):
            raise ValueError('Invalid probability')
        if abs(sum(distribution.values()) - 1) > .0003 or abs(distribution[selected] - confidence) > .0002 or distribution[selected] < max(distribution.values()):
            raise ValueError('Inconsistent selection')
        total = sum(distribution.values())
        result[key] = {'value': value, 'confidence': distribution[selected] / total,
                       'distribution': {k: p / total for k, p in distribution.items()}}
    return result


def policy_answers(answers, variant, has_related):
    if variant != 'current-six' or not answers:
        return answers
    converted = {key: answers[key] for key in ['support', 'retention']}
    if has_related:
        # Current six questions have no mutually exclusive relation answer.
        relation = ('update' if answers['supersede']['value'] else
                    'conflict' if answers['conflict']['value'] else
                    'duplicate' if answers['duplicate']['value'] else 'unrelated')
        converted['relation'] = {'value': relation, 'confidence': min(answers[k]['confidence'] for k in ['supersede', 'conflict', 'duplicate'])}
    return converted


def summarize(rows):
    writes = [r for r in rows if r['action'] in WRITES]
    correct = sum(r['action'] == r['gold']['action'] for r in rows)
    correct_writes = sum(r['action'] == r['gold']['action'] for r in writes)
    eligible = [r for r in rows if r['gold']['action'] in WRITES]
    return {
        'samples': len(rows), 'unavailable': sum(r['status'] != 'ready' for r in rows),
        'actions': dict(Counter(r['action'] for r in rows)), 'correctActions': correct,
        'actionAccuracy': correct / len(rows), 'writeCount': len(writes),
        'correctWrites': correct_writes, 'wrongWrites': len(writes) - correct_writes,
        'writePrecision': correct_writes / len(writes) if writes else None,
        'eligibleWriteCount': len(eligible),
        'correctWriteCoverage': correct_writes / len(eligible) if eligible else None,
        'missedEligibleIds': [r['id'] for r in eligible if r['action'] != r['gold']['action']],
        'wrongWriteIds': [r['id'] for r in writes if r['action'] != r['gold']['action']],
        'confusion': {gold: dict(Counter(r['action'] for r in rows if r['gold']['action'] == gold)) for gold in ['add', 'merge', 'replace', 'reject', 'defer']},
        'judgments': {key: {'correct': sum(r['policyAnswers'].get(key, {}).get('value') == r['gold'][key] for r in rows if key != 'relation' or r['hasRelated']),
                            'total': sum(key != 'relation' or r['hasRelated'] for r in rows)} for key in ['support', 'retention', 'relation']},
    }


def infer(agent, case, definitions):
    from laya.common import build_sequence
    state = json.dumps({'candidate': case['content'], 'evidence': case['evidence'], 'existing_facts': case['related']}, ensure_ascii=False)
    for definition in definitions.values():
        seq, markers, stats = build_sequence(agent.tok, state, agent._to_internal(definition), 1000000, 256, return_stats=True)
        if len(seq) > 1024 or stats['options_distinct'] != stats['options'] or len(markers) != stats['options']:
            raise ValueError('token-budget-exceeded')
    raw = agent.predict(state, definitions, max_len=1024, head_max_len=256)
    if raw.get('usage', {}).get('options'):
        raise ValueError('collapsed-options')
    return normalize(raw['answers'], definitions)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', type=Path)
    parser.add_argument('--dataset', type=Path, default=ROOT / 'tests/fixtures/laya-knowledge-admission.json')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    data = json.loads(args.dataset.read_text(encoding='utf-8'))
    validate_dataset(data)
    if args.validate_only:
        print(json.dumps({'valid': True, 'samples': len(data['cases'])}))
        return
    if not args.model_dir or not args.output:
        parser.error('--model-dir and --output required for inference')
    manifest = json.loads((ROOT / 'resources/laya/model-manifest.json').read_text(encoding='utf-8'))
    sidecar.verify(args.model_dir, manifest)
    if importlib.metadata.version('laya') != manifest['sdk']:
        raise ValueError('sdk-version-mismatch')
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    report = {'schema': 1, 'kind': data['origin'], 'qualityGate': 'not-evaluated-synthetic-exploration',
              'policy': {'threshold': THRESHOLD, 'hostChecks': 'assumed-valid; not exercised against application', 'writes': 'simulated only'},
              'model': manifest['model'], 'revision': manifest['revision'], 'sdk': manifest['sdk'],
              'python': platform.python_version(), 'platform': platform.platform(), 'device': 'cpu', 'threads': 4,
              'datasetSha256': sidecar.digest(args.dataset), 'scriptSha256': sidecar.digest(Path(__file__)),
              'adapterSha256': sidecar.digest(ROOT / 'resources/laya/sidecar.py'), 'templates': VARIANTS,
              'limits': ['24 related synthetic cases; no independent human labels or holdout',
                         'No threshold fitting; all variants exploratory', 'No extraction, live host transactions, retrieval or wiki generation tested',
                         'Current-six actions use the new sandbox policy, not production routing'],
              'results': [], 'summary': {}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    with sidecar.runtime_checkpoint(args.model_dir, manifest) as checkpoint:
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            from laya import Agent
            torch.set_num_threads(min(4, os.cpu_count() or 1))
            report['threads'] = torch.get_num_threads()
            agent = Agent(str(checkpoint), device='cpu', expected_sha256={k: v['sha256'] for k, v in manifest['files'].items()})
        report['loadMs'] = round((time.perf_counter() - started) * 1000)
        for variant, definitions in VARIANTS.items():
            rows = []
            for case in data['cases']:
                tick = time.perf_counter()
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        answers = infer(agent, case, definitions)
                    status, error = 'ready', None
                except Exception as exc:
                    answers, status, error = {}, 'unavailable', type(exc).__name__ + ': ' + str(exc)
                converted = policy_answers(answers, variant, bool(case['related']))
                row = {'id': case['id'], 'variant': variant, 'gold': case['gold'], 'hasRelated': bool(case['related']),
                       'status': status, 'error': error, 'answers': answers, 'policyAnswers': converted,
                       'action': decide(converted, bool(case['related'])), 'elapsedMs': round((time.perf_counter() - tick) * 1000)}
                rows.append(row)
                print(variant, case['id'], row['action'], flush=True)
            report['results'].extend(rows)
            report['summary'][variant] = summarize(rows)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
    if any(summary['unavailable'] for summary in report['summary'].values()):
        raise SystemExit(2)


if __name__ == '__main__':
    main()
