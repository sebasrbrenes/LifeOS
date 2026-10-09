const MAX_KEY_LENGTH = 60;

/**
 * Stable machine key for a metric, derived from its name. Keys identify
 * metrics in score versions and ratio references, so they are generated
 * once and never change when the metric is renamed.
 */
export function slugifyMetricKey(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/g, "");
  // Keys must start with a letter (DB CHECK ^[a-z][a-z0-9_]{0,59}$).
  if (!slug) return "metric";
  return /^[a-z]/.test(slug) ? slug : `m_${slug}`.slice(0, MAX_KEY_LENGTH);
}

/** `base`, or `base_2`, `base_3`… — the first one not in `taken`. */
export function uniqueMetricKey(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const base = slugifyMetricKey(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
