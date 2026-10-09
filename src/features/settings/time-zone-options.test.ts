import { describe, expect, it } from "vitest";

import {
  clientTimeZoneOptions,
  serverTimeZoneOptions,
  supportedTimeZones,
} from "./time-zone-options";

// useSyncExternalStore requires stable snapshots: equal inputs must return
// the identical array, or React reports a possible infinite loop.
describe("time zone options", () => {
  it("returns a stable server snapshot per zone", () => {
    expect(serverTimeZoneOptions("UTC")).toBe(serverTimeZoneOptions("UTC"));
    expect(serverTimeZoneOptions("UTC")).toEqual(["UTC"]);
    expect(serverTimeZoneOptions("Europe/Madrid")).not.toBe(
      serverTimeZoneOptions("UTC"),
    );
  });

  it("returns the browser list itself when it contains the zone", () => {
    const zones = ["America/Bogota", "Europe/Madrid"];
    expect(clientTimeZoneOptions("Europe/Madrid", zones)).toBe(zones);
  });

  it("prepends a zone the browser doesn't list, with a stable result", () => {
    const zones = ["America/Bogota", "Europe/Madrid"];
    const first = clientTimeZoneOptions("Etc/Test_Zone", zones);
    expect(first).toEqual(["Etc/Test_Zone", "America/Bogota", "Europe/Madrid"]);
    expect(clientTimeZoneOptions("Etc/Test_Zone", zones)).toBe(first);
  });

  it("reads the supported list once", () => {
    expect(supportedTimeZones()).toBe(supportedTimeZones());
    expect(supportedTimeZones().length).toBeGreaterThan(100);
  });
});
