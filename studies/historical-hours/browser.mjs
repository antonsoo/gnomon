/** Real offline designer exports from independently built before/after archives. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { chromium, firefox, expect } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name) => {
  assert(args.includes(name), `Required ${name}`);
  return resolve(args[args.indexOf(name) + 1]);
};
const before = option('--before');
const after = option('--after');
const nativeBefore = option('--native-before');
const nativeAfter = option('--native-after');
const out = option('--out');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(out, { recursive: true });
const complete = JSON.parse(await readFile(join(nativeAfter, 'results.json'), 'utf8'));
const records = [];
const assets = [];

async function files(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(prefix, item.name);
    if (item.isDirectory()) result.push(...await files(join(directory, item.name), path));
    else result.push(path);
  }
  return result.sort();
}
async function preview(root, port) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Preview did not start')); }, 15_000);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Preview exited ${code}`)); });
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Local:')) { clearTimeout(timer); ready(); }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
  return child;
}
async function download(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent('download');
  await button.click();
  const result = await pending;
  const bytes = await readFile(await result.path());
  await expect(button).toBeEnabled();
  return bytes;
}

for (const [phase, root, native, port] of [
  ['before', before, nativeBefore, 4337], ['after', after, nativeAfter, 4338],
]) {
  const server = await preview(root, port);
  const base = `http://127.0.0.1:${port}/gnomon/`;
  const phaseOut = join(out, phase);
  await mkdir(phaseOut, { recursive: true });
  try {
    const served = [];
    for (const path of await files(join(root, 'dist'))) {
      const local = await readFile(join(root, 'dist', path));
      const response = await globalThis.fetch(new URL(path, base));
      assert.equal(response.status, 200, path);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(digest(bytes), digest(local), path);
      served.push({ path, bytes: local.length, sha256: digest(bytes) });
    }
    assets.push({ phase, count: served.length, files: served });
    const reference = JSON.parse(await readFile(join(native, 'results.json'), 'utf8'));
    for (const [engine, browserType] of [['chromium', chromium], ['firefox', firefox]]) {
      const browser = await browserType.launch({ headless: true });
      try {
        for (const width of [1440, 375]) {
          // Each design gets its own user workflow. A previous rapid one-tab
          // replay missed the eleventh download event; retain its failure log.
          for (const entry of reference.exports) {
            const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'UTC', locale: 'en-US', acceptDownloads: true });
            const page = await context.newPage();
            const errors = [];
            const network = [];
            let offline = false;
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('request', (request) => { if (offline && /^https?:/.test(request.url())) network.push(request.url()); });
            await page.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
            await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
            await page.goto(base);
            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator('#preview svg').first()).toBeVisible();
            await context.setOffline(true);
            offline = true;
            const design = await readFile(join(native, `${entry.name}.gnomon.json`));
            await page.getByLabel('Gnomon design file', { exact: true }).setInputFiles({ name: `${entry.name}.gnomon.json`, mimeType: 'application/json', buffer: design });
            await expect(page.locator('#design-file-status')).toContainText(`Opened ${entry.name}.gnomon.json`);
            const svg = await download(page, 'Download SVG');
            assert.equal(digest(svg), entry.laserSvgSha256, `${phase}/${engine}/${width}/${entry.name}`);
            const paths = (svg.toString().match(/stroke-width="0.2" stroke-dasharray="1,0.8"/g) ?? []).length;
            const expected = complete.exports.find((record) => record.name === entry.name).visibleCurvePaths;
            const pdf = await download(page, 'PDF (A4)');
            assert(pdf.subarray(0, 5).toString() === '%PDF-');
            const pdfName = `${entry.name}-${engine}-${width}.pdf`;
            await writeFile(join(phaseOut, pdfName), pdf);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            assert.equal(overflow, false);
            records.push({ phase, engine, width, case: entry.name, svgSha256: digest(svg),
              visibleCurvePaths: paths, completeModelCurvePaths: expected,
              matchesCompleteModel: paths === expected, nativeSvgMatches: true,
              pdf: `${phase}/${pdfName}`, pdfBytes: pdf.length, pdfSha256: digest(pdf), overflow });
            if (entry.name === 'italian-north') {
              await page.locator('#preview').screenshot({ path: join(phaseOut, `${engine}-${width}.png`) });
            }
            assert.deepEqual(errors, []);
            assert.deepEqual(network, []);
            await context.close();
          }
        }
      } finally { await browser.close(); }
    }
  } finally { server.kill(); }
}
const result = { count: records.length, afterCompleteModelMatches: records.filter((record) => record.phase === 'after' && record.matchesCompleteModel).length,
  beforeCompleteModelMatches: records.filter((record) => record.phase === 'before' && record.matchesCompleteModel).length,
  checkedNativeSvgDownloads: records.length, pageErrors: 0, offlineHttpRequests: 0, assets, records };
await writeFile(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ count: result.count, beforeCompleteModelMatches: result.beforeCompleteModelMatches,
  afterCompleteModelMatches: result.afterCompleteModelMatches, assets: assets.map(({phase, count}) => ({phase, count})) }, null, 2) + '\n');
assert.equal(result.afterCompleteModelMatches, 24);
