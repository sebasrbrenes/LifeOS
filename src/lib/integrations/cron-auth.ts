import { timingSafeEqual } from "node:crypto";

/**
 * Checks the "Authorization: Bearer <CRON_SECRET>" header Vercel Cron
 * sends. Without a configured secret the endpoint is closed.
 */
export function isAuthorizedCronRequest(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
