/** Run against a production preview; retain the actual browser downloads. */
import { chromium, firefox } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import assert from 'node:assert/strict';

const url = process.argv[2] ?? 'http://127.0.0.1:4327/gnomon/';
const directory = resolve(process.argv[3] ?? 'test-results/browser-prints');
mkdirSync(directory, { recursive: true });
const records = [];
for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      if (route.request().url().startsWith(new URL(url).origin + '/')) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-06-21T19:00:00Z'));
    await page.goto(url);
    await page.locator('.stage-canvas svg').waitFor();
    if (name === 'chromium') await page.screenshot({ path: join(directory, 'hero.png') });
    await page.getByLabel('Latitude', { exact: true }).fill('45');
    await page.getByLabel('Longitude', { exact: true }).fill('0');
    await page.getByLabel('Time zone (IANA)', { exact: true }).fill('UTC');
    await page.getByRole('button', { name: 'Local apparent time', exact: true }).click();
    await page.getByLabel('Dial radius (mm)', { exact: true }).fill('150');
    await page.getByRole('button', { name: 'Full circle', exact: true }).click();
    await page.getByLabel('Date for the simulated shadow').fill('2026-06-21');
    await page.getByLabel('Local time for the simulated shadow').fill('12:00');
    for (const format of ['a4', 'letter']) {
      const ready = page.waitForEvent('download');
      await page.getByRole('button', { name: format === 'a4' ? 'PDF (A4)' : 'PDF (Letter)', exact: true }).click();
      const download = await ready;
      const file = `${name}-north-${format}.pdf`;
      await download.saveAs(join(directory, file));
      const bytes = readFileSync(join(directory, file));
      records.push({ file, format, settings: { radiusMm: 150, latitudeDeg: 45, longitudeDeg: 0, timeMode: 'apparent', timeZone: 'UTC', plateShape: 'circle' }, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    if (name === 'chromium') {
      await page.screenshot({ path: join(directory, 'large-desktop.png') });
      await page.setViewportSize({ width: 375, height: 1000 });
      await page.screenshot({ path: join(directory, 'large-mobile.png') });
      const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Export', exact: true }) });
      await panel.screenshot({ path: join(directory, 'mobile-export.png') });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: 'Fan (classic, no wasted plate)', exact: true }).click();
      await page.getByLabel('Dial radius (mm)', { exact: true }).fill('90');
      for (const type of ['Vertical', 'Equatorial', 'Analemmatic']) {
        await page.goto(url);
        await page.getByRole('button', { name: type, exact: true }).click();
        await page.screenshot({ path: join(directory, `screenshot-${type.toLowerCase()}.png`) });
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await browser.close();
  }
}
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ capture: 'scripts/capture-prints.mjs', records }, null, 2) + '\n');
process.stdout.write(`Retained ${records.length} actual browser PDF downloads in ${directory}\n`);
