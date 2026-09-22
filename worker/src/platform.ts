export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  ALLOWED_ORIGINS: string;
  AI_ENABLED: string;
  AI_FREE_TIER_CONFIRMED: string;
  GEMINI_RPM: string;
  GEMINI_TPM: string;
  GEMINI_RPD: string;
  OPERATOR_UID?: string;
}

export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter = 0) { super(message); }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new ServiceError(status, status === 409 ? "conflict" : "invalid-request", message);
}
const enc = new TextEncoder();
const b64url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const decode64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const json64 = (value: unknown) => b64url(enc.encode(JSON.stringify(value)));
export async function digest(value: unknown) { return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(value))))); }

let certificateCache: { expires: number; keys: Array<JsonWebKey & { kid: string }> } | undefined;
export async function authenticate(request: Request, env: Env): Promise<string> {
  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
    ensure(token && token.length < 16000, "Sign in again to continue.", 401);
    const parts = token.split(".");
    ensure(parts.length === 3, "Invalid sign-in token.", 401);
    const header = JSON.parse(new TextDecoder().decode(decode64(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode64(parts[1])));
    const now = Date.now() / 1000;
    ensure(header.alg === "RS256" && typeof header.kid === "string" && claims.aud === env.FIREBASE_PROJECT_ID
      && claims.iss === `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
      && typeof claims.sub === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(claims.sub)
      && claims.exp > now && claims.iat <= now + 30 && claims.auth_time <= now + 30, "Your sign-in session expired. Sign in again.", 401);
    if (!certificateCache || certificateCache.expires < Date.now()) {
      const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { signal: AbortSignal.timeout(10000) });
      ensure(response.ok, "Sign-in verification is temporarily unavailable.", 503);
      certificateCache = { ...await response.json() as { keys: Array<JsonWebKey & { kid: string }> }, expires: Date.now() + 3600000 };
    }
    const jwk = certificateCache.keys.find(key => key.kid === header.kid);
    ensure(jwk, "Sign-in key has changed. Retry shortly.", 401);
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ensure(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode64(parts[2]), enc.encode(parts.slice(0, 2).join("."))), "Invalid sign-in token.", 401);
    return claims.sub;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(401, "unauthenticated", "Your sign-in could not be verified. Sign in again.");
  }
}

let parsedServiceAccount: { raw: string; account: any; signingKey?: CryptoKey } | undefined;
let accessToken: { email: string; token: string; expires: number } | undefined;
async function serviceToken(env: Env): Promise<string> {
  if (!parsedServiceAccount || parsedServiceAccount.raw !== env.FIREBASE_SERVICE_ACCOUNT) {
    parsedServiceAccount = { raw: env.FIREBASE_SERVICE_ACCOUNT, account: JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) };
  }
  const account = parsedServiceAccount.account;
  ensure(account.project_id === env.FIREBASE_PROJECT_ID, "Backend project configuration mismatch.", 503);
  if (accessToken && accessToken.email === account.client_email && accessToken.expires > Date.now()) return accessToken.token;
  const now = Math.floor(Date.now() / 1000);
  const input = `${json64({ alg: "RS256", typ: "JWT" })}.${json64({ iss: account.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  if (!parsedServiceAccount.signingKey) {
    const der = decode64(account.private_key.replace(/-----[^-]+-----|\s/g, ""));
    parsedServiceAccount.signingKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  }
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", parsedServiceAccount.signingKey, enc.encode(input))));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }), signal: AbortSignal.timeout(10000) });
  const result = await response.json() as { access_token?: string };
  ensure(response.ok && result.access_token, "Backend database authentication is unavailable.", 503);
  accessToken = { email: account.client_email, token: result.access_token, expires: Date.now() + 3300000 };
  return result.access_token;
}

type Value = Record<string, any>;
export function encode(value: any): Value {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)])) } };
}
export function decode(value: Value): any {
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([k, v]) => [k, decode(v as Value)]));
}
export interface RecordDoc { path: string; data: any; version?: string }
export interface Store {
  get(path: string): Promise<RecordDoc>;
  query(collection: string, field?: string, value?: unknown): Promise<RecordDoc[]>;
  commit(writes: Array<{ doc: RecordDoc; data: any }>): Promise<void>;
}
export class Firestore implements Store {
  private root: string;
  constructor(private env: Env) { this.root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`; }
  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://firestore.googleapis.com/v1/${this.root}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await serviceToken(this.env)}` }, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return null;
    if ([409, 412].includes(response.status)) throw new ServiceError(409, "conflict", "This session changed. Reload and retry.");
    if (!response.ok) throw new ServiceError(503, "database-unavailable", "Learning storage is temporarily unavailable. Your saved work is preserved.");
    return response.json() as Promise<any>;
  }
  async get(path: string): Promise<RecordDoc> {
    const result = await this.request(`/${path}`);
    return { path, data: result ? decode({ mapValue: { fields: result.fields } }) : null, version: result?.updateTime };
  }
  async query(collection: string, field?: string, value?: unknown): Promise<RecordDoc[]> {
    const segments = collection.split("/"); const collectionId = segments.pop()!;
    const result = await this.request(`${segments.length ? "/" + segments.join("/") : ""}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: encode(value) } } } : {}) } }) });
    return (result ?? []).filter((item: any) => item.document).map(({ document }: any) => ({ path: document.name.slice(this.root.length + 1), data: decode({ mapValue: { fields: document.fields } }), version: document.updateTime }));
  }
  async commit(writes: Array<{ doc: RecordDoc; data: any }>) {
    await this.request(":commit", { method: "POST", body: JSON.stringify({ writes: writes.map(({ doc, data }) => ({ update: { name: `${this.root}/${doc.path}`, fields: encode(data).mapValue.fields }, currentDocument: doc.version ? { updateTime: doc.version } : { exists: false } })) }) });
  }
}
