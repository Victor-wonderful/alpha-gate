import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * App-level AES-256-GCM encryption for sensitive payloads (exchange API keys).
 *
 * Layout of the encrypted string (base64):
 *   [12 bytes IV][16 bytes auth tag][ciphertext...]
 *
 * The master key comes from process.env.ENCRYPTION_KEY. It MUST be at least 32
 * characters. We derive a 32-byte key via scrypt so the env var can be any
 * passphrase length.
 *
 * Failure modes (intentionally noisy — better to fail loud than silently
 * misuse a weak key):
 *  - Missing env var → throws at module load
 *  - Tampered ciphertext → decrypt throws (GCM tag mismatch)
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;
const KEY_SALT = "alpha-gate.v1"; // fixed salt — rotates only on key rotation

function getDerivedKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is required for encrypting exchange API keys.",
    );
  }
  if (raw.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY must be at least 32 characters. Generate with: openssl rand -base64 48",
    );
  }
  // scrypt is deterministic given (passphrase, salt). Same env var → same key.
  return scryptSync(raw, KEY_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error("encryptSecret: empty plaintext");
  const key = getDerivedKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  if (!encoded) throw new Error("decryptSecret: empty input");
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("decryptSecret: ciphertext too short");
  }
  const key = getDerivedKey();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Build a display-safe masked label like "Sk...AbCd" from an API key. */
export function maskApiKey(raw: string): string {
  if (raw.length <= 8) return raw[0] + "***";
  return `${raw.slice(0, 2)}...${raw.slice(-4)}`;
}
