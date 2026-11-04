import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_CLERK_USER_EMAIL;

test("signed out: landing renders and the dashboard asks to sign in (AC-1)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("square you can see");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in|accounts\.dev/);
});

test("signed in: start, reload and discard a focus session (AC-1, AC-3, AC-7)", async ({ page }) => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev user");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email! });

  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);

  // A failed earlier run can leave a session behind; clear it first.
  page.on("dialog", (d) => d.accept());
  const discard = page.getByRole("button", { name: "Discard session" });
  if (await discard.isVisible()) await discard.click();

  // Background sound control (spec 0002 AC-1): labelled picker and slider, slider off when sound is Off.
  const picker = page.getByRole("combobox", { name: "Background sound" });
  const slider = page.getByRole("slider", { name: "Sound volume" });
  await picker.selectOption("OFF");
  await expect(slider).toBeDisabled();
  await picker.selectOption("BROWN");
  await expect(slider).toBeEnabled();
  await picker.selectOption("OFF");

  await page.getByRole("button", { name: "25m" }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByText("Focusing")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Focusing")).toBeVisible();

  await discard.click();
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
});
