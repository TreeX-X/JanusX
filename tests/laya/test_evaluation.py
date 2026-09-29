import importlib.util
from pathlib import Path
import unittest
import copy
import json

spec = importlib.util.spec_from_file_location('evaluation', Path(__file__).parents[2] / 'scripts/evaluate-laya.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class MetricsTests(unittest.TestCase):
    def sample_data(self):
        return json.loads((Path(__file__).parents[2] / 'tests/fixtures/laya-memory-eval.json').read_text(encoding='utf-8'))

    def test_rejects_split_leakage_and_wrong_label_types(self):
        dataset = self.sample_data()
        self.assertEqual(evaluation.validate_dataset(dataset)['samples'], 24)
        bad = copy.deepcopy(dataset)
        bad[-1]['source'] = bad[0]['source']
        with self.assertRaises(ValueError): evaluation.validate_dataset(bad)
        bad = copy.deepcopy(dataset)
        bad[0]['labels'][0] = 1
        with self.assertRaises(ValueError): evaluation.validate_dataset(bad)
        with self.assertRaises(ValueError): evaluation.validate_dataset(dataset, 'annotated')

    def test_rejects_identical_inputs_and_cross_language_scenario_leakage(self):
        dataset = self.sample_data()
        bad = copy.deepcopy(dataset)
        for field in ['content', 'evidence', 'related']:
            bad[-1][field] = bad[0][field]
        with self.assertRaises(ValueError): evaluation.validate_dataset(bad)
        for row in dataset:
            row['scenario'] = row['source']
            row['annotation'] = {'origin': 'redacted-real', 'reviewer': 'fixture-only', 'reviewedAt': '2026-09-29T00:00:00Z'}
        dataset[-1]['scenario'] = dataset[0]['scenario']
        with self.assertRaises(ValueError): evaluation.validate_dataset(dataset, 'annotated')

    def test_quality_gate_never_certifies_synthetic_or_unpinned_data(self):
        self.assertEqual(evaluation.quality_gate({}, None, 1, 'synthetic')['status'], 'not-evaluated')
        self.assertEqual(evaluation.quality_gate({}, None, 1, 'annotated')['status'], 'not-evaluated')
        group = {'holdout/en/conflict': {'count': 100, 'accuracy': .99, 'brier': .01, 'ece10': .01, 'recallTrue': 0}}
        policy = {'id': 'fixture', 'minCoverage': .95, 'tasks': {'holdout/en/conflict': {
            'minCount': 100, 'minAccuracy': .9, 'maxBrier': .1, 'maxEce': .1, 'minPositiveRecall': .9}}}
        self.assertEqual(evaluation.quality_gate(group, policy, 1, 'annotated')['status'], 'failed')
        group['holdout/en/conflict']['recallTrue'] = .95
        self.assertEqual(evaluation.quality_gate(group, policy, 1, 'annotated')['status'], 'passed')
        self.assertEqual(evaluation.quality_gate(group, policy, .5, 'annotated')['status'], 'failed')
        policy['tasks'] = {}
        with self.assertRaises(ValueError): evaluation.quality_gate(group, policy, 1, 'annotated')

    def test_perfect_and_wrong_confident_answers(self):
        perfect = evaluation.metrics([{'answer': True, 'label': True, 'distribution': {'true': 1, 'false': 0}}])
        self.assertEqual((perfect['accuracy'], perfect['brier'], perfect['ece10']), (1, 0, 0))
        wrong = evaluation.metrics([{'answer': True, 'label': False, 'distribution': {'true': 1, 'false': 0}}])
        self.assertEqual((wrong['accuracy'], wrong['brier'], wrong['ece10']), (0, 2, 1))

    def test_multiclass_and_empty_coverage(self):
        result = evaluation.metrics([{'answer': 'fact', 'label': 'procedure', 'distribution': {'fact': .6, 'procedure': .4}}])
        self.assertAlmostEqual(result['brier'], .72)
        self.assertAlmostEqual(result['ece10'], .6)
        self.assertEqual(evaluation.metrics([]), {'count': 0})


if __name__ == '__main__': unittest.main()
