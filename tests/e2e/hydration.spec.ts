import { expect, test } from "@playwright/test";

test("hydrates with extension body attributes and preserves theme selection", async ({ page }) => {
  const renderingErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && /hydrat|didn't match|script tag/i.test(message.text())) {
      renderingErrors.push(message.text());
    }
  });
  page.on("pageerror", error => renderingErrors.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    if (!localStorage.getItem("theme")) localStorage.setItem("theme", "dark");
    // Simulate an extension at document start without interfering with streaming HTML.
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      document.body.setAttribute("data-new-gr-c-s-check-loaded", "14.1331.0");
      document.body.setAttribute("data-gr-ext-installed", "");
      document.body.setAttribute("data-gr-agent-presence-bridge-connection-id", "extension-test");
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveAttribute("data-gr-ext-installed", "");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(renderingErrors).toEqual([]);
});
