import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('nimble_reviewer', ROOT/'scripts/benchmark-nimble-reviewer.py')
nimble = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nimble)


class NimbleReviewerTest(unittest.TestCase):
    def response(self, p=.95):
        return {'model': nimble.ALIAS, 'answers': {'support': {'type': 'noul', 'noul': p}},
            'usage': {'input_tokens': 200, 'output_tokens': 1}}

    def standard(self):
        return json.loads(nimble.benchmark.STANDARD.read_text(encoding='utf-8'))

    def row(self, scores, supported=True, identity='case'):
        return {'id': identity, 'dataset': 'expanded-validation', 'split': 'validation', 'track': 'wiki',
            'page': 'page', 'supported': supported, 'runs': [{'pSupport': p} for p in scores]}

    def test_payload_matches_frozen_jev_question_and_complete_state(self):
        row = {'claim': 'candidate', 'evidence': 'complete evidence'}
        data = nimble.payload(row, self.standard())
        self.assertEqual(data['questions']['support'], {'type': 'noul', 'instructions': self.standard()['layaQuestion']})
        self.assertEqual(json.loads(data['state']), {'candidate': 'candidate', 'evidence': ['complete evidence'], 'existing_facts': []})
        self.assertNotIn('Authorization', data)

    def test_parse_valid_probability(self):
        self.assertEqual(nimble.parse(self.response())['pSupport'], .95)

    def test_reject_invalid_probability(self):
        for p in [True, '0.99', None, float('nan'), float('inf'), -.01, 1.01]:
            with self.subTest(p=p), self.assertRaises(nimble.ProbeError):
                nimble.parse(self.response(p))

    def test_reject_wrong_model_and_malformed_responses(self):
        response = self.response()
        variants = [None, {}, {**response, 'model': 'jev-1.13.0'}, {**response, 'answers': []},
            {**response, 'answers': {'support': {'type': 'choice', 'noul': .99}}},
            {**response, 'answers': {**response['answers'], 'extra': {}}}]
        for data in variants:
            with self.subTest(data=data), self.assertRaises(nimble.ProbeError): nimble.parse(data)

    def test_reject_invalid_usage_and_context_overflow(self):
        for usage in [None, {'input_tokens': True, 'output_tokens': 1}, {'input_tokens': 2049, 'output_tokens': 1},
            {'input_tokens': 4, 'output_tokens': 2}, {'input_tokens': -1, 'output_tokens': 1}]:
            with self.subTest(usage=usage), self.assertRaises(nimble.ProbeError):
                nimble.parse({**self.response(), 'usage': usage})

    def test_numeric_instability_does_not_disappear_into_action_agreement(self):
        summary = nimble.summarize([self.row([.94, .95, .95])], self.standard())
        self.assertEqual(summary['numericFlipIds'], ['case'])
        self.assertEqual(summary['actionFlipIds'], [])
        self.assertEqual(summary['strictNumericStability']['all']['unavailable'], 1)
        self.assertEqual(summary['actionAgreementDiagnostic']['all']['decisions'], {'pass': 1})

    def test_missing_repeat_and_failed_request_remain_in_denominator(self):
        rows = [self.row([.99]), self.row([None, None, None], False, 'missing')]
        summary = nimble.summarize(rows, self.standard())
        for repeat in summary['byRepeat']:
            self.assertEqual(repeat['all']['count'], 2)
            self.assertEqual(repeat['all']['negativeCount'], 1)
            self.assertEqual(repeat['wikiPages']['falsePassCount'], 0)
        self.assertEqual(summary['strictNumericStability']['all']['unavailable'], 2)

    def test_false_pass_and_action_flips_are_separate(self):
        summary = nimble.summarize([self.row([.95, .05, .05], False)], self.standard())
        self.assertEqual(summary['byRepeat'][0]['all']['falsePassCount'], 1)
        self.assertEqual(summary['classificationFlipIds'], ['case'])
        self.assertEqual(summary['actionFlipIds'], ['case'])
        self.assertEqual(summary['strictNumericStability']['all']['falsePassCount'], 0)

    def test_resource_floors(self):
        self.assertIsNone(nimble.floor_reason({'freeMiB': 768, 'availableRamMiB': 3072}))
        self.assertEqual(nimble.floor_reason({'freeMiB': 767, 'availableRamMiB': 8192}), 'gpu-resource-floor')
        self.assertEqual(nimble.floor_reason({'freeMiB': 4096, 'availableRamMiB': 3071}), 'ram-resource-floor')

    def test_redirect_refused(self):
        with self.assertRaises(nimble.ProbeError):
            nimble.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.com')


if __name__=='__main__': unittest.main()
