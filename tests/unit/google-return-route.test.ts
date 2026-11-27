// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  auth: null,
  db: null,
  firebaseSetupMessage: "",
  isFirebaseConfigured: false,
}));
vi.mock("@/lib/secure-api", () => ({
  bootstrapProfile: vi.fn(),
  syncOwnEmailVerification: vi.fn().mockResolvedValue({ synced: false, emailVerified: false }),
}));

import { POST } from "../../app/api/auth/google-return/route";
import nextConfig from "../../next.config.mjs";
import { resolveGoogleRedirectOriginSuffix } from "../../src/stores/auth-store";

const VALID_ORIGIN = "https://socratic-ai-a7765.firebaseapp.com";
const VALID_STATE = "123e4567-e89b-42d3-a456-426614174000";
const VALID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_part";

function makeRequest(
  body: string,
  options: { origin?: string | null; contentType?: string | null } = {},
): Request {
  const headers: Record<string, string> = {};
  if (options.origin !== null) {
    headers.origin = options.origin ?? VALID_ORIGIN;
  }
  if (options.contentType !== null) {
    headers["content-type"] = options.contentType ?? "application/x-www-form-urlencoded";
  }
  return new Request("https://mindguide-learn.me/api/auth/google-return", {
    method: "POST",
    headers,
    body,
  });
}

describe("google-return route security", () => {
  it("rejects untrusted origins with 403", async () => {
    const response = await POST(
      makeRequest(`state=${VALID_STATE}&token=${VALID_TOKEN}`, {
        origin: "https://evil.example",
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("rejects non-form Content-Type with 415", async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ state: VALID_STATE, token: VALID_TOKEN }), {
        contentType: "application/json",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects oversized bodies above 16 KB with 413", async () => {
    const oversized = `state=${VALID_STATE}&token=${"a".repeat(16_500)}`;
    const response = await POST(makeRequest(oversized));
    expect(response.status).toBe(413);
  });

  it("rejects invalid state or token shapes with 400", async () => {
    const response = await POST(makeRequest("state=bad&token=bad"));
    expect(response.status).toBe(400);
  });

  it("returns strict CSP, COOP same-origin-allow-popups, and safely serialized credentials", async () => {
    const response = await POST(makeRequest(`state=${VALID_STATE}&token=${VALID_TOKEN}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(csp).toContain("frame-ancestors 'none'");

    const html = await response.text();
    expect(html).toContain(JSON.stringify(VALID_STATE));
    expect(html).toContain(JSON.stringify(VALID_TOKEN));
  });
});

describe("custom domain configuration", () => {
  it("resolves Google sign-in fallback suffixes only for allowlisted production origins", () => {
    expect(resolveGoogleRedirectOriginSuffix("https://mindguide-learn.me")).toBe("");
    expect(resolveGoogleRedirectOriginSuffix("https://mindguide-learning.vercel.app")).toBe(".vercel");
    expect(resolveGoogleRedirectOriginSuffix("https://www.mindguide-learn.me")).toBeNull();
    expect(resolveGoogleRedirectOriginSuffix("http://mindguide-learn.me")).toBeNull();
    expect(resolveGoogleRedirectOriginSuffix("https://evil.example")).toBeNull();
  });

  it("redirects www.mindguide-learn.me and mindguide-learning.vercel.app permanently to the apex custom domain", async () => {
    const redirects = await nextConfig.redirects();
    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/:path*",
          has: [{ type: "host", value: "www.mindguide-learn.me" }],
          destination: "https://mindguide-learn.me/:path*",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/:path*",
          has: [{ type: "host", value: "mindguide-learning.vercel.app" }],
          destination: "https://mindguide-learn.me/:path*",
          permanent: true,
        }),
      ]),
    );
  });

  it("defaults hosting/mindguide-google.html to https://mindguide-learn.me with a strict origin allowlist", () => {
    const html = readFileSync(resolve(process.cwd(), "hosting/mindguide-google.html"), "utf8");
    expect(html).toContain('href="https://mindguide-learn.me/login"');
    expect(html).toContain('const PRIMARY_ORIGIN = "https://mindguide-learn.me"');
    expect(html).toContain('const VERCEL_ORIGIN = "https://mindguide-learning.vercel.app"');
    expect(html).toContain("const ALLOWED_ORIGINS = new Set([PRIMARY_ORIGIN, VERCEL_ORIGIN])");
    expect(html).toContain("${targetOrigin}/api/auth/google-return");
  });
});
