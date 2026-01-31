const { test, expect } = require('@playwright/test');
// FIX: Needed to create screenshot folders reliably on all OSes.
const fs = require('fs');
const path = require('path');
// FIX: Load test cases from the provided Excel file (data-driven execution).
const { loadTestCasesFromXlsx } = require('./testCaseLoader');

// FIX: Data-driven test cases from Excel. Map columns to: id, category, input, expected.
const testCases = loadTestCasesFromXlsx(path.join(__dirname, '..', 'csv', 'IT23824188.ITPMnew.xlsx'));
if (testCases.length === 0) throw new Error('No test cases loaded from the Excel file.');

for (const data of testCases) {
  test(`${data.id}: ${data.category}`, async ({ page }) => {
    // FIX: Use baseURL from config and wait for DOM to be ready.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Fill the Singlish input box
    // FIX: Correct selectors (site uses a textbox + output text element, not two textareas).
    const input = page.getByPlaceholder('Input Your Singlish Text Here.');
    const output = page.getByText('Sinhala', { exact: true }).locator('xpath=following-sibling::*[1]');
    await input.fill(data.input);

    // Wait for completion
    // FIX: Output updates in real-time (no submit button) so we wait for stable expected output.
    if (data.id.startsWith('Neg_')) {
      await expect(output).not.toHaveText('', { timeout: 15000 });
    } else {
      await expect
        .poll(async () => (await output.textContent())?.trim() ?? '', { timeout: 15000 })
        .toContain(data.expected);
    }

    const imagePath = path.join('screenshots', data.category, `${data.id}.png`);
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    await page.screenshot({ path: imagePath });
    await test.info().attach(data.id, { path: imagePath, contentType: 'image/png' });

    // Grab the translated text from the output area
    const outputText = (await output.textContent()) ?? '';

    if (data.id.startsWith('Neg_')) {
      // FIX: Negative cases should demonstrate a mismatch (system fails/behaves incorrectly).
      expect(outputText.trim()).not.toBe(data.expected.trim());
    } else {
      // Positive cases must contain the expected translation
      expect(outputText).toContain(data.expected);
    }
  });
}
