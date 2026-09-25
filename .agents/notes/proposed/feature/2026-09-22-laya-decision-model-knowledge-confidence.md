---
schema: harness-note/1
id: 673865a1-4c0c-4b66-a2a5-1bb8ef4aa646
kind: requirement
lifecycle: draft
created: 2026-09-22
class: feature
---

# Agent Note: Open decision model for knowledge triage and confidence calibration (Laya selected, switch-gated; CLM tracked as extension)

## Problem

JanusX knowledge settling has no calibrated confidence source. `deterministic-extractor.ts:243-258` assigns fixed constants (`git/checkpoint → 0.9`, `decision/preference → 0.7`, `procedure → 0.6-0.9`), `extract-service.ts:84-112` takes LLM self-reported `confidence` at face value with only a "conservative" prompt instruction, and `review-service` + `knowledge-settings.ts:8-12` gate auto-accept on `confidence >= 0.9 + derivation=deterministic + kind=fact`. Sorting (`services/knowledge.ts:153`), BM25 `confidenceBoost` (`shared/knowledge.ts:587`), and Inbox ordering therefore rest on uncalibrated numbers. The LLM stage (`llm-stage.ts`) additionally degrades to `no-default-llm` when the user has no model key, leaving desktop offline with rules-only triage.

The extension idea is to bundle an open decision model — `convaiinnovations/laya` (`https://huggingface.co/convaiinnovations/laya`, Apache 2.0) — to handle knowledge整理 (dedupe / kind / supersedes / wiki relevance) and automatic confidence judgments locally.

## Proposal

Decision (2026-09-25): select Laya, gated behind an explicit opt-in switch. No default install, no bundled weights, no Python/transformers in the installer. Ship only the underlying architecture capability: a `DecisionScorer` port + `NoopScorer` default + capability probe + settings toggle. Laya runs only when the user explicitly enables it and a local provider is present; otherwise the pipeline behaves exactly as today.

Record as a trend-reference idea only: the LLM pipeline stays primary. Jev / Laya style fast decision models are tracked as a frontier complement — a future pre-decision and calibration layer between the deterministic stage and the LLM stage, to be expanded when time permits, not a replacement.

Evaluate Laya as a calibration and triage layer between the deterministic stage and the LLM stage, not as an LLM replacement.

What Laya is (from model card, verified 2026-09-22): non-autoregressive System-1 decision model on ModernBERT-large (421M, 512 ctx, English) / mmBERT-base (322M, 1024 ctx up to 8k, 100+ languages) / fine-tuned `laya-typed-decisions` (421M, 1024 ctx). Input is a state (text/email/ticket/JSON) plus typed questions (`choice` / `score` ordinal / `noul` boolean); output is typed answers with probabilities in one forward pass (~33ms GPU, ~193-464ms CPU, ~7ms/q batched). Trained with RLCD (strictly proper scoring rules) so honest probabilities maximize reward. Never generates text: nothing to parse, nothing to hallucinate. `pip install laya` + `Router(preload=True)` routes English vs multilingual by script detection in <1ms.

Mapping onto JanusX pipeline:

- Retention triage: `retention-classifier.ts` rule list → Laya `choice` over `noise / operational / evidence / derived` plus `noul` for `has-file-ref / is-user-note`.
- Kind classification: `DECISION_RE / PREFERENCE_RE / COMMAND_OR_ERROR_RE` regex → Laya `choice` over `fact / preference / decision / procedure`.
- Confidence recalibration: replace fixed 0.6/0.7/0.9 and LLM self-report with Laya `confidence` + per-(type, option-count) temperature scaling; feed `confidenceBoost`, Inbox sort, and `autoAcceptDeterministicFacts` threshold.
- Merge/conflict judgments: `tokenJaccard ≥ 0.7/0.85` dedupe, `findConflicts` concept/file overlap, `synthesizeMentionEdges` → Laya `noul` (`is-duplicate`, `does-supersede`, `is-conflict`) and `score` (severity/quality 0-2).
- Gating to save LLM cost: high-confidence deterministic + Laya-agree → fast path; low-confidence or Laya-flagged conflict → budgeted LLM extract (`LLM_BATCH_MAX_CHARS`, 60s timeout path unchanged).

Staged rollout: P0 offline spike (export audit + `KnowledgeFeedback` accept/reject logs as calibration set, run `laya` Python sidecar out-of-tree, measure ECE/accuracy on retention/kind/supersedes tasks); P1 scorer-only integration behind `KnowledgeSettings.decisionModel.enabled=false` by default (opt-in switch, sidecar or ONNX via local `laya-serve` probe, no installer bloat, `NoopScorer` fallback); P2 gate + auto-accept policy extension only when switch is on and temperature-fitted; P3 optional fine-tune of a JanusX checkpoint with the published Kaggle 2xT4 notebook, versioned separately from base weights.

