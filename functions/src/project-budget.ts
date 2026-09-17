import { database, FieldValue } from "./runtime.js";
import { callableError } from "./errors.js";

/** Hard request ceiling; currency budgets and alerts remain project-owner controls. */
export async function consumeProjectBudget(kind: "aiCalls" | "sessionStarts"): Promise<void> {
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const ref = database.doc(`usage_budgets/${date}`);
  await database.runTransaction(async transaction => {
    const [pilot, usage] = await Promise.all([transaction.get(database.doc("system_settings/pilot")), transaction.get(ref)]);
    const limit = Number(pilot.get(kind === "aiCalls" ? "maxDailyAiCalls" : "maxDailySessionStarts") ?? (kind === "aiCalls" ? 5000 : 500));
    const count = Number(usage.get(kind) ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || count >= limit) throw callableError("resource-exhausted", "project_budget_exhausted", "The pilot has reached its daily request limit. Try again after the daily reset or contact the study administrator.");
    transaction.set(ref, { [kind]: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
