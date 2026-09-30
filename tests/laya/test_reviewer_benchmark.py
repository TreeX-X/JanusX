import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location('reviewers', ROOT/'scripts/benchmark-knowledge-reviewers.py')
reviewers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewers)


def row(id, p, supported, page=None):
    return {'id': id, 'pSupport': p, 'supported': supported, 'decision': reviewers.decision(p,.9), 'page': page}


class ReviewerBenchmarkTests(unittest.TestCase):
    def test_probability_direction_and_invalid_values(self):
        self.assertEqual(reviewers.decision(.95,.9),'pass')
        self.assertEqual(reviewers.decision(.05,.9),'block')
        self.assertEqual(reviewers.decision(.6,.9),'defer')
        self.assertEqual(reviewers.decision(None,.9),'defer')
        for p in [float('nan'),float('inf'),True,-.1,1.1]:
            with self.assertRaises(ValueError): reviewers.decision(p,.9)

    def test_abstention_is_not_correct_classification_or_perfect_precision(self):
        result=reviewers.metrics([row('positive',None,True),row('negative',None,False)])
        self.assertEqual(result['unavailable'],2)
        self.assertEqual(result['accuracy'],0)
        self.assertEqual(result['balancedAccuracy'],0)
        self.assertIsNone(result['passPrecision'])
        self.assertIsNone(result['passPrecisionWilson95'])
        self.assertEqual(result['correctPassCoverage'],0)

    def test_false_pass_and_missed_positive_are_separate(self):
        result=reviewers.metrics([row('false-pass',.99,False),row('missed',.6,True),row('ok',.99,True)])
        self.assertEqual(result['falsePassCount'],1)
        self.assertEqual(result['passPrecision'],.5)
        self.assertEqual(result['correctPassCoverage'],.5)
        self.assertEqual(result['missedSupportedIds'],['missed'])

    def test_page_requires_every_claim_and_does_not_average_scores(self):
        rows=[row('a',.999,True,'page'),row('b',.8,False,'page')]
        result=reviewers.page_metrics(rows)
        self.assertEqual(result['count'],1)
        self.assertEqual(result['decisions'],{'defer':1})
        self.assertEqual(result['falsePassCount'],0)
        rows[1]=row('b',.91,False,'page')
        self.assertEqual(reviewers.page_metrics(rows)['falsePassCount'],1)

    def test_unavailable_claim_keeps_page_pending(self):
        result=reviewers.page_metrics([row('a',.99,True,'page'),row('b',None,True,'page')])
        self.assertEqual(result['unavailable'],1)
        self.assertEqual(result['decisions'],{'defer':1})

    def test_locked_standard_has_separate_validation_and_page_cases(self):
        standard=json.loads(reviewers.STANDARD.read_text(encoding='utf-8'))
        rows=reviewers.cases(standard)
        self.assertEqual(sum(r['split']=='development' for r in rows),24)
        self.assertEqual(sum(r['split']=='validation' for r in rows),28)
        self.assertEqual(len({r['page'] for r in rows if 'page' in r}),8)


if __name__=='__main__': unittest.main()
