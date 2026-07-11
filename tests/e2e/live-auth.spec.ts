import { expect, test, type Page } from "@playwright/test";

const studentEmail = process.env.MINDGUIDE_E2E_STUDENT_EMAIL;
const studentPassword = process.env.MINDGUIDE_E2E_STUDENT_PASSWORD;

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
});

test.skip(
  "Google OAuth requires an interactive provider account and is part of the documented manual live smoke test.",
  async () => {}
);
