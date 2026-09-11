/**
 * @file 团队密码学原语（ToB M2）
 * @description 仅用 Node 内建 crypto：scrypt 存密码、HMAC-SHA256 签会话，
 *              不引入 bcrypt / jsonwebtoken 等 native 或第三方依赖。
 */

import { createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb)
const SCRYPT_KEYLEN = 64

export function newId(): string {
  return randomUUID()
}

/** 邀请码：8 位无歧义字符（去 0O1l）。 */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let code = ''
  for (const byte of bytes) code += alphabet[byte % alphabet.length]
  return code
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer
  return { salt, hash: derived.toString('hex') }
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  try {
    const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer
    const expected = Buffer.from(hash, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

/** 极简 JWT 式 token：`payload.signature`，payload 为 JSON。调用方自行约束字段。 */
export function signToken(payload: Record<string, unknown>, secret: string): string {
  const body = base64urlEncode(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(base64urlDecode(body)) as T
  } catch {
    return null
  }
}

export function newMachineSecret(): string {
  return randomBytes(32).toString('hex')
}
