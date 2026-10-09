import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for OAuth tokens at rest (spec §21.12): AES-256-GCM with a
 * random 96-bit IV per value and the integration id as associated data,
 * so a ciphertext copied onto another integration row fails to decrypt.
 *
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). The version
 * prefix leaves room for key rotation.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes");
  return key;
}

export function encryptToken(
  plaintext: string,
  base64Key: string,
  associatedData: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(base64Key), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export class TokenDecryptionError extends Error {
  constructor() {
    // Deliberately uninformative: never include token material.
    super("Token could not be decrypted");
    this.name = "TokenDecryptionError";
  }
}

export function decryptToken(
  encrypted: string,
  base64Key: string,
  associatedData: string,
): string {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined)
    throw new TokenDecryptionError();
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyFrom(base64Key),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new TokenDecryptionError();
  }
}
