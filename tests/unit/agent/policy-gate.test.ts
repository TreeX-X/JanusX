import { describe, expect, it } from 'vitest'
import { evaluateWorkspaceReadPolicy } from '../../../src/main/agent/runtime/policy-gate'

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
        actionRisk: 'read',
        approval: 'not-required',
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
      actionRisk: 'read',
      approval: 'denied',
      reasonCode: 'SENSITIVE_PATH',
    })
  })
})
