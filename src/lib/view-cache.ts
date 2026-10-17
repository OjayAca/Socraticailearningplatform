// Browser-session cache. Never persist private learning records to local storage.
const values = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();
const streams = new Map<string, { stop: () => void; listeners: Set<Listener> }>();
type Listener = { next: (value: unknown) => void; error: (cause: unknown) => void };
let generation = 0;

export function peekView<T>(key: string): T | undefined {
  return values.get(key) as T | undefined;
}

export function loadView<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (values.has(key)) return Promise.resolve(values.get(key) as T);
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const version = generation;
  const request = Promise.resolve().then(load).then(value => {
    if (version === generation && pending.get(key) === request) values.set(key, value);
    return value;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

// Keep one live subscription across route changes; auth changes dispose it.
export function watchView<T>(key: string, start: (next: (value: T) => void, error: (cause: unknown) => void) => () => void, next: (value: T) => void, error: (cause: unknown) => void): () => void {
  const listener: Listener = { next: value => next(value as T), error };
  let stream = streams.get(key);
  if (!stream) {
    stream = { stop: () => {}, listeners: new Set() };
    streams.set(key, stream);
    stream.listeners.add(listener);
    const current = stream;
    current.stop = start(value => {
      if (streams.get(key) !== current) return;
      values.set(key, value);
      current.listeners.forEach(item => item.next(value));
    }, cause => {
      if (streams.get(key) !== current) return;
      streams.delete(key);
      values.delete(key);
      current.listeners.forEach(item => item.error(cause));
      current.stop();
    });
  } else {
    stream.listeners.add(listener);
    if (values.has(key)) next(values.get(key) as T);
  }
  return () => { stream.listeners.delete(listener); };
}

export function invalidateViews(): void {
  generation++;
  pending.clear();
  for (const key of values.keys()) if (!streams.has(key)) values.delete(key);
}

export function clearViews(): void {
  generation++;
  const previous = [...streams.values()];
  streams.clear();
  previous.forEach(stream => stream.stop());
  pending.clear();
  values.clear();
}
