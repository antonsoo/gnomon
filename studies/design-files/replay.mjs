/** Actual production-browser downloads, offline reopening, and served-byte receipts.
 * node studies/design-files/replay.mjs http://127.0.0.1:4319/gnomon/ NEW_OUTPUT
 */
import { chromium, firefox, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { log } from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const [url, outputArg] = process.argv.slice(2);
if (!url || !outputArg) throw new Error('Supply the production URL and a new output directory.');
const output = resolve(outputArg);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = new URL(url).origin;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output);
const records = [];
const served = new Map();
const transfers = [];
const transferErrors = [];
async function download(page, name) {
  const [result] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name, exact: true }).click()]);
  const bytes = await readFile(await result.path());
  return { name: result.suggestedFilename(), bytes, sha256: sha(bytes) };
}
for (const [engine, launcher] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const width of [1440, 375]) {
      const key = `${engine}-${width}`;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: engine === 'firefox' ? 'Asia/Tokyo' : 'UTC', deviceScaleFactor: 1 });
      context.setDefaultTimeout(15000);
      const page = await context.newPage();
      const errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (route.request().url().startsWith(origin + '/')) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      page.on('response', response => {
        if (response.status() !== 200 || !response.url().startsWith(origin + '/')) return;
        transfers.push(response.body().then(bytes => {
          const path = new URL(response.url()).pathname;
          const record = { path, bytes: bytes.length, sha256: sha(bytes) };
          const old = served.get(path);
          if (old) expect(old).toEqual(record);
          served.set(path, record);
        }).catch(error => transferErrors.push(error.message)));
      });
      await page.clock.setFixedTime(new Date('2026-07-01T19:17:42Z'));
      await page.goto(url);
      await page.locator('.stage-canvas svg').waitFor();
      await page.getByLabel('Gnomon design file', { exact: true }).setInputFiles(join(root, 'examples/designs/rome-wall.gnomon.json'));
      await expect(page.locator('#design-file-status')).toContainText('Opened');
      const before = await download(page, 'Download SVG');
      const gnomonBefore = await download(page, 'Gnomon SVG');
      const saved = await download(page, 'Save design');
      const pdfBefore = key === 'chromium-1440' ? await download(page, 'PDF (A4)') : null;
      await page.evaluate(() => document.fonts.ready);
      await Promise.all(transfers);
      expect(transferErrors).toEqual([]);
      await page.reload();
      await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('37.7749');
      await page.evaluate(() => document.fonts.ready);
      if (pdfBefore) await download(page, 'PDF (A4)'); // Load the PDF module in this new page before going offline.
      await context.setOffline(true);
      await page.getByLabel('Gnomon design file', { exact: true }).setInputFiles({ name: 'Rome.gnomon.json', mimeType: 'application/json', buffer: saved.bytes });
      await expect(page.locator('#design-file-status')).toContainText('Opened Rome.gnomon.json');
      await expect(page.getByLabel('Wall declination from south (°)', { exact: true })).toHaveValue('25');
      await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('180');
      await expect(page.getByLabel('Date for the simulated shadow')).toHaveValue('2026-01-15');
      await expect(page.getByLabel('Local time for the simulated shadow')).toHaveValue('12:00');
      const after = await download(page, 'Download SVG');
      const gnomonAfter = await download(page, 'Gnomon SVG');
      const savedAgain = await download(page, 'Save design');
      expect(after.bytes.equals(before.bytes)).toBe(true);
      expect(gnomonAfter.bytes.equals(gnomonBefore.bytes)).toBe(true);
      expect(savedAgain.bytes.equals(saved.bytes)).toBe(true);
      let pdfAfter = null;
      if (pdfBefore) {
        // The PDF chunk was loaded before going offline and remains available.
        pdfAfter = await download(page, 'PDF (A4)');
        for (const [name, bytes] of [
          ['rome.gnomon.json', saved.bytes], ['plate-before.svg', before.bytes], ['plate-after.svg', after.bytes],
          ['gnomon-before.svg', gnomonBefore.bytes], ['gnomon-after.svg', gnomonAfter.bytes],
          ['construction-before.pdf', pdfBefore.bytes], ['construction-after.pdf', pdfAfter.bytes],
        ]) await writeFile(join(output, name), bytes);
      }
      await page.evaluate(() => document.fonts.ready);
      if (width === 375) await page.locator('#settings').evaluate(node => node.scrollIntoView({ block: 'start' }));
      else await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(output, `${key}.png`) });
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(errors).toEqual([]); expect(external).toEqual([]);
      await Promise.all(transfers);
      expect(transferErrors).toEqual([]);
      records.push({ profile: key, timezone: engine === 'firefox' ? 'Asia/Tokyo' : 'UTC', reopenedOffline: true,
        designSha256: saved.sha256, designBytes: saved.bytes.length, designResaveIdentical: true,
        plateSha256: before.sha256, gnomonSha256: gnomonBefore.sha256, svgBytesIdentical: true,
        ...(pdfBefore ? { pdfBeforeSha256: pdfBefore.sha256, pdfAfterSha256: pdfAfter.sha256 } : {}),
        dimensions, uncaughtErrors: errors, offOriginRequests: external });
      await context.close();
      log(key, 'restored design and SVG exports unchanged');
    }
  } finally { await browser.close(); }
}
await writeFile(join(output, 'browser.json'), JSON.stringify({ label: 'Constructed Rome wall example; no physical assembly is claimed.', records, served: [...served.values()].sort((a,b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