Switch-form architecture (hard constraints):
- `KnowledgeSettings` gains `decisionModel: { enabled: false, provider: 'laya', endpoint?: string }`; default off, `normalizeKnowledgeSettings` preserves off-on-unknown.
- Main process defines a `DecisionScorer` port (`score(state, questions) -> typed answers | unavailable`) with `NoopScorer` as the compiled-in default; Laya/ONNX/HTTP adapters live outside the bundle and are loaded only after probe success.
- Pipeline order stays `deterministic -> decisionModel (annotate-only, if enabled+available) -> llm-stage`; scorer never flips `autoAccept` by itself, only annotates `confidence`/triage fields for existing policy to consume.
- Packaging: `electron-builder.yml` excludes Python/`transformers`/`vLLM`/weights; weights are an opt-in download into `userData` with lazy `Router(max_loaded)` management; settings UI shows `not-installed / sidecar-missing / ready` and blocks enable until probe passes.

## Alternatives considered

- Keep status quo (rules + LLM self-reported confidence) — smallest diff, zero dependency, works today. Ruled out as the calibration source because fixed constants and uncalibrated LLM numbers cannot drive auto-accept thresholds honestly; Inbox stays noisy.
- Embedding / reranker (e.g. BGE) for整理 — better at semantic dedupe/similarity than Jaccard, lighter than Laya. Ruled out as the confidence answer because similarity is not probability; still needs a calibration head for auto-accept.
- Small generative LLM (e.g. Qwen 0.5B local) for scoring — flexible prompts, Chinese-strong. Ruled out as the gate because autoregressive decoding is slower, needs parsing, hallucinates options, and ships uncalibrated without RLCD-style training.
- Closed decision API (TypeSafe Jev) — stronger on >20-option single-shot classification (Banking77 0.870 vs Laya 0.425 at defaults) and soft-distribution matching. Tracked as the closed-source reference point for the same System-1 trend; ruled out for desktop bundling because closed weights, metered cost ($0.042/1M), and knowledge exfiltration violate local-first plus privacy defaults.
- Direct bundle of Laya weights into the installer now — fastest to "built-in". Ruled out now because 647-808MB weights plus Python/transformers runtime break portable packaging and update size; must stay an opt-in download with lazy `Router(max_loaded)` management.
- CLM (`Contrastive-LM/CLM`, CLM-8B on frozen Qwen3-8B + 20M heads, Apache-2.0, TypeSafe-compatible `/v1/systemone` + `/v1/rank`, verified 2026-09-25) — tracked as extension accumulation only, not the current pick. Stronger as an agentic verifier / best-of-N ranker (DeepSWE 81.6%, Terminal-Bench 2.1 87.6%, up to 9x faster than Jev) with 2048-token states and embedding reuse. Ruled out for desktop bundling because the 8B backbone needs ~19.4GB VRAM at BF16 (Q4 min ~6.5GB + vLLM, RTX 4090/H100 class), which breaks the offline CPU-first desktop constraint; reserve the `DecisionScorer.rank()` primitive so CLM can plug in later as a server-side verifier without changing the switch.

## Acceptance criteria

- [ ] Offline spike report: Laya zero-shot vs rules vs current LLM on a JanusX-labeled sample (retention, kind, duplicate/supersedes), with accuracy, Brier, and ECE before/after temperature fitting.
- [ ] Switch defaults to off: fresh install has `decisionModel.enabled=false`, installer size unchanged, no Python/weights vendored; pipeline output identical to today when off or provider absent.
- [ ] Capability probe + degraded path: enable is blocked with an explicit reason (`not-installed` / `sidecar-missing` / `probe-failed`) until a local `laya-serve`/ONNX endpoint answers; sidecar-absent runs fall back to `NoopScorer` with no throw.
- [ ] Scorer is annotate-only: temperature-fitting procedure documented per (question type, option count); no probability drives auto-accept before fitting; existing `autoAcceptDeterministicFacts` policy untouched until P2.
- [ ] Chinese observations route to `laya-multilingual` via `Router`; English-only checkpoint never scores non-Latin scripts alone (model card: Khmer 0.000 acc at 0.952 confidence).
- [ ] Long observations (>320-token state budget on English, >768 on multilingual) use truncation/chunking; >20-option questions use coarse-to-fine split, not one giant `choice`.
- [ ] Typecheck passes; tests cover routing, budget fallback, calibration-gated auto-accept, and sidecar-absent degradation.

## Risks

- Zero-shot near-chance on custom workflows (typed-decisions base 0.362 vs fine-tuned 0.766; majority baseline 0.461): JanusX judgments are custom, so expect a fine-tune requirement, not drop-in accuracy.
- Ships over-confident (mean ECE 0.466 → 0.081 after fitting on `laya`): trusting raw probabilities for auto-accept will wrongly auto-apply; temperature fit on own data is mandatory.
- Context truncation: 512/1024 budgets vs 4000-char normalize and 6000-char LLM cap; naive truncation loses evidence, chunking adds latency.
- Ordinal `score` is the weakest primitive (SST-5 0.372): urgency/importance/severity scores need separate validation, not blind adoption.
- Desktop cost: extra 0.6-0.8GB download, resident VRAM/RAM with `preload=True`, CPU 200-500ms per call, TS↔Python bridge (sidecar/ONNX) maintenance, and packaging/exclusion rules.
- Language routing failure mode is silent-high-confidence: confidence gating cannot save a wrong-checkpoint call; routing must happen before the forward pass.
