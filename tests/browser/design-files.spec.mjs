import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4317/') ? route.continue() : route.abort());
    await page.clock.setFixedTime(new Date('2026-07-01T19:17:42Z'));
    await use(page);
    expect(errors).toEqual([]);
  },
});
const status = page => page.locator('#design-file-status');
const date = page => page.getByLabel('Date for the simulated shadow');
const time = page => page.getByLabel('Local time for the simulated shadow');
async function download(page, name) {
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await ready;
  return { name: result.suggestedFilename(), bytes: await readFile(await result.path()) };
}
async function upload(page, bytes, name = 'Rome.gnomon.json') {
  await page.getByLabel('Gnomon design file', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: bytes });
}
async function configure(page, kind = 'Vertical') {
  await page.goto('./');
  await page.getByLabel('City', { exact: true }).selectOption('Rome');
  await page.getByRole('button', { name: kind, exact: true }).click();
  if (kind === 'Vertical') await page.getByLabel('Wall declination from south (°)', { exact: true }).fill('25');
  await page.getByLabel(kind === 'Analemmatic' ? 'Semi-major axis (mm)' : 'Dial radius (mm)', { exact: true }).fill('180');
  await page.getByRole('button', { name: 'Arabic', exact: true }).click();
  await page.getByRole('button', { name: 'Blueprint', exact: true }).click();
  await page.getByLabel('Zodiac entries', { exact: true }).check();
  await page.getByLabel('Motto', { exact: true }).selectOption('3');
  if (kind !== 'Analemmatic') {
    await page.getByLabel('Temporal (Roman unequal) hours', { exact: true }).check();
    await date(page).fill('2026-01-15');
    await time(page).fill('12:00');
  }
}

