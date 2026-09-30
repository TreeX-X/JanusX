import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).parents[2]
spec=importlib.util.spec_from_file_location('jev',ROOT/'scripts/benchmark-jev-reviewer.py')
jev=importlib.util.module_from_spec(spec)
spec.loader.exec_module(jev)


class JevBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.standard=json.loads(jev.benchmark.STANDARD.read_text(encoding='utf-8'))
        self.rows=jev.benchmark.cases(self.standard)[:2]

    def test_noul_is_support_probability_without_laya_confidence_field(self):
        response={'model':jev.MODEL,'answers':{'support':{'type':'noul','noul':.03}},'usage':{'input_tokens':100,'output_tokens':0}}
        p,usage=jev.parse_response(response)
        self.assertEqual(p,.03)
        self.assertEqual(usage['input_tokens'],100)
        for bad in [True,float('nan'),-1,None]:
            changed=copy.deepcopy(response)
            changed['answers']['support']['noul']=bad
            with self.assertRaises(jev.ProbeError): jev.parse_response(changed)

    def test_model_drift_and_wrong_usage_are_rejected(self):
        response={'model':'jev-latest','answers':{'support':{'type':'noul','noul':.99}},'usage':{'input_tokens':1,'output_tokens':0}}
        with self.assertRaises(jev.ProbeError): jev.parse_response(response)
        response['model']=jev.MODEL
        response['usage']['input_tokens']=True
        with self.assertRaises(jev.ProbeError): jev.parse_response(response)

    def test_request_contains_no_gold_labels_and_matches_laya_text(self):
        body=jev.payload(self.rows[0],self.standard)
        self.assertEqual(set(json.loads(body['state'])),{'candidate','evidence','existing_facts'})
        self.assertEqual(body['questions']['support']['instructions'],self.standard['layaQuestion'])
        self.assertNotIn('supported',body)

    def test_budget_keeps_unattempted_cases_in_denominator(self):
        result=jev.evaluate(self.standard,self.rows,lambda body:(.99,{'input_tokens':10,'output_tokens':0}),3,10)
        self.assertEqual(result['attemptedRequests'],3)
        self.assertEqual(result['stopReason'],'request-budget-exhausted')
        self.assertEqual(result['summary']['development']['count'],2)
        self.assertEqual(result['summary']['development']['unavailable'],1)
        self.assertEqual(result['usage']['input_tokens'],30)

    def test_http_failure_stops_without_retries_and_marks_unknown_usage(self):
        def fail(body): raise jev.ProbeError('http-401')
        result=jev.evaluate(self.standard,self.rows,fail,6,10)
        self.assertEqual(result['attemptedRequests'],1)
        self.assertEqual(result['usage']['requestsWithUnknownUsage'],1)
        self.assertEqual(result['summary']['development']['unavailable'],2)

    def test_variable_repeats_do_not_select_favorable_score(self):
        scores=iter([.99,.2,.99])
        result=jev.evaluate(self.standard,self.rows[:1],lambda body:(next(scores),{'input_tokens':1,'output_tokens':0}),3,10)
        self.assertIsNone(result['results'][0]['pSupport'])
        self.assertEqual(result['results'][0]['error'],'unstable-repetitions')

    def test_redirect_and_error_text_never_expose_credentials(self):
        with self.assertRaisesRegex(jev.ProbeError,'redirect-refused'):
            jev.NoRedirect().redirect_request(None,None,302,'secret',{},'https://example.com')
        error=jev.urllib.error.HTTPError(jev.ENDPOINT,401,'SECRET',{},None)
        with patch.object(jev.urllib.request.OpenerDirector,'open',side_effect=error):
            with self.assertRaises(jev.ProbeError) as caught: jev.request({},'SECRET',1)
        self.assertEqual(str(caught.exception),'http-401')


if __name__=='__main__': unittest.main()
