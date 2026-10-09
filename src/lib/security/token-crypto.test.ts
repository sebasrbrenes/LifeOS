import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  TokenDecryptionError,
  decryptToken,
  encryptToken,
} from "./token-crypto";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const TOKEN = "strava-access-token-abc123";

describe("token encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const encrypted = encryptToken(TOKEN, KEY, "integration-1");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain(TOKEN);
    expect(decryptToken(encrypted, KEY, "integration-1")).toBe(TOKEN);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptToken(TOKEN, KEY, "i")).not.toBe(
      encryptToken(TOKEN, KEY, "i"),
    );
  });

  it("rejects the wrong key, another row, tampering and garbage", () => {
    const encrypted = encryptToken(TOKEN, KEY, "integration-1");
    expect(() => decryptToken(encrypted, OTHER_KEY, "integration-1")).toThrow(
      TokenDecryptionError,
    );
    expect(() => decryptToken(encrypted, KEY, "integration-2")).toThrow(
      TokenDecryptionError,
    );
    const parts = encrypted.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 1;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptToken(parts.join("."), KEY, "integration-1")).toThrow(
      TokenDecryptionError,
    );
    expect(() => decryptToken("v2.a.b.c", KEY, "integration-1")).toThrow(
      TokenDecryptionError,
    );
  });

  it("errors never reveal token material", () => {
    try {
      decryptToken(encryptToken(TOKEN, KEY, "a"), OTHER_KEY, "a");
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN);
    }
  });
});
