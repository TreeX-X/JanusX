import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('qwen',Path(__file__).parents[2]/'scripts/benchmark-qwen-reviewer.py')
qwen=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qwen)


class QwenBenchmarkTests(unittest.TestCase):
    def response(self,verdict='supported',finish='stop'):
        return {'choices':[{'finish_reason':finish,'message':{'content':json.dumps({'verdict':verdict,'reason':'Evidence supports it.'})}}],
                'usage':{'prompt_tokens':50,'completion_tokens':20}}

    def test_truncation_and_malformed_output_fail_closed(self):
        with self.assertRaises(ValueError):qwen.parse(self.response(finish='length'))
        with self.assertRaises(ValueError):qwen.parse(self.response(verdict='maybe'))
        r=self.response();r['usage']['prompt_tokens']=-1
        with self.assertRaises(ValueError):qwen.parse(r)
        self.assertEqual(qwen.parse(self.response())['verdict'],'supported')

    def test_disagreement_and_missing_runs_remain_in_denominator(self):
        rows=[dict(id='a',dataset='test',supported=False,runs=[{'verdict':'supported'},{'verdict':'unsupported'},{'verdict':'unsupported'}]),
              dict(id='b',dataset='test',supported=True,runs=[])]
        result=qwen.summarize(rows,3)
        self.assertEqual(result['actionFlipIds'],['a'])
        self.assertEqual(result['byRepeat'][0]['all']['falsePassCount'],1)
        self.assertEqual(result['allRepeatsAgree']['count'],2)
        self.assertEqual(result['allRepeatsAgree']['decisions'],{'defer':2})

    def test_payload_has_no_labels_and_bounds_output(self):
        body=qwen.payload({'evidence':'source','claim':'candidate','supported':False,'id':'secret-gold'},0)
        self.assertNotIn('secret-gold',json.dumps(body))
        self.assertEqual(json.loads(body['messages'][1]['content']),{'evidence':'source','candidate':'candidate'})
        self.assertFalse(body['chat_template_kwargs']['enable_thinking'])
        self.assertEqual(body['max_tokens'],160)

    def test_thinking_mode_and_reasoning_metadata(self):
        body=qwen.payload({'evidence':'source','claim':'candidate'},0,True)
        self.assertTrue(body['chat_template_kwargs']['enable_thinking'])
        self.assertEqual(body['max_tokens'],1536)
        response=self.response()
        response['choices'][0]['message']['reasoning_content']='Internal reasoning.'
        parsed=qwen.parse(response)
        self.assertEqual(parsed['reasoningCharacters'],19)
        self.assertNotIn('reasoning_content',parsed)


if __name__=='__main__':unittest.main()
