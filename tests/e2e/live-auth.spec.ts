import { expect, test, type Page } from "@playwright/test";

const studentEmail = process.env.MINDGUIDE_E2E_STUDENT_EMAIL;
const studentPassword = process.env.MINDGUIDE_E2E_STUDENT_PASSWORD;
const adminEmail = process.env.MINDGUIDE_E2E_ADMIN_EMAIL;
const adminPassword = process.env.MINDGUIDE_E2E_ADMIN_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
}

test.describe("live Firebase authentication", () => {
  test.skip(
    !studentEmail || !studentPassword,
    "Set MINDGUIDE_E2E_STUDENT_EMAIL and MINDGUIDE_E2E_STUDENT_PASSWORD to run live account tests."
  );

  test("signs a configured student in and signs out cleanly", async ({ page }) => {
    await signIn(page, studentEmail!, studentPassword!);
    await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /sign out|log out/i }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: /sign out|log out/i }).first().click();
    await expect(page).toHaveURL(/\/$|\/login$/, { timeout: 20_000 });
  });

  for (const viewport of [
    { name: "standard desktop", width: 1280, height: 720 },
    { name: "short desktop", width: 1024, height: 480 },
  ]) {
    test(`keeps the full student sidebar visible on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, studentEmail!, studentPassword!);
      await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });

      const sidebar = page.getByRole("complementary");
      const content = page.getByRole("main");
      await expect(sidebar).toBeVisible();

      await content.evaluate((element) => {
        const spacer = document.createElement("div");
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.height = "2000px";
        element.appendChild(spacer);
        element.scrollTop = element.scrollHeight;
      });

      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect
        .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().top))
        .toBe(0);
      await expect
        .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().bottom))
        .toBe(viewport.height);

      await sidebar.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
    });
  }

  test("keeps mobile navigation in the existing drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, studentEmail!, studentPassword!);
    await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });

    await expect(page.getByRole("complementary")).toBeHidden();
    await page.getByRole("button", { name: "Open student navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("link", { name: "History" })).toBeVisible();
  });

  for (const viewport of [
    { name: "desktop", width: 1024, height: 480 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`opens the Profile achievements anchor on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, studentEmail!, studentPassword!);
      await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });

      await page.goto("/student/profile#achievements");
      await expect(page).toHaveURL(/\/student\/profile#achievements$/);

      const achievements = page.getByRole("region", { name: "Achievements" });
      await expect(achievements).toBeVisible();
      await expect.poll(() => achievements.evaluate((target) => {
        const main = target.closest("main");
        if (!main) return false;
        const targetBounds = target.getBoundingClientRect();
        const mainBounds = main.getBoundingClientRect();
        return (
          main.scrollTop > 0 &&
          targetBounds.top >= mainBounds.top &&
          targetBounds.top < mainBounds.bottom
        );
      })).toBe(true);
    });
  }

  test("opens every supporting student screen without page errors", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await signIn(page, studentEmail!, studentPassword!);
    await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });

    for (const [path, heading] of [
      ["/student/history", "Learning history"],
      ["/student/notifications", "Notifications"],
      ["/student/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.goto("/student/profile");
    await expect(page.getByRole("button", { name: /edit name/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("redirects a student away from administrator routes", async ({ page }) => {
    await signIn(page, studentEmail!, studentPassword!);
    await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/student\/dashboard$/, { timeout: 20_000 });
  });
});

test.describe("live administrator supporting features", () => {
  test.skip(
    !adminEmail || !adminPassword,
    "Set MINDGUIDE_E2E_ADMIN_EMAIL and MINDGUIDE_E2E_ADMIN_PASSWORD to run live administrator tests."
  );

  test("signs in, opens every administrator utility, and enforces role routing", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await signIn(page, adminEmail!, adminPassword!);
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 });

    for (const [path, heading] of [
      ["/admin/dashboard", "System Administrator Dashboard"],
      ["/admin/users", "User Account Management"],
      ["/admin/progress", "Learner Progress Analytics"],
      ["/admin/content/problems", "Managed Learning Content"],
      ["/admin/reports", "Reports and Exports"],
      ["/admin/notifications", "Administrator Notifications"],
      ["/admin/logs", "Activity and Legacy AI Logs"],
      ["/admin/settings", "System and Privacy Settings"],
      ["/admin/maintenance", "Maintenance and Cohort Records"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.goto("/admin/profile");
    await expect(page.getByText(/system administrator account/i)).toBeVisible();
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 });
    expect(pageErrors).toEqual([]);
  });

  test("suspends and restores only the dedicated staging student account", async ({ page }) => {
    await signIn(page, adminEmail!, adminPassword!);
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 20_000 });
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Account Management" })).toBeVisible();

    await page.getByPlaceholder(/search name, email/i).fill(studentEmail!);
    const accountRow = page.getByRole("row").filter({ hasText: studentEmail! });
    await expect(accountRow).toBeVisible();

    const activate = accountRow.getByRole("button", { name: "activate", exact: true });
    if (await activate.isVisible().catch(() => false)) {
      await activate.click();
      await expect(page.getByText(/account action 'activate' completed/i)).toBeVisible();
    }

    try {
      const refreshedRow = page.getByRole("row").filter({ hasText: studentEmail! });
      await refreshedRow.getByRole("button", { name: "suspend", exact: true }).click();
      await expect(page.getByText(/account action 'suspend' completed/i)).toBeVisible();
    } finally {
      await page.getByPlaceholder(/search name, email/i).fill(studentEmail!);
      const restoredRow = page.getByRole("row").filter({ hasText: studentEmail! });
      await expect(restoredRow).toBeVisible();
      const restore = restoredRow.getByRole("button", { name: "activate", exact: true });
      if (await restore.isVisible().catch(() => false)) {
        await restore.click();
        await expect(page.getByText(/account action 'activate' completed/i)).toBeVisible();
      }
    }
  });
});

test.skip(
  "Google OAuth requires an interactive provider account and is part of the documented manual live smoke test.",
  async () => {}
);
