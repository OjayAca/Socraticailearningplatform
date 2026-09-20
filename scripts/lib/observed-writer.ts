/** BulkWriter.close() alone does not report permanent per-document failures. */
export function observedWriter(writer: FirebaseFirestore.BulkWriter): FirebaseFirestore.BulkWriter {
  const pending: Array<Promise<unknown>> = [];
  return new Proxy(writer, {
    get(target, property) {
      if (property === "close") return async () => {
        await target.close();
        const results = await Promise.all(pending);
        const failed = results.filter((result): result is { failed: true; error: unknown } => Boolean(result && typeof result === "object" && "failed" in result));
        if (failed.length) throw new AggregateError(failed.map(result => result.error), `${failed.length} document writes failed`);
      };
      const method = Reflect.get(target, property);
      if (["set", "create", "update", "delete"].includes(String(property))) return (...args: unknown[]) => {
        const result = method.apply(target, args) as Promise<unknown>;
        pending.push(result.then(value => value, error => ({ failed: true, error })));
        return result;
      };
      return typeof method === "function" ? method.bind(target) : method;
    },
  });
}
