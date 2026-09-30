import importlib.util
import json
from pathlib import Path
import unittest
import subprocess
import sys

ROOT=Path(__file__).parents[2]
spec=importlib.util.spec_from_file_location('repeat_analysis',ROOT/'scripts/analyze-jev-repeat-results.py')
analysis=importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class JevRepeatAnalysisTests(unittest.TestCase):
    def test_expanded_standard_preview_and_category_denominators(self):
        path=ROOT/'tests/fixtures/knowledge-review-expanded-standard.json'
        preview=subprocess.run([sys.executable,str(ROOT/'scripts/benchmark-jev-reviewer.py'),
                                '--standard',str(path),'--max-requests','408'],capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(preview.stdout)['cases'],136)
        standard=json.loads(path.read_text(encoding='utf-8'))
        rows=[{**r,'repeatProbabilities':[.95]*3 if r['supported'] else [.05]*3} for r in analysis.benchmark.cases(standard)]
        result=analysis.analyze({'results':rows,'summary':{}},standard)
        for repeat in result['byRepeat']:
            self.assertEqual(sum(m['count'] for m in repeat['validationByCategory'].values()),112)
            self.assertEqual(repeat['validationByCategory']['long-context']['count'],32)
            self.assertEqual(repeat['wikiPages']['falsePassCount'],0)
            self.assertEqual(repeat['wikiPages']['count'],8)

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
