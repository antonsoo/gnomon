import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

for (const width of [375, 1440]) for (const latitude of ['37.7749', '-33.9']) {
  test(`both equatorial faces download offline at ${latitude}, ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [], external = [];
    const allowedPrefix = new URL('./', testInfo.project.use.baseURL).href;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(allowedPrefix) && !/^(blob|data):/.test(request.url())) external.push(request.url());
    });
    await page.clock.setFixedTime(new Date('2026-12-21T20:00:00Z'));
    await page.goto('./');
    await page.getByLabel('Latitude', { exact: true }).fill(latitude);
    await page.getByRole('button', { name: 'Equatorial', exact: true }).click();
    await page.getByRole('button', { name: 'Local apparent time', exact: true }).click();
    await page.getByLabel('Dial radius (mm)', { exact: true }).fill('80');
    const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Export', exact: true }) });
    await expect(panel).toContainText('3 pages total — pole face 1 sheet; opposite face 1 sheet; rod gauge 1 sheet');
    await expect(panel).toContainText('SVG/PNG use that face; PDFs include both faces');
    await context.setOffline(true);
    for (const format of ['A4', 'Letter']) {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: `PDF (${format})`, exact: true }).click();
      const download = await pending;
      await download.saveAs(testInfo.outputPath(`${format.toLowerCase()}-compact.pdf`));
      const bytes = await readFile(await download.path());
      const text = bytes.toString('latin1');
      expect(text).toContain('/Count 3');
      expect(text).toContain('P | Pole-facing face');
      expect(text).toContain('O | Opposite face');
      expect(text).toContain('exposed on EACH side');
      expect(text.match(/100 mm calibration - verify before cutting/g)).toHaveLength(3);
      const north = Number(latitude) > 0;
      expect(text.indexOf(north ? 'March equinox to September equinox' : 'September equinox to March equinox')).toBeLessThan(text.indexOf('O | Opposite face'));
      await testInfo.attach(download.suggestedFilename(), { body: bytes, contentType: 'application/pdf' });
    }
    await page.getByLabel('Dial radius (mm)', { exact: true }).fill('150');
    await page.getByRole('button', { name: 'Full circle', exact: true }).click();
    await expect(panel).toContainText('11 pages total — pole face 4 sheets (2 across, 2 down) + guide; opposite face 4 sheets (2 across, 2 down) + guide; rod gauge 1 sheet');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PDF (A4)', exact: true }).click();
    const large = await pending;
    await large.saveAs(testInfo.outputPath('a4-tiled.pdf'));
    const bytes = await readFile(await large.path());
    const text = bytes.toString('latin1');
    expect(text).toContain('/Count 11');
    expect(text).toContain('P-R1C1');
    expect(text).toContain('O-R1C1');
    expect(text).toContain('page 10 of 11');
    await testInfo.attach(large.suggestedFilename(), { body: bytes, contentType: 'application/pdf' });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    await testInfo.attach('equatorial-export.png', { body: await panel.screenshot({ path: testInfo.outputPath('equatorial-export.png') }), contentType: 'image/png' });
  });
}
