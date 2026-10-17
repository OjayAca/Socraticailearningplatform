import { afterEach, describe, expect, it, vi } from "vitest";
import { clearViews, invalidateViews, loadView, peekView, watchView } from "@/lib/view-cache";

afterEach(clearViews);

describe("view cache", () => {
  it("deduplicates concurrent loads and retains successful results", async () => {
    const load = vi.fn(async () => ({ count: 3 }));
    const [first, second] = await Promise.all([loadView("records", load), loadView("records", load)]);
    expect(second).toBe(first);
    expect(await loadView("records", load)).toBe(first);
    expect(load).toHaveBeenCalledOnce();
  });

  it("retries failures and reloads after a mutation", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(2);
    await expect(loadView("records", load)).rejects.toThrow("offline");
    expect(await loadView("records", load)).toBe(2);
    invalidateViews();
    await loadView("records", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not repopulate a cleared cache from an older request", async () => {
    let resolve!: (value: number) => void;
    const request = loadView("records", () => new Promise<number>(done => { resolve = done; }));
    await Promise.resolve();
    clearViews();
    await loadView("records", async () => 7);
    resolve(1);
    await request;
    expect(peekView("records")).toBe(7);
  });

  it("keeps streams across navigation and disposes them on account changes", () => {
    let publish!: (value: number) => void;
    const stop = vi.fn();
    const start = vi.fn((next: (value: number) => void) => { publish = next; return stop; });
    const first = vi.fn();
    const detach = watchView("sessions:a", start, first, vi.fn());
    publish(1);
    detach();
    publish(2);
    const second = vi.fn();
    watchView("sessions:a", start, second, vi.fn());
    expect(second).toHaveBeenLastCalledWith(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledOnce();
    clearViews();
    publish(3);
    expect(stop).toHaveBeenCalledOnce();
    expect(peekView("sessions:a")).toBeUndefined();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
