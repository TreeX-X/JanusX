import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).parents[2]
spec=importlib.util.spec_from_file_location('repeat_analysis',ROOT/'scripts/analyze-jev-repeat-results.py')
analysis=importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class JevRepeatAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.standard=json.loads(analysis.benchmark.STANDARD.read_text(encoding='utf-8'))
        self.rows=[{**r,'repeatProbabilities':[.95,.96,.95] if r['supported'] else [.05,.04,.05]} for r in analysis.benchmark.cases(self.standard)]

    def test_numeric_variation_does_not_imply_action_or_classification_flip(self):
        result=analysis.analyze({'results':self.rows,'summary':{'preserved':True}},self.standard)
        self.assertEqual(result['originalStrictSummary'],{'preserved':True})
        self.assertEqual(len(result['stability']['validation']['numericVariationIds']),28)
        self.assertEqual(result['stability']['validation']['actionFlipIds'],[])
        self.assertTrue(all(r['validation']['accuracy']==1 for r in result['byRepeat']))

    def test_crossing_gate_retains_all_repeats_and_reports_flip(self):
        self.rows[0]['repeatProbabilities']=[.89,.91,.89]
        result=analysis.analyze({'results':self.rows,'summary':{}},self.standard)
        self.assertEqual(result['stability']['development']['actionFlipIds'],[self.rows[0]['id']])
        self.assertEqual(result['stability']['development']['classificationFlipIds'],[])

    def test_missing_repeat_or_changed_label_cannot_be_ignored(self):
        self.rows[0]['repeatProbabilities'].pop()
        with self.assertRaises(ValueError): analysis.analyze({'results':self.rows,'summary':{}},self.standard)
        self.rows[0]['repeatProbabilities']=[.95]*3
        self.rows[0]['supported']=not self.rows[0]['supported']
        with self.assertRaises(ValueError): analysis.analyze({'results':self.rows,'summary':{}},self.standard)


if __name__=='__main__': unittest.main()
