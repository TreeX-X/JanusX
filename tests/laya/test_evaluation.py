import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('evaluation', Path(__file__).parents[2] / 'scripts/evaluate-laya.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class MetricsTests(unittest.TestCase):
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
