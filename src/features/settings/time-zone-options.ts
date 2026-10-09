/**
 * Timezone options for the profile form, shaped for `useSyncExternalStore`:
 * both snapshot functions must return the *same reference* for the same
 * input, or React warns about (and can fall into) an infinite render loop.
 */

let supported: readonly string[] | null = null;

/** IANA zones known to this browser, read once. */
export function supportedTimeZones(): readonly string[] {
  supported ??= Intl.supportedValuesOf?.("timeZone") ?? [];
  return supported;
}

const serverSnapshots = new Map<string, readonly string[]>();
const clientSnapshots = new Map<string, readonly string[]>();

/** During SSR the browser's list is unknown: only the saved zone. */
export function serverTimeZoneOptions(current: string): readonly string[] {
  let options = serverSnapshots.get(current);
  if (!options) {
    options = [current];
    serverSnapshots.set(current, options);
  }
  return options;
}

/**
 * The browser's zones, with the saved one first if the browser doesn't
 * list it (e.g. Chrome omits "UTC").
 */
export function clientTimeZoneOptions(
  current: string,
  zones: readonly string[] = supportedTimeZones(),
): readonly string[] {
  if (zones.includes(current)) return zones;
  let options = clientSnapshots.get(current);
  if (!options) {
    options = [current, ...zones];
    clientSnapshots.set(current, options);
  }
  return options;
}
