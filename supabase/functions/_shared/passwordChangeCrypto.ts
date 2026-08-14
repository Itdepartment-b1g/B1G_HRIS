/**
 * Token hashing and AES-GCM helpers for pending password changes.
 */

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function aesKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`b1g-pw-change:${secret}`))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptText(plain: string): Promise<string> {
  const key = await aesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  const packed = new Uint8Array(iv.length + encrypted.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(encrypted), iv.length)
  return bytesToB64(packed)
}

export async function decryptText(payload: string): Promise<string> {
  const key = await aesKey()
  const packed = b64ToBytes(payload)
  const iv = packed.subarray(0, 12)
  const data = packed.subarray(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

export function sanitizeAppOrigin(origin: string | undefined): string {
  const fallback = 'https://b1ghris.vercel.app'
  if (!origin) return fallback
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return url.origin
  } catch {
    return fallback
  }
}
