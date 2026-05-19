import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env["VERIFIER_USER"] ?? "admin";
const ADMIN_PASS = process.env["VERIFIER_PASS"] ?? "admin123";

test("ERP /verifier runs all checks and every one passes", async ({ page, baseURL }) => {
  test.setTimeout(180_000);

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser:error]", msg.text());
  });

  // 1. Log in via the ERP login form so the auth context is populated.
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN_USER);
  await page.getByLabel("Password").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /sign in/i }).click();

  // After successful login the app redirects to "/" (the ERP root).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

  // 2. Navigate to the verifier page.
  await page.goto("/verifier");
  const runBtn = page.getByTestId("run-verifier");
  await expect(runBtn).toBeVisible();

  // 3. Click "Run all checks" and wait for the run to actually finish.
  // The verifier UI:
  //   - disables the button and changes its label to "Running…" while running
  //   - re-enables the button and changes the label back to "Run all checks"
  //     only when every section has finished
  await runBtn.click();
  await expect(runBtn).toContainText(/running/i, { timeout: 30_000 });
  await expect(runBtn).toBeDisabled();
  await expect(runBtn).toBeEnabled({ timeout: 150_000 });
  await expect(runBtn).toContainText(/run all checks/i);

  // Defensive: also assert no section card is still in the "running" state.
  // Each section card uses a spinning Loader2 icon (animate-spin) only while
  // its checks are in flight.
  await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10_000 });

  // 4. Read the summary line "<passed>/<total> checks passed" from the UI.
  const summary = page.locator("text=/^\\s*\\d+\\/\\d+ checks passed\\s*$/");
  await expect(summary).toBeVisible({ timeout: 10_000 });
  const summaryText = (await summary.innerText()).trim();
  const m = summaryText.match(/^(\d+)\/(\d+)\s+checks passed$/);
  if (!m) throw new Error(`Could not parse verifier summary: "${summaryText}"`);
  const passed = Number(m[1]);
  const total = Number(m[2]);

  console.log(`Verifier summary: ${passed}/${total} (baseURL=${baseURL})`);

  // 5. Collect any failing rows so the failure message is actionable.
  const allRows = page.locator('li[data-testid^="check-"]');
  const rowCount = await allRows.count();

  // Cross-check: the rendered list must match the summary "X/Y" total. If
  // these disagree, the run finished mid-flight or the DOM is stale.
  expect(rowCount, `rendered rows (${rowCount}) != summary total (${total})`).toBe(total);

  const failingRows: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row = allRows.nth(i);
    // A failing row contains the red XCircle icon (text-red-500).
    const isFail = (await row.locator("svg.text-red-500").count()) > 0;
    if (isFail) failingRows.push((await row.innerText()).trim());
  }

  if (failingRows.length > 0) {
    console.log(`Failing checks (${failingRows.length}):`);
    for (const r of failingRows) console.log(`  - ${r.replace(/\n+/g, " | ")}`);
  }

  // Every check must pass.
  expect(failingRows, `Failing checks:\n${failingRows.join("\n---\n")}`).toEqual([]);
  expect(passed, `Expected all checks to pass, got ${passed}/${total}`).toBe(total);

  // The verifier ships with 53 checks today; allow growth but never silent regression.
  // Bump this floor whenever new checks are added so the e2e smoke catches
  // accidental check removals.
  expect(total, `Expected at least 53 verifier checks, got ${total}`).toBeGreaterThanOrEqual(53);
});
