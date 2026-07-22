import { extname } from 'path'
import type { TrustedWorkspaceTarget } from './path-guard'

export type WorkspaceReadPolicyDecision = {
  outcome: 'allow' | 'deny'
  actionRisk: 'read'
  approval: 'not-required' | 'denied'
  reasonCode: 'READ_ALLOWED' | 'SENSITIVE_PATH'
}

const SENSITIVE_DIRECTORIES = new Set(['.aws', '.azure', '.gnupg', '.kube', '.secrets', '.ssh', 'secrets'])
const SENSITIVE_FILENAMES = new Set([
  '.env',
  '.envrc',
  '.git-credentials',
  '.netrc',
  '.npmrc',
  '.pypirc',
  'credentials',
  'credentials.json',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
])
const SENSITIVE_EXTENSIONS = new Set(['.jks', '.key', '.keystore', '.p12', '.pem', '.pfx'])

function isSensitivePath(relativePath: string): boolean {
  const segments = relativePath.toLowerCase().split(/[\\/]+/).filter(Boolean)
  const filename = segments.at(-1) ?? ''
  const normalizedPath = segments.join('/')
  return segments.some((segment) => SENSITIVE_DIRECTORIES.has(segment))
    || SENSITIVE_FILENAMES.has(filename)
    || filename.startsWith('.env.')
    || normalizedPath === '.docker/config.json'
    || normalizedPath.endsWith('/.docker/config.json')
    || normalizedPath === '.config/gcloud/application_default_credentials.json'
    || normalizedPath.endsWith('/.config/gcloud/application_default_credentials.json')
    || /^client_secret(?:[-_.].*)?\.json$/.test(filename)
    || /^service[-_]account(?:[-_.].*)?\.json$/.test(filename)
    || SENSITIVE_EXTENSIONS.has(extname(filename))
}

export function evaluateWorkspaceReadPolicy(
  target: Pick<TrustedWorkspaceTarget, 'relativePath'>,
): WorkspaceReadPolicyDecision {
  if (isSensitivePath(target.relativePath)) {
    return {
      outcome: 'deny',
      actionRisk: 'read',
      approval: 'denied',
      reasonCode: 'SENSITIVE_PATH',
    }
  }
  return {
    outcome: 'allow',
    actionRisk: 'read',
    approval: 'not-required',
    reasonCode: 'READ_ALLOWED',
  }
}
