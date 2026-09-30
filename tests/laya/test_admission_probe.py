import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location('admission', ROOT / 'scripts/probe-laya-admission.py')
admission = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admission)


def answers(support=True, retention=True, relation='none', confidence=.99):
    return {key: {'value': value, 'confidence': confidence} for key, value in
            [('support', support), ('retention', retention), ('relation', relation)]}


class AdmissionProbeTests(unittest.TestCase):
    def test_host_failure_and_low_confidence_never_write(self):
        self.assertEqual(admission.decide(answers(), False, host_valid=False), 'defer')
        self.assertEqual(admission.decide(answers(confidence=.89), False), 'defer')
        self.assertEqual(admission.decide({}, False), 'defer')

    def test_explicit_update_and_unresolved_conflict_are_distinct(self):
        self.assertEqual(admission.decide(answers(relation='update'), True), 'replace')
        self.assertEqual(admission.decide(answers(relation='conflict'), True), 'defer')
        self.assertEqual(admission.decide(answers(support=False, relation='conflict'), True), 'defer')

    def test_unsupported_or_temporary_candidate_is_rejected(self):
        self.assertEqual(admission.decide(answers(support=False), False), 'reject')
        self.assertEqual(admission.decide(answers(retention=False), False), 'reject')

    def test_empty_context_does_not_depend_on_model_relation_or_kind(self):
        self.assertEqual(admission.decide(answers(relation='conflict'), False), 'add')
        self.assertEqual(admission.decide(answers(relation='duplicate'), True), 'merge')
        self.assertEqual(admission.decide(answers(relation='none'), True), 'defer')

    def test_zero_writes_is_not_perfect_precision_and_unavailable_stays_in_denominator(self):
        rows = [{'id': 'a', 'action': 'defer', 'status': 'unavailable', 'hasRelated': False,
                 'gold': {'action': 'add', 'support': True, 'retention': True, 'relation': 'none'}, 'policyAnswers': {}}]
        summary = admission.summarize(rows)
        self.assertIsNone(summary['writePrecision'])
        self.assertEqual(summary['correctWriteCoverage'], 0)
        self.assertEqual(summary['judgments']['support'], {'correct': 0, 'total': 1})

    def test_wrong_replacement_counts_as_wrong_write_even_for_eligible_knowledge(self):
        rows = [{'id': 'a', 'action': 'replace', 'status': 'ready', 'hasRelated': True,
                 'gold': {'action': 'merge', 'support': True, 'retention': True, 'relation': 'duplicate'}, 'policyAnswers': answers(relation='update')}]
        summary = admission.summarize(rows)
        self.assertEqual(summary['wrongWrites'], 1)
        self.assertEqual(summary['correctWriteCoverage'], 0)
        self.assertEqual(summary['writePrecision'], 0)

    def test_sdk_noul_false_confidence_is_not_probability_true(self):
        definitions = {'support': {'type': 'noul'}}
        parsed = admission.normalize({'support': {'noul': .02, 'answer_confidence': .98}}, definitions)
        self.assertFalse(parsed['support']['value'])
        self.assertEqual(parsed['support']['confidence'], .98)
        for entry in [{'noul': .02, 'answer_confidence': .02}, {'noul': float('nan'), 'answer_confidence': .99}]:
            with self.assertRaises(ValueError):
                admission.normalize({'support': entry}, definitions)
        with self.assertRaises(ValueError):
            admission.normalize({}, definitions)


if __name__ == '__main__':
    unittest.main()
