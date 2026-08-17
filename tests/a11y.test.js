// Pragyan Institute — Accessibility WCAG 2.1 AA Audit (T6)
// Executable via: npx playwright test tests/a11y.test.js

export async function runA11yAudit(page, AxeBuilder, expect) {
  // 1. Audit Homepage for WCAG 2.1 AA compliance
  await page.goto('/');
  const homeResults = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  expect(homeResults.violations).toEqual([]);

  // 2. Audit Portal Login Modal for WCAG 2.1 AA compliance
  const portalBtn = page.locator('#navPortalLoginBtn, #heroPortalLoginBtn, .open-portal-trigger').first();
  if (await portalBtn.count() > 0) {
    await portalBtn.click();
    await page.locator('#portalOverlay').waitFor({ state: 'visible' });
    const portalResults = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
    expect(portalResults.violations).toEqual([]);
  }
}

export default { runA11yAudit };
