import importlib.util
import math
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sidecar", Path(__file__).parents[2] / "resources/laya/sidecar.py")
sidecar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sidecar)


def answers():
    return {key: ({"choice": "fact", "probabilities": {"fact": .9997, "decision": .0001, "preference": .0001, "procedure": .0001},
                  "answer_confidence": .9997, "confidence": .02} if key == "kind" else
                 {"noul": .01, "answer_confidence": .99, "action": {"act_probability": .01}}) for key in sidecar.QUESTIONS}


class ProtocolTests(unittest.TestCase):
    def test_sdk_config_rewrite_does_not_mutate_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'tokenizer').mkdir()
            config = root / 'tokenizer/tokenizer_config.json'; config.write_text('{}')
            manifest = {'files': {'tokenizer/tokenizer_config.json': {'size': 2, 'sha256': sidecar.digest(config)}}}
            with sidecar.runtime_checkpoint(root, manifest) as runtime:
                (runtime / 'tokenizer/tokenizer_config.json').write_text('{"patched":true}')
                sidecar.verify(root, manifest)
            self.assertFalse(runtime.exists())

    def test_selected_probability_and_false_direction(self):
        result = {row["question"]: row for row in sidecar.normalize_answers(answers())}
        self.assertFalse(result["support"]["answer"])
        self.assertEqual(result["support"]["answer_confidence"], .99)
        self.assertEqual(result["support"]["noul"], .01)
        self.assertAlmostEqual(result["kind"]["answer_confidence"], .9997)

    def test_rounded_choice_is_normalized(self):
        raw = answers()
        raw["kind"].update(probabilities={"fact": .3333, "decision": .3333, "preference": .3333, "procedure": 0}, answer_confidence=.3333)
        kind = next(row for row in sidecar.normalize_answers(raw) if row["question"] == "kind")
        self.assertAlmostEqual(sum(kind["distribution"].values()), 1)

    def test_rejects_missing_questions_and_collapsed_options(self):
        raw = answers(); del raw["support"]
        with self.assertRaises(ValueError): sidecar.normalize_answers(raw)
        raw = answers(); del raw["kind"]["probabilities"]["procedure"]
        with self.assertRaises(ValueError): sidecar.normalize_answers(raw)

    def test_rejects_invalid_confidence_and_probabilities(self):
        for value in [math.nan, math.inf, -1, 1.1]:
            raw = answers(); raw["support"]["answer_confidence"] = value
            with self.assertRaises(ValueError): sidecar.normalize_answers(raw)
            raw = answers(); raw["support"]["noul"] = value
            with self.assertRaises(ValueError): sidecar.normalize_answers(raw)

    def test_rejects_entropy_confidence_and_wrong_choice(self):
        raw = answers(); raw["kind"]["answer_confidence"] = .02
        with self.assertRaises(ValueError): sidecar.normalize_answers(raw)
        raw = answers(); raw["kind"].update(choice="procedure", answer_confidence=.0001)
        with self.assertRaises(ValueError): sidecar.normalize_answers(raw)

    def test_verifies_actual_bytes_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "weight").write_bytes(b"safe")
            manifest = {"files": {"weight": {"size": 4, "sha256": sidecar.digest(root / "weight")}}}
            sidecar.verify(root, manifest)
            (root / "weight").write_bytes(b"evil")
            with self.assertRaises(ValueError): sidecar.verify(root, manifest)
            (root / "weight").unlink()
            with self.assertRaises(ValueError): sidecar.verify(root, manifest)


if __name__ == '__main__': unittest.main()
