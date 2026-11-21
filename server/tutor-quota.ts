import { ensure, ServiceError, type Env, type RecordDoc, type Store } from "./platform";

/**
 * Computes the current UTC minute bucket and Pacific-day quota window used by Gemini rate limits.
 *
 * @param nowMs - Current epoch milliseconds.
 * @returns Object containing the integer minute bucket and YYYY-MM-DD Pacific date string.
 */
export function currentQuotaWindow(nowMs = Date.now()): { minute: number; day: string } {
  const minute = Math.floor(nowMs / 60000);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
  return { minute, day };
}

/**
 * Parses an optional positive integer environment setting, returning a fallback if unset or invalid.
 *
 * @param rawValue - Environment variable string value.
 * @param fallback - Default positive integer to return when unset.
 * @returns Parsed positive safe integer or fallback.
 */
export function positiveIntOrDefault(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Shared by learning requests and bounded operator diagnostics. No uncertain call refunds. */
export async function reserveTutorQuota(
  db: Store,
  env: Env,
  uid?: string,
): Promise<Array<{ doc: RecordDoc; data: Record<string, unknown> }>> {
  const rpm = Number(env.GEMINI_RPM), tpm = Number(env.GEMINI_TPM), rpd = Number(env.GEMINI_RPD);
  ensure([rpm, tpm, rpd].every(n => Number.isSafeInteger(n) && n > 0), "Configure the verified Gemini Free quotas before opening AI practice.", 503);
  const quota = await db.get("ai_usage/shared");
  const { minute, day } = currentQuotaWindow();
  const requests = quota.data?.minute === minute ? quota.data.requests : 0;
  const tokens = quota.data?.minute === minute ? quota.data.tokens : 0;
  const daily = quota.data?.day === day ? quota.data.daily : 0;
  ensure(requests + 1 <= rpm && tokens + 32000 <= tpm && daily + 1 <= rpd, "The shared free AI allowance is in use. Your work is preserved; try again later.", 429);

  const writes: Array<{ doc: RecordDoc; data: Record<string, unknown> }> = [
    { doc: quota, data: { minute, day, requests: requests + 1, tokens: tokens + 32000, daily: daily + 1 } },
  ];

  const userRpm = positiveIntOrDefault(env.USER_GEMINI_RPM, 0);
  const userRpd = positiveIntOrDefault(env.USER_GEMINI_RPD, 0);
  if (uid && (userRpm > 0 || userRpd > 0)) {
    const userQuota = await db.get(`ai_usage/user_${uid}`);
    const userRequests = userQuota.data?.minute === minute ? Number(userQuota.data.requests ?? 0) : 0;
    const userDaily = userQuota.data?.day === day ? Number(userQuota.data.daily ?? 0) : 0;
    if ((userRpm > 0 && userRequests + 1 > userRpm) || (userRpd > 0 && userDaily + 1 > userRpd)) {
      throw new ServiceError(
        429,
        "ai-quota",
        "Your personal AI tutor rate limit has been reached. Wait a moment and try again; your work is preserved.",
        60,
      );
    }
    writes.push({
      doc: userQuota,
      data: { minute, day, requests: userRequests + 1, daily: userDaily + 1 },
    });
  }

  return writes;
}
