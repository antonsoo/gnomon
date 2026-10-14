/** Fresh-page PDF downloads. Each context exports its first PDF independently.
 * node studies/offline-pdf/replay.mjs URL NEW_OUTPUT online|offline
 */
import { chromium, firefox, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { log } from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { gzipSync } from 'node:zlib';

const [url, outputArg, mode] = process.argv.slice(2);
if (!url || !outputArg || !['online', 'offline'].includes(mode)) throw new Error('Supply URL, a new output directory, and online|offline.');
const output = resolve(outputArg);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = new URL(url).origin;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output);
const records = [];
const served = new Map();
for (const [engine, launcher] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await launcher.launch();
  try {
    for (const width of [1440, 375]) {
      for (const format of ['A4', 'Letter']) {
        const profile = `${engine}-${width}-${format.toLowerCase()}`;
        const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'UTC', deviceScaleFactor: 1 });
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        const errors = [], external = [], pending = [], responseErrors = [], initial = new Map(), afterDisconnect = [];
        let disconnected = false;
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (disconnected && request.url().startsWith('http')) afterDisconnect.push(request.url()); });
        await page.route('**/*', route => {
          if (route.request().url().startsWith(origin + '/')) return route.continue();
          external.push(route.request().url());
          return route.abort();
        });
        page.on('response', response => {
          if (response.status() !== 200 || !response.url().startsWith(origin + '/')) return;
          pending.push(response.body().then(bytes => {
            const path = new URL(response.url()).pathname;
            const entry = { path, bytes: bytes.length, sha256: sha(bytes), ...(path.endsWith('.js') ? { gzipLevel9Bytes: gzipSync(bytes, { level: 9 }).length } : {}) };
            if (served.has(path)) expect(served.get(path)).toEqual(entry);
            served.set(path, entry);
            initial.set(path, entry);
          }).catch(error => responseErrors.push(error.message)));
        });
        await page.clock.setFixedTime(new Date('2026-07-01T19:17:42Z'));
        await page.goto(url);
        await page.locator('.stage-canvas svg').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await Promise.all(pending);
        const initialScripts = [...initial.values()].filter(entry => entry.path.endsWith('.js'));
        if (mode === 'offline') { await context.setOffline(true); disconnected = true; }
        // The imported design changes location, date, wall angle and size after
        // disconnecting. No earlier PDF download or PDF module warmup is allowed.
        await page.getByLabel('Gnomon design file', { exact: true }).setInputFiles(join(root, 'examples/designs/rome-wall.gnomon.json'));
        await expect(page.locator('#design-file-status')).toContainText('Opened');
        const ready = page.waitForEvent('download', { timeout: 15000 });
        await page.getByRole('button', { name: `PDF (${format})`, exact: true }).click();
        const result = await ready;
        expect(result.suggestedFilename()).toBe(`gnomon-vertical-${format.toLowerCase()}.pdf`);
        const bytes = await readFile(await result.path());
        expect(bytes.toString('latin1')).toContain('Radius 180 mm');
        expect(bytes.toString('latin1')).toContain('Europe/Rome; design date 2026-01-15');
        await writeFile(join(output, `${profile}.pdf`), bytes);
        const exportPanel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Export', exact: true }) });
        if (mode === 'offline' && ['chromium-1440-a4', 'firefox-375-letter'].includes(profile)) {
          await exportPanel.screenshot({ path: join(output, `${profile}.png`) });
        }
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
        expect(dimensions.page).toBeLessThanOrEqual(width + 1);
        await Promise.all(pending);
        expect(responseErrors).toEqual([]); expect(errors).toEqual([]); expect(external).toEqual([]); expect(afterDisconnect).toEqual([]);
        records.push({ profile, browserVersion: browser.version(), mode, initialScripts, bytes: bytes.length, sha256: sha(bytes), filename: result.suggestedFilename(), dimensions, errors, external, afterDisconnect });
        await context.close();
        log(profile, mode, bytes.length);
      }
    }
  } finally { await browser.close(); }
}
await writeFile(join(output, 'browser.json'), JSON.stringify({ label: 'Constructed Rome wall example; first PDF per fresh context; no physical assembly.', records, served: [...served.values()].sort((a,b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
