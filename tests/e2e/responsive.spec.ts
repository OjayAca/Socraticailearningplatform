import { expect, test, type Page } from "@playwright/test";

const sizes = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 667, height: 375 },
];

async function expectContained(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const containers = [document.documentElement, document.body,
      ...document.querySelectorAll<HTMLElement>("#root, main, .app-shell, .responsive-content, .auth-page, .public-page, .session-viewport")];
    return containers.filter(element => element.scrollWidth > element.clientWidth + 1)
      .map(element => element.className || element.tagName);
  })).toEqual([]);
  // Also detect clipped controls even when an ancestor suppresses overflow.
  const outside = await page.locator("input, select, textarea, button").evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || element.closest(".table-scroll, math-field")) return false;
    return box.left < -1 || box.right > window.innerWidth + 1;
  }).map(element => element.getAttribute("aria-label") || element.textContent || element.tagName));
  expect(outside).toEqual([]);
}

for (const size of sizes) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size, colorScheme: "light", isMobile: size.width < 768, hasTouch: size.width < 1024 });

    test("public and authentication pages fit and remain scrollable", async ({ page }) => {
      for (const route of ["/", "/login", "/signup", "/not-a-real-page"]) {
        await page.goto(route);
        await expect(page.locator("h1, h2").first()).toBeVisible();
        await page.locator("h1, h2").first().evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(document.getAnimations()
            .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {})));
        });
        await expectContained(page);
        if (route === "/" && [320, 390, 1280].includes(size.width)) {
          await page.screenshot({ path: test.info().outputPath("responsive-landing.png") });
        }
        if (route === "/login" || route === "/signup") {
          const google = page.getByRole("button", { name: "Google", exact: true });
          await google.scrollIntoViewIfNeeded();
          await expect(google).toBeInViewport();
          const input = page.locator("input").first();
          await input.focus();
          await expect(input).toBeInViewport();
          if (size.width < 768) {
            expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
          }
          await input.fill("long-input-for-mobile-layout-check".repeat(4));
          await expectContained(page);
        }
      }
      await page.goto("/");
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expectContained(page);
    });

    for (const role of ["student", "admin"] as const) {
      test(`${role} screens and navigation fit using a configured real account`, async ({ page }) => {
        test.setTimeout(120_000);
        const email = process.env[`MINDGUIDE_E2E_${role.toUpperCase()}_EMAIL`];
        const password = process.env[`MINDGUIDE_E2E_${role.toUpperCase()}_PASSWORD`];
        test.skip(!email || !password, `Real ${role} credentials are not configured; no demo data is created.`);
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(email!);
        await page.locator('input[type="password"]').fill(password!);
        await page.getByRole("button", { name: /^log in$/i }).click();
        await expect(page).toHaveURL(new RegExp(`/${role}/dashboard$`), { timeout: 20_000 });
        if (size.width < 768) {
          const trigger = page.getByRole("button", { name: `Open ${role === "admin" ? "administrator" : "student"} navigation` });
          await trigger.click();
          const drawer = page.getByRole("dialog");
          await expect(drawer).toBeVisible();
          const close = drawer.getByRole("button", { name: "Close", exact: true });
          const closeBounds = await close.boundingBox();
          expect(closeBounds?.width).toBeGreaterThanOrEqual(44);
          expect(closeBounds?.height).toBeGreaterThanOrEqual(44);
          const signOut = drawer.getByRole("button", { name: "Sign out" });
          await signOut.scrollIntoViewIfNeeded();
          await expect(signOut).toBeInViewport();
          await signOut.focus();
          await page.keyboard.press("Tab");
          expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
          await page.keyboard.press("Escape");
          await expect(drawer).toBeHidden();
          await expect(trigger).toBeFocused();
          await trigger.click();
          await drawer.getByRole("link", { name: "Profile", exact: true }).click();
          await expect(drawer).toBeHidden();
        } else {
          await expect(page.getByRole("complementary")).toBeVisible();
        }
        const routes = role === "student"
          ? ["dashboard", "task", "history", "profile", "settings", "notifications"]
          : ["dashboard", "users", "progress", "content/subjects", "content/topics", "content/problems", "content/formula_theorem_references", "content/socratic_prompt_bank", "content/misconception_categories", "content/difficulty_policies", "reports", "reports/print", "logs", "settings", "maintenance", "profile", "notifications"];
        for (const route of routes) {
          await page.goto(`/${role}/${route}`);
          await expect(page.locator("main")).toBeVisible();
          await expect(page.getByRole("status", { name: /loading/i })).toHaveCount(0);
          await expectContained(page);
          const tables = page.locator(".table-scroll");
          for (const table of await tables.all()) {
            await expect(table).toHaveAttribute("tabindex", "0");
            await expect(table).toHaveAttribute("aria-label", /table/);
          }
        }
        if (role === "admin") {
          for (const [route, id] of [
            ["progress", process.env.MINDGUIDE_E2E_LEARNER_ID],
            ["review", process.env.MINDGUIDE_E2E_SESSION_ID],
          ]) {
            if (!id) {
              test.info().annotations.push({ type: "coverage gap", description: `No existing record configured for admin/${route}.` });
              continue;
            }
            await page.goto(`/admin/${route}/${encodeURIComponent(id)}`);
            await expect(page.locator("main")).toBeVisible();
            await expect(page.getByRole("status", { name: /loading/i })).toHaveCount(0);
            await expectContained(page);
          }
        }
      });
    }

    test("existing learning and review records fit without submitting changes", async ({ page }) => {
      const email = process.env.MINDGUIDE_E2E_STUDENT_EMAIL;
      const password = process.env.MINDGUIDE_E2E_STUDENT_PASSWORD;
      const sessionId = process.env.MINDGUIDE_E2E_SESSION_ID;
      test.skip(!email || !password || !sessionId, "Requires a real student and an existing active session; no sessions are created.");
      await page.goto("/login");
      await page.locator('input[type="email"]').fill(email!);
      await page.locator('input[type="password"]').fill(password!);
      await page.getByRole("button", { name: /^log in$/i }).click();
      await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });
      await page.goto(`/session/${encodeURIComponent(sessionId!)}/learn`);
      await expect(page.getByRole("textbox", { name: "Message your tutor" })).toBeVisible();
      await page.getByText("Session details", { exact: true }).click();
      await page.getByRole("button", { name: "Add equation", exact: true }).click();
      await expectContained(page);
      await page.getByRole("textbox", { name: "Message your tutor" }).focus();
      await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
      await page.setViewportSize({ width: size.width, height: 360 });
      await expectContained(page);
      await page.getByRole("button", { name: "Send message" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
      await page.setViewportSize(size);
      await page.goto(`/student/review/${encodeURIComponent(sessionId!)}`);
      await expect(page.locator("main")).toBeVisible();
      await expectContained(page);
    });
  });
}
