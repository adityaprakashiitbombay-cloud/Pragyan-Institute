// Pragyan Institute — Visual Regression Tests (T5)
// Executable via: npx playwright test tests/visual.test.js

const viewports = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 8', width: 375, height: 667 },
  { name: 'iPhone 11', width: 414, height: 896 },
  { name: 'iPad Tablet', width: 768, height: 1024 },
  { name: 'Laptop', width: 1280, height: 720 },
  { name: 'Desktop HD', width: 1920, height: 1080 }
];

export async function runVisualChecks(page, expect) {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page).toHaveScreenshot(`home-${vp.width}x${vp.height}.png`, { fullPage: true });
  }
}

// Module export for test runner integration
export default { viewports, runVisualChecks };
