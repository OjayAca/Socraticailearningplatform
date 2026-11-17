import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`protects administrator routes when signed out at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of ["dashboard", "users", "progress", "content/problems", "reports", "notifications", "logs", "maintenance", "profile", "settings"]) {
      await page.goto(`/admin/${route}`);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    }
  });
}

test("loads the public landing page and its authentication routes", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/MINDGUIDE/i);
  await expect(
    page.getByRole("heading", {
      name: /learn to solve it.*not just see the answer/i,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Reason Before Reveal", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /practice the process/i })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /four stages between the problem and the reveal/i,
    })
  ).toBeVisible();
  await expect(
    page.getByText(/Automated practice feedback is not an official grade/i)
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Start learning", exact: true }).first()
  ).toHaveAttribute("href", "/signup");

  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await page.goto("/signup");
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: /create.*account/i })).toBeVisible();
});

test("supports public theme switching and section navigation", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Switch to dark theme" })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "Switch to light theme" })
  ).toBeVisible();

  const workflowLink = page.getByRole("link", { name: "How it works" });
  await expect(workflowLink).toHaveAttribute("href", "#how-it-works");
  await workflowLink.click();
  await expect(page).toHaveURL(/#how-it-works$/);
});

test("keeps the primary public actions available on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /learn to solve it.*not just see the answer/i,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start learning", exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }).first()
  ).toBeVisible();
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`keeps the landing topbar visible through the end on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");

    const header = page.locator("header");
    await header.evaluate((element) => {
      let scrollContainer = element.parentElement;

      while (
        scrollContainer &&
        !["auto", "scroll"].includes(
          getComputedStyle(scrollContainer).overflowY
        )
      ) {
        scrollContainer = scrollContainer.parentElement;
      }

      if (!scrollContainer) {
        throw new Error("Landing page scroll container was not found");
      }

      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });

    await expect(header).toBeInViewport();
    await expect
      .poll(async () => header.evaluate((element) => element.getBoundingClientRect().top))
      .toBe(0);
    await expect(
      header.getByRole("button", { name: /switch to (dark|light) theme/i })
    ).toBeEnabled();
    await expect(
      header.getByRole("link", { name: "Log in", exact: true })
    ).toBeVisible();

    if (viewport.name === "desktop") {
      await expect(
        header.getByRole("link", { name: "How it works" })
      ).toBeVisible();
      await expect(
        header.getByRole("link", { name: "Start learning", exact: true })
      ).toBeVisible();
    }
  });
}

test("renders a useful catch-all page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /return home/i })).toHaveAttribute(
    "href",
    "/"
  );
});

test("enforces accessible touch targets, keyboard focus, inline form errors, and reduced-motion safety", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // Header controls meet 44px touch target height and are keyboard reachable.
  const themeButton = page.getByRole("button", { name: /switch to (dark|light) theme/i });
  const headerLinks = await page.locator("header a, header button").all();
  for (const control of headerLinks) {
    if (await control.isVisible()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  const firstHeaderControl = page.locator("header a, header button").first();
  await firstHeaderControl.focus();
  await expect(firstHeaderControl).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("a:focus, button:focus").first()).toBeVisible();
  await themeButton.focus();
  await expect(themeButton).toBeFocused();

  // Login allows submission for inline accessible field validation without pre-disabling.
  await page.goto("/login");
  const backHome = page.getByRole("link", { name: /back to home/i });
  expect((await backHome.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const submitButton = page.getByRole("button", { name: /^log in$/i });
  await expect(submitButton).toBeEnabled();
  expect((await submitButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await submitButton.click();

  const emailInput = page.getByLabel("Email");
  const passwordInput = page.getByRole("textbox", { name: "Password" });
  await expect(emailInput).toHaveAttribute("aria-invalid", "true");
  await expect(passwordInput).toHaveAttribute("aria-invalid", "true");
  const describedBy = await emailInput.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText("Please enter your email address.");
});
