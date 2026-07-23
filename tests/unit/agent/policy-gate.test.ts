import { describe, expect, it } from 'vitest'
import {
  evaluateWorkspaceActionPolicy,
  evaluateWorkspaceReadPolicy,
  redactPolicyValue,
  settleApprovalDecision,
} from '../../../src/main/agent/runtime/policy-gate'

describe('workspace read policy', () => {
  it.each([
    'src/index.ts',
    'docs/environment.md',
    'config/application.json',
    'assets/private-key-guide.txt',
    'secret/example.txt',
    'secrets-guide/example.txt',
    '.envrc.example',
    '.docker/config.example.json',
    '.config/gcloud/README.md',
    '',
  ])(
    'allows ordinary read target %s without approval',
    (relativePath) => {
      expect(evaluateWorkspaceReadPolicy({ relativePath })).toEqual({
        outcome: 'allow',
        evidenceConfidence: 'unknown',
        actionRisk: 'read',
        approvalPolicy: 'none',
        approvalDecision: 'not-required',
        reasonCode: 'READ_ALLOWED',
      })
    },
  )

  it.each([
    '.env',
    '.ENV.LOCAL',
    '.envrc',
    'config\\.npmrc',
    '.ssh/id_rsa',
    '.AWS/credentials',
    'secrets/client_secret.production.json',
    'secrets/service-account-ci.json',
    'certificates/signing.PEM',
    'certificates/release.p12',
    'secrets/application.json',
    '.secrets/application.json',
    '.docker/config.json',
    'home/.docker/config.json',
    '.config/gcloud/application_default_credentials.json',
    'home/.config/gcloud/application_default_credentials.json',
  ])('denies sensitive read target %s with an explainable reason', (relativePath) => {
    expect(evaluateWorkspaceReadPolicy({ relativePath })).toEqual({
      outcome: 'deny',
      evidenceConfidence: 'unknown',
      actionRisk: 'read',
      approvalPolicy: 'none',
      approvalDecision: 'denied',
      reasonCode: 'SENSITIVE_PATH',
    })
  })

  it.each(['inspect', 'list', 'stat', 'read'] as const)('allows read-only %s without approval', (actionRisk) => {
    expect(evaluateWorkspaceActionPolicy({ actionRisk, evidenceConfidence: 'high' })).toMatchObject({
      outcome: 'allow',
      evidenceConfidence: 'high',
      approvalPolicy: 'none',
      approvalDecision: 'not-required',
      reasonCode: actionRisk === 'read' ? 'READ_ALLOWED' : 'READ_ONLY_ALLOWED',
    })
  })

  it.each(['write', 'create', 'config-apply', 'run', 'restore', 'delete', 'external-command', 'network'] as const)(
    'requires per-action approval for %s regardless of confidence',
    (actionRisk) => {
      const low = evaluateWorkspaceActionPolicy({ actionRisk, evidenceConfidence: 'low' })
      const high = evaluateWorkspaceActionPolicy({ actionRisk, evidenceConfidence: 'high' })
      expect(low).toMatchObject({ outcome: 'approval-required', approvalPolicy: 'per-action', approvalDecision: 'pending' })
      expect(high).toMatchObject({ outcome: 'approval-required', approvalPolicy: 'per-action', approvalDecision: 'pending' })
      expect(settleApprovalDecision(high, 'approved')).toMatchObject({
        outcome: 'allow', approvalDecision: 'approved', reasonCode: 'APPROVAL_GRANTED',
      })
    },
  )

  it('denies sensitive targets and redacts secret-bearing fields', () => {
    expect(evaluateWorkspaceActionPolicy({ actionRisk: 'write', relativePath: '.env' })).toMatchObject({
      outcome: 'deny', reasonCode: 'SENSITIVE_PATH',
    })
    expect(redactPolicyValue({ path: 'config.json', apiKey: 'secret', nested: { access_token: 'token', value: 'ok' } })).toEqual({
      path: 'config.json', apiKey: '[REDACTED]', nested: { access_token: '[REDACTED]', value: 'ok' },
    })
  })

  it('normalizes untrusted confidence metadata without changing authority', () => {
    const decision = evaluateWorkspaceActionPolicy({
      actionRisk: 'write',
      evidenceConfidence: 'certain' as never,
    })
    expect(decision).toMatchObject({
      evidenceConfidence: 'unknown',
      outcome: 'approval-required',
      approvalPolicy: 'per-action',
    })
  })
})
