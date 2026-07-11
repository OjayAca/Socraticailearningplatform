import { expect, test } from "@playwright/test";

test("loads the public landing page and its authentication routes", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/MINDGUIDE/i);
  await expect(page.getByRole("heading", { name: "MINDGUIDE" })).toBeVisible();
  await expect(page.getByText("Reason Before Reveal")).toBeVisible();

  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await page.goto("/signup");
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: /create.*account/i })).toBeVisible();
});

test("renders a useful catch-all page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /return home/i })).toHaveAttribute(
    "href",
    "/"
  );
});
