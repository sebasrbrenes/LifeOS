/**
 * Integration contracts (spec §15). Provider payloads never leave their
 * adapter: everything downstream sees NormalizedRecords keyed by a
 * canonical source metric such as "strava.run_distance_km".
 */

export type IntegrationProvider = "strava" | "google_calendar";

export type NormalizedRecord = {
  /** Canonical source metric, e.g. "strava.run_distance_km". */
  sourceMetric: string;
  occurredAt: Date;
  value: number;
  /** Provider's stable id for the underlying item (activity, event). */
  externalRecordId: string;
  /**
   * Non-sensitive attributes that source filters can match on (e.g. the
   * sport type or calendar id). Never tokens or free-form personal text
   * beyond what the filter needs.
   */
  attributes: Readonly<Record<string, string>>;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  providerUserId: string | null;
};

/** Thrown for provider HTTP failures; carries no response body. */
export class ProviderError extends Error {
  constructor(
    readonly provider: IntegrationProvider,
    readonly code:
      "unauthorized" | "rate_limited" | "unavailable" | "bad_response",
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`${provider}: ${code}`);
    this.name = "ProviderError";
  }
}

export type Fetch = typeof fetch;
