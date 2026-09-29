import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location('evaluation', ROOT / 'scripts/evaluate-laya.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def prediction():
    return {'status': 'ready', 'answers': [
        {'question': question, 'answer': 'fact' if question == 'kind' else False,
         'distribution': {'fact': .7, 'preference': .1, 'decision': .1, 'procedure': .1}
         if question == 'kind' else {'true': .1, 'false': .9},
         'answer_confidence': .7 if question == 'kind' else .9,
         **({} if question == 'kind' else {'noul': .1})}
        for question in evaluation.QUESTIONS]}


def row(id='case', language='zh', result=None):
    return {'id': id, 'split': 'holdout', 'language': language,
            'labels': [False, 'fact', False, False, False, False],
            'result': result or prediction()}


class ReportingTests(unittest.TestCase):
    def test_rejects_partial_duplicate_and_wrongly_typed_answers(self):
        bad = prediction()
        bad['answers'].pop()
        duplicate = prediction()
        duplicate['answers'][-1] = duplicate['answers'][0]
        wrong_type = prediction()
        wrong_type['answers'][0]['answer'] = 0
        for raw in [bad, duplicate, wrong_type, {'status': 'ready'}, {'status': 'ready', 'answers': [None] * 6}]:
            with self.subTest(raw=raw):
                self.assertEqual(evaluation.validated_result(raw)['reason'], 'invalid-output')

    def test_rejects_nonfinite_collapsed_and_inconsistent_probabilities(self):
        mutations = [
            {'answer_confidence': float('nan')}, {'answer_confidence': True},
            {'distribution': {'true': .2, 'false': .9}},
            {'distribution': {'false': 1}}, {'answer_confidence': .1},
            {'answer': True, 'answer_confidence': .1}, {'noul': .9}, {'noul': float('inf')},
        ]
        for mutation in mutations:
            raw = prediction()
            raw['answers'][0].update(mutation)
            with self.subTest(mutation=mutation):
                self.assertEqual(evaluation.validated_result(raw)['status'], 'unavailable')
        self.assertEqual(evaluation.validated_result(prediction()), prediction())

    def test_abstentions_and_invalid_ready_outputs_remain_in_each_denominator(self):
        invalid = prediction()
        invalid['answers'].pop()
        rows = [row('ok'), row('partial', result=invalid),
                row('too-long', result={'status': 'unavailable', 'reason': 'token-budget-exceeded'}),
                row('other-language', 'en')]
        groups, failures = evaluation.summarize_results(rows, ['en', 'zh'])
        for question in evaluation.QUESTIONS:
            measured = groups['holdout/zh/' + question]
            self.assertEqual((measured['attempted'], measured['count']), (3, 1))
            self.assertAlmostEqual(measured['coverage'], 1 / 3)
            self.assertAlmostEqual(measured['correctOverAttempted'], 1 / 3)
            self.assertEqual(measured['accuracy'], 1)
        self.assertEqual(groups['holdout/en/support']['coverage'], 1)
        self.assertEqual([failure['reason'] for failure in failures], ['invalid-output', 'token-budget-exceeded'])

    def test_majority_classifier_has_high_accuracy_but_zero_positive_recall(self):
        rows = [{'answer': False, 'label': i == 0, 'distribution': {'true': .01, 'false': .99}} for i in range(100)]
        measured = evaluation.metrics(rows)
        self.assertEqual(measured['accuracy'], .99)
        self.assertEqual(measured['majorityBaseline'], .99)
        self.assertEqual(measured['balancedAccuracy'], .5)
        self.assertEqual(measured['recallTrue'], 0)
        self.assertEqual(measured['confusionMatrix']['true']['false'], 1)
        self.assertEqual(measured['classSupport'], {'true': 1, 'false': 99})
        self.assertLess(measured['macroF1'], .5)

    def test_missing_positive_class_cannot_be_reported_as_balanced_success(self):
        measured = evaluation.metrics([{'answer': False, 'label': False, 'distribution': {'true': 0, 'false': 1}}])
        self.assertEqual(measured['accuracy'], 1)
        self.assertEqual(measured['missingClasses'], ['true'])
        self.assertIsNone(measured['balancedAccuracy'])
        self.assertIsNone(measured['macroF1'])
        self.assertLess(measured['accuracyWilson95'][0], .21)

    def test_quality_gate_requires_every_class_and_local_coverage(self):
        groups, _ = evaluation.summarize_results([row()], ['zh'])
        groups = {key: value for key, value in groups.items() if key.startswith('holdout/')}
        policy = {'id': 'unit-fixture', 'minCoverage': .9, 'tasks': {
            key: {'minCount': 1, 'minAccuracy': .1, 'maxBrier': 2, 'maxEce': 1} for key in groups}}
        result = evaluation.quality_gate(groups, policy, 1, 'annotated')
        self.assertEqual(result['status'], 'failed')
        self.assertIn('holdout/zh/supersede/class-support', result['failures'])
        groups['holdout/zh/retention']['coverage'] = .5
        result = evaluation.quality_gate(groups, policy, .99, 'annotated')
        self.assertIn('holdout/zh/retention/coverage', result['failures'])
        for value in [True, float('nan'), float('inf')]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                evaluation.quality_gate(groups, policy, value, 'annotated')

    def test_mistakes_identify_sample_question_and_confidence(self):
        sample = row()
        sample['labels'][5] = True
        _, failures = evaluation.summarize_results([sample], ['zh'])
        self.assertEqual(failures, [{'id': 'case', 'split': 'holdout', 'language': 'zh', 'question': 'conflict',
                                     'expected': True, 'actual': False, 'confidence': .9}])

    def test_synthetic_translations_cannot_cross_splits_either(self):
        dataset = json.loads((ROOT / 'tests/fixtures/laya-memory-eval.json').read_text(encoding='utf-8'))
        dataset[0]['scenario'] = 'same-event'
        dataset[-1]['scenario'] = 'same-event'
        with self.assertRaisesRegex(ValueError, 'scenario leaks'):
            evaluation.validate_dataset(dataset)

    def test_routing_detects_confident_misses_and_unnecessary_llm_work(self):
        stable = row()
        stable['candidateKind'] = 'fact'
        stable['labels'] = [True, 'fact', True, False, False, False]
        for answer in stable['result']['answers']:
            answer['answer'] = 'fact' if answer['question'] == 'kind' else answer['question'] in ['retention', 'support']
            answer['distribution'] = ({'fact': .97, 'preference': .01, 'decision': .01, 'procedure': .01}
                if answer['question'] == 'kind' else {'true': .99 if answer['answer'] else .01, 'false': .01 if answer['answer'] else .99})
            answer['answer_confidence'] = .97 if answer['question'] == 'kind' else .99
            if answer['question'] != 'kind': answer['noul'] = answer['distribution']['true']
        missed = copy.deepcopy(stable)
        missed['labels'][5] = True
        wasteful = copy.deepcopy(stable)
        wasteful['result']['answers'][1].update(distribution={'fact': .7, 'preference': .1, 'decision': .1, 'procedure': .1}, answer_confidence=.7)
        unavailable = copy.deepcopy(stable)
        unavailable['result'] = {'status': 'unavailable'}
        report = evaluation.summarize_routing([stable, missed, wasteful, unavailable, row()], ['zh'])['groups']['holdout/zh']
        self.assertEqual((report['attempted'], report['scored'], report['manualFallback'], report['missingCandidateKind']), (4, 3, 1, 1))
        self.assertEqual((report['skipRefinement'], report['refine'], report['missedRefinement'], report['unnecessaryRefinement']), (2, 1, 1, 1))
        self.assertEqual(report['missedRefinementRate'], 1)
        self.assertEqual(report['unnecessaryRefinementRate'], .5)
        self.assertAlmostEqual(report['allSixAccuracy'], 2 / 3)

    def test_diagnostic_holdout_covers_all_labels_in_each_language(self):
        dataset = json.loads((ROOT / 'tests/fixtures/laya-memory-diagnostics.json').read_text(encoding='utf-8'))
        self.assertEqual(evaluation.validate_dataset(dataset)['samples'], 48)
        for language in ['en', 'zh']:
            selected = [sample for sample in dataset if sample['split'] == 'holdout' and sample['language'] == language]
            for index, question in enumerate(evaluation.QUESTIONS):
                expected = set(evaluation.KINDS) if question == 'kind' else {True, False}
                self.assertEqual({sample['labels'][index] for sample in selected}, expected)
        self.assertTrue(all(sample.get('scenario') for sample in dataset))
        self.assertTrue(all(sample.get('candidateKind') in evaluation.KINDS for sample in dataset))
        for sample in dataset:
            if sample['language'] == 'zh':
                self.assertRegex(sample['content'], '[\u4e00-\u9fff]')
        original = copy.deepcopy(dataset)
        evaluation.validate_dataset(dataset)
        self.assertEqual(dataset, original)


if __name__ == '__main__': unittest.main()