for (const kind of ['Horizontal', 'Vertical', 'Equatorial', 'Analemmatic']) {
  test(`${kind}: actual downloaded file restores settings and byte-identical construction SVG after reload`, async ({ page, context }) => {
    await configure(page, kind);
    const drawing = await download(page, 'Download SVG');
    const saved = await download(page, 'Save design');
    expect(saved.name).toBe(`gnomon-${kind.toLowerCase()}.gnomon.json`);
    const data = JSON.parse(saved.bytes.toString());
    expect(data).toMatchObject({ format: 'gnomon-design', version: 1, timeZone: 'Europe/Rome', radiusMm: 180, motto: 'Tempus fugit' });
    await page.reload();
    await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('37.7749');
    await context.setOffline(true);
    await upload(page, saved.bytes);
    await expect(status(page)).toContainText('Opened Rome.gnomon.json');
    await expect(page.getByRole('button', { name: kind, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#instructions')).toContainText(kind === 'Analemmatic'
      ? 'Use a vertical rod, checked with a plumb line'
      : "parallel to Earth's axis");
    await expect(page.getByRole('button', { name: 'Arabic', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Blueprint', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Zodiac entries', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Motto', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('Time zone (IANA)', { exact: true })).toHaveValue('Europe/Rome');
    expect((await download(page, 'Download SVG')).bytes.equals(drawing.bytes)).toBe(true);
    expect((await download(page, 'Save design')).bytes.equals(saved.bytes)).toBe(true);
  });
}

test('a changed minute and the later DST occurrence survive reopening on a Tokyo device', async ({ page, browser }) => {
  await page.goto('./');
  await date(page).fill('2026-11-01');
  await time(page).fill('01:00');
  await time(page).fill('01:30'); // geometry cache stays on the same date
  await page.getByLabel('Repeated local time').selectOption('later');
  const saved = await download(page, 'Save design');
  expect(JSON.parse(saved.bytes.toString())).toMatchObject({ customDateTimeLocal: '2026-11-01T01:30', timeDisambiguation: 'later', utcInstant: '2026-11-01T09:30:00.000Z' });
  const other = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  try {
    const target = await other.newPage();
    await target.clock.setFixedTime(new Date('2027-07-01T00:00:00Z'));
    await target.goto('./');
    await upload(target, saved.bytes);
    await expect(status(target)).toContainText('Opened');
    await expect(date(target)).toHaveValue('2026-11-01');
    await expect(time(target)).toHaveValue('01:30');
    await expect(target.getByLabel('Repeated local time')).toHaveValue('later');
    await expect(target.locator('.time-controls .hint')).toContainText('UTC-08:00');
    await expect(target.getByRole('button', { name: 'Now', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect((await download(target, 'Save design')).bytes.equals(saved.bytes)).toBe(true);
  } finally { await other.close(); }
});

test('invalid files preserve an invalid draft and valid reopening recovers every field', async ({ page }) => {
  await configure(page);
  const saved = await download(page, 'Save design');
  const before = await page.locator('.stage-canvas svg').innerHTML();
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('');
  const data = JSON.parse(saved.bytes.toString());
  const inputs = [
    Buffer.from('{'), Buffer.from(JSON.stringify({ ...data, version: 2 })),
    Buffer.from(JSON.stringify({ ...data, utcOffsetMinutes: 0 })),
    Buffer.from(JSON.stringify({ ...data, radiusMm: '180' })),
    Buffer.from(JSON.stringify({ ...data, unexpected: true })),
    Buffer.from(saved.bytes.toString().replace('"radiusMm": 180', '"radiusMm": 90, "radiusMm": 180')),
    Buffer.from([0xff, 0xfe, 0x7b]), Buffer.alloc(16385, 32),
  ];
  for (const bytes of inputs) {
    await upload(page, bytes);
    await expect(status(page)).toContainText('Could not open');
    await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeDisabled();
    expect(await page.locator('.stage-canvas svg').innerHTML()).toBe(before);
  }
  await upload(page, saved.bytes); // same filename, valid retry
  await expect(status(page)).toContainText('Opened');
  await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('180');
  await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeEnabled();
});

async function holdReads(page) {
  await page.evaluate(() => {
    const original = window.File.prototype.arrayBuffer;
    window.File.prototype.arrayBuffer = async function () {
      const bytes = await original.call(this);
      if (!this.name.startsWith('slow')) return bytes;
      return new Promise(resolve => { window.__releaseDesign = () => resolve(bytes); });
    };
  });
}
async function slow(page, bytes) {
  await upload(page, bytes, 'slow.gnomon.json');
  await expect.poll(() => page.evaluate(() => typeof window.__releaseDesign)).toBe('function');
  await expect(page.getByRole('button', { name: 'Cancel open', exact: true })).toBeVisible();
}

test('a delayed read cannot overwrite newer edits or a newer opened file', async ({ page }) => {
  await configure(page);
  const saved = await download(page, 'Save design');
  await holdReads(page);
  await slow(page, saved.bytes);
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('205');
  await page.evaluate(() => { window.__releaseDesign(); delete window.__releaseDesign; });
  await expect(status(page)).toContainText('Settings changed');
  await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('205');
  await slow(page, saved.bytes);
  const newer = Buffer.from(JSON.stringify({ ...JSON.parse(saved.bytes.toString()), radiusMm: 210 }));
  await upload(page, newer, 'newer.gnomon.json');
  await expect(status(page)).toContainText('Opened newer');
  await page.evaluate(() => { window.__releaseDesign(); delete window.__releaseDesign; });
  await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('210');
  await expect(status(page)).toContainText('Opened newer');
});

test('canceling a delayed read keeps the current design available', async ({ page }) => {
  await configure(page);
  const saved = await download(page, 'Save design');
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('220');
  await holdReads(page);
  await slow(page, saved.bytes);
  await page.getByRole('button', { name: 'Cancel open', exact: true }).click();
  await page.evaluate(() => window.__releaseDesign());
  await expect(status(page)).toContainText('Open canceled');
  await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('220');
  await expect(page.getByRole('button', { name: 'Save design', exact: true })).toBeEnabled();
});

test('failed and timed-out reads allow a valid retry without replacing current settings', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-01T19:17:42Z') });
  await configure(page);
  const saved = await download(page, 'Save design');
  await page.evaluate(() => {
    const original = window.File.prototype.arrayBuffer;
    window.File.prototype.arrayBuffer = function () {
      if (this.name === 'unreadable.gnomon.json') return Promise.reject(new Error('Synthetic read failure'));
      return original.call(this);
    };
  });
  await upload(page, saved.bytes, 'unreadable.gnomon.json');
  await expect(status(page)).toContainText('Synthetic read failure');
  await holdReads(page);
  await slow(page, saved.bytes);
  await page.clock.runFor(15_001);
  await expect(status(page)).toContainText('timed out');
  await expect(page.getByLabel('Dial radius (mm)', { exact: true })).toHaveValue('180');
  await page.evaluate(() => window.__releaseDesign());
  await upload(page, saved.bytes);
  await expect(status(page)).toContainText('Opened');
});

for (const width of [1440, 375]) {
  test(`reopened controls stay accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await configure(page);
    const saved = await download(page, 'Save design');
    await page.reload();
    await upload(page, saved.bytes);
    await expect(status(page)).toContainText('Opened');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
  });
}
