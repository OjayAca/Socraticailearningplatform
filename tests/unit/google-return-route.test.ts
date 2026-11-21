// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/auth/google-return/route";

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
  return new Request("https://mindguide-learning.vercel.app/api/auth/google-return", {
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
