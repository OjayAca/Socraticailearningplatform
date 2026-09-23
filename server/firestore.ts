import "server-only";
import { Timestamp, type DocumentSnapshot, type Firestore as AdminFirestore, type Query } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebase";
import { ServiceError, type RecordDoc, type Store } from "./platform";

// Keep Date values expected by the existing learning workflow, including nested timestamps.
export function normalizeRead(value: any): any {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(normalizeRead);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeRead(child)]));
  return value;
}

export function normalizeWrite(value: any): any {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeWrite);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, normalizeWrite(child)]));
  return value;
}

// Preserve nanosecond precision; converting updateTime to Date can miss concurrent writes.
const version = (doc: DocumentSnapshot) => doc.updateTime
  ? `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}` : undefined;
const record = (doc: DocumentSnapshot): RecordDoc => ({
  path: doc.ref.path, data: doc.exists ? normalizeRead(doc.data()) : null, version: version(doc),
});

function storageError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if ([6, 9, 10, "already-exists", "failed-precondition", "aborted"].includes((error as { code: number | string }).code))
    throw new ServiceError(409, "conflict", "This session changed. Reload and retry.");
  throw new ServiceError(503, "database-unavailable", "Learning storage is temporarily unavailable. Your saved work is preserved.");
}

export class Firestore implements Store {
  constructor(private db: AdminFirestore = getAdminFirestore()) {}

  async get(path: string): Promise<RecordDoc> {
    const started = Date.now();
    try { return record(await this.db.doc(path).get()); }
    catch (error) { return storageError(error); }
    finally { console.info(JSON.stringify({ event: "learning_storage_timing", action: "get", durationMs: Date.now() - started })); }
  }

  async query(collection: string, field?: string, value?: unknown): Promise<RecordDoc[]> {
    const started = Date.now();
    try {
      let query: Query = this.db.collection(collection);
      if (field) query = query.where(field, "==", value);
      return (await query.get()).docs.map(record);
    } catch (error) { return storageError(error); }
    finally { console.info(JSON.stringify({ event: "learning_storage_timing", action: "query", durationMs: Date.now() - started })); }
  }

  async commit(writes: Array<{ doc: RecordDoc; data: any }>): Promise<void> {
    if (!writes.length) return;
    const started = Date.now();
    try {
      // Full replacements and create-only writes must share one atomic commit.
      // No retry: the service's previously read versions must still match.
      await this.db.runTransaction(async transaction => {
        const refs = writes.map(({ doc }) => this.db.doc(doc.path));
        const current = await transaction.getAll(...refs);
        current.forEach((snapshot, index) => {
          if (version(snapshot) !== writes[index].doc.version)
            throw new ServiceError(409, "conflict", "This session changed. Reload and retry.");
        });
        writes.forEach(({ data }, index) => transaction.set(refs[index], normalizeWrite(data)));
      }, { maxAttempts: 1 });
    } catch (error) { storageError(error); }
    finally { console.info(JSON.stringify({ event: "learning_storage_timing", action: "commit", durationMs: Date.now() - started })); }
  }
}
