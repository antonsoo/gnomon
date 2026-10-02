import { describe, expect, it } from "vitest";
import { locate, LOCATE_FAILURE_TEXT, type LocateFailure, type PositionSource } from "../src/lib/locate.ts";

type Success = Parameters<PositionSource["getCurrentPosition"]>[0];
type Failure = Parameters<PositionSource["getCurrentPosition"]>[1];

/** A browser whose answer the test gives, when it chooses to; and a clock the test moves. */
function harness() {
  const log: string[] = [];
  let success: Success | undefined;
  let failure: Failure | undefined;
  let requests = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let now = 0;
  let nextId = 1;
  const source: PositionSource = {
    getCurrentPosition(onSuccess, onError) {
      requests++;
      success = onSuccess;
      failure = onError;
    },
  };
  const options = {
    setTimer: (fn: () => void, ms: number) => {
      timers.set(nextId, { at: now + ms, fn });
      return nextId++;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
  };
  return {
    log,
    source,
    options,
    handlers: {
      position: (lat: number, lon: number) => log.push(`position ${lat},${lon}`),
      failed: (reason: LocateFailure) => log.push(`failed ${reason}`),
    },
    allow: (lat: number, lon: number) => success?.({ coords: { latitude: lat, longitude: lon } }),
    refuse: (code: number) => failure?.({ code }),
    advance: (ms: number) => {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    pendingTimers: () => timers.size,
    requests: () => requests,
  };
}

describe("locate", () => {
  it("reports the position and stops waiting", () => {
    const h = harness();
    locate(h.source, h.handlers, h.options);
    h.allow(37.7749, -122.4194);
    expect(h.log).toEqual(["position 37.7749,-122.4194"]);
    expect(h.pendingTimers()).toBe(0);
    h.advance(60_000);
    expect(h.log).toHaveLength(1);
  });

  it("tells a refusal from a failure to find a position", () => {
    const refused = harness();
    locate(refused.source, refused.handlers, refused.options);
    refused.refuse(1);
    expect(refused.log).toEqual(["failed denied"]);
    for (const code of [2, 3]) {
      const lost = harness();
      locate(lost.source, lost.handlers, lost.options);
      lost.refuse(code);
      expect(lost.log).toEqual(["failed unavailable"]);
      expect(lost.pendingTimers()).toBe(0);
    }
  });

  it("says so when the browser never answers (Firefox, with its prompt closed)", () => {
    const h = harness();
    locate(h.source, h.handlers, h.options);
    h.advance(19_999);
    expect(h.log).toEqual([]);
    h.advance(1);
    expect(h.log).toEqual(["failed unanswered"]);
  });

  it("still takes an answer that comes after it gave up waiting", () => {
    const h = harness();
    locate(h.source, h.handlers, { ...h.options, patienceMs: 5_000 });
    h.advance(5_000);
    h.allow(51.4779, 0);
    expect(h.log).toEqual(["failed unanswered", "position 51.4779,0"]);
  });

  it("counts one answer from a browser that gives two", () => {
    const h = harness();
    locate(h.source, h.handlers, h.options);
    h.allow(1, 2);
    h.allow(3, 4);
    h.refuse(1);
    expect(h.log).toEqual(["position 1,2"]);
  });

  it("reports a browser without geolocation without asking it", () => {
    const h = harness();
    locate(undefined, h.handlers, h.options);
    expect(h.log).toEqual(["failed unsupported"]);
    expect(h.requests()).toBe(0);
    expect(h.pendingTimers()).toBe(0);
  });

  it("has a sentence for every way it can fail", () => {
    for (const reason of ["unsupported", "denied", "unavailable", "unanswered"] as const) {
      expect(LOCATE_FAILURE_TEXT[reason]).toMatch(/\.$/);
    }
  });
});
