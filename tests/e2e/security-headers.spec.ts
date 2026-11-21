import { expect, test } from "@playwright/test";

test("applies security headers and tailored CSP without console errors on public routes", async ({
  page,
}) => {
  const cspViolations: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations?: string[] }).__cspViolations ??= [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}:${event.blockedURI}`,
      );
    });
  });

  for (const path of ["/", "/login", "/signup"]) {
    const response = await page.goto(path);
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
    expect(headers["permissions-policy"]).toContain("camera=(self)");

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("frame-src 'self' https://*.firebaseapp.com");
    expect(csp).toContain("https://www.recaptcha.net");
    expect(csp).toContain("frame-ancestors 'none'");

    const recorded = await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
    cspViolations.push(...recorded);
  }

  expect(cspViolations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("enforces strict defensive headers on /api/learning", async ({ request }) => {
  const response = await request.post("/api/learning", {
    data: { operation: "startLearningSession" },
  });
  expect(response.status()).toBe(401);
  const headers = response.headers();
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
});
