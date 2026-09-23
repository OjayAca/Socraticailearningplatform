// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Timestamp, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import { Firestore, normalizeRead, normalizeWrite } from "../../server/firestore";

function store(snapshotVersions: Array<Timestamp | undefined>) {
  const transaction = { getAll: vi.fn().mockResolvedValue(snapshotVersions.map(updateTime => ({ updateTime }))), set: vi.fn() };
  const db = { doc: vi.fn(path => ({ path })), runTransaction: vi.fn(async callback => callback(transaction)) };
  return { adapter: new Firestore(db as unknown as AdminFirestore), transaction, db };
}

describe("Admin Firestore compatibility", () => {
  it("normalizes nested timestamps and retains empty values", () => {
    const date = new Date("2026-09-22");
    expect(normalizeRead({ nested: [Timestamp.fromDate(date)], empty: [], nil: null })).toEqual({ nested: [date], empty: [], nil: null });
    expect(normalizeWrite({ date, omitted: undefined, array: [undefined], nested: { nil: null } })).toEqual({ date, array: [null], nested: { nil: null } });
  });
  it("atomically creates and fully replaces documents after checking every version", async () => {
    const { adapter, transaction, db } = store([undefined, new Timestamp(5, 123456789)]);
    await adapter.commit([{ doc: { path: "sessions/new", data: null }, data: { revision: 0 } }, { doc: { path: "sessions/old", data: {}, version: "5:123456789" }, data: { revision: 2 } }]);
    expect(transaction.set.mock.calls).toEqual([[{ path: "sessions/new" }, { revision: 0 }], [{ path: "sessions/old" }, { revision: 2 }]]);
    expect(db.runTransaction).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 1 });
  });
  it("rejects even a nanosecond version difference without any writes", async () => {
    const { adapter, transaction } = store([new Timestamp(5, 123456790)]);
    await expect(adapter.commit([{ doc: { path: "sessions/a", data: {}, version: "5:123456789" }, data: {} }])).rejects.toMatchObject({ status: 409 });
    expect(transaction.set).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing document when creating", async () => {
    const { adapter, transaction } = store([new Timestamp(5, 0)]);
    await expect(adapter.commit([{ doc: { path: "sessions/a", data: null }, data: {} }])).rejects.toMatchObject({ status: 409 });
    expect(transaction.set).not.toHaveBeenCalled();
  });
  it("maps commit conflicts and outages to safe service errors", async () => {
    const { adapter, db } = store([]);
    const writes = [{ doc: { path: "sessions/a", data: null }, data: {} }];
    db.runTransaction.mockRejectedValueOnce({ code: 10 });
    await expect(adapter.commit(writes)).rejects.toMatchObject({ status: 409 });
    db.runTransaction.mockRejectedValueOnce({ code: 14 });
    await expect(adapter.commit(writes)).rejects.toMatchObject({ status: 503 });
  });
});
