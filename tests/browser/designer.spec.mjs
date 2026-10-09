import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__violations = [];
      window.addEventListener('securitypolicyviolation', (event) => window.__violations.push(event.violatedDirective));
      window.addEventListener('unhandledrejection', (event) => window.__violations.push(String(event.reason)));
    });
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1:4317/') || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
      external.push(url);
      return route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-07-01T19:17:00Z'));
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
    expect(external, 'off-origin requests').toEqual([]);
    if (!page.isClosed() && page.url().startsWith('http')) expect(await page.evaluate(() => window.__violations)).toEqual([]);
  },
});

const date = (page) => page.getByLabel('Date for the simulated shadow');
const time = (page) => page.getByLabel('Local time for the simulated shadow');
const slider = (page) => page.getByLabel('Time of day for the simulated shadow');
const svg = (page) => page.locator('.stage-canvas svg');
async function open(page) { await page.goto('./'); await expect(svg(page)).toBeVisible(); }
async function custom(page, day, clock) { await date(page).fill(day); await time(page).fill(clock); }
async function download(page, button) {
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const result = await ready;
  return { name: result.suggestedFilename(), bytes: await readFile(await result.path()) };
}

for (const timezoneId of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
  test.describe(`device zone ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('Rome noon has the same sun and UTC offset on every device', async ({ page }) => {
      await open(page);
      await expect(time(page)).toHaveValue('12:17');
      await expect(slider(page)).toHaveValue('737');
      await page.getByLabel('City', { exact: true }).selectOption('Rome');
      await custom(page, '2026-07-01', '12:00');
      await expect(page.locator('.readout')).toContainText('alt 65.7°');
      await expect(page.locator('.readout')).toContainText('hour angle -18.5°');
      await expect(page.locator('.time-controls .hint')).toHaveText('2026-07-01 12:00 UTC+02:00');
      await page.getByRole('button', { name: 'Now', exact: true }).click();
      await expect(time(page)).toHaveValue('21:17');
      await expect(slider(page)).toHaveValue('1277');
    });
  });
}

test('city midnight rollover and slider/Now/animation stay synchronized', async ({ page }) => {
  await open(page);
  await page.getByLabel('City', { exact: true }).selectOption('Tokyo');
  await expect(date(page)).toHaveValue('2026-07-02');
  await expect(time(page)).toHaveValue('04:17');
  await page.clock.pauseAt(new Date('2026-07-01T19:17:00Z'));
  await page.getByRole('button', { name: 'Animate day' }).click();
  await page.clock.runFor(1000);
  await expect(time(page)).toHaveValue('04:21');
  await page.getByRole('button', { name: 'Pause', exact: false }).click();
  await slider(page).fill('1438');
  await slider(page).dispatchEvent('input');
  await expect(time(page)).toHaveValue('23:58');
  await page.getByRole('button', { name: 'Animate day' }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole('button', { name: 'Animate day' })).toHaveAttribute('aria-pressed', 'false');
  await expect(time(page)).toHaveValue('23:58');
  await expect(date(page)).toHaveValue('2026-07-02');
});

test('DST gaps stop the simulation; repeated times expose both offsets', async ({ page }) => {
  await open(page);
  await custom(page, '2026-03-08', '02:30');
  await expect(page.locator('#simulation-note')).toContainText('does not occur');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await expect(time(page)).toHaveAttribute('aria-invalid', 'true');
  await time(page).fill('03:00');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
  await custom(page, '2026-11-01', '01:30');
  await expect(page.getByLabel('Repeated local time')).toBeVisible();
  await expect(page.locator('.time-controls .hint')).toContainText('UTC-07:00');
  await page.getByLabel('Repeated local time').selectOption('later');
  await expect(page.locator('.time-controls .hint')).toContainText('UTC-08:00');
  await expect(page.locator('.stage > .hint').last()).toContainText('UTC-08:00');
});

test('animation crosses the spring gap using elapsed time', async ({ page }) => {
  await open(page);
  await custom(page, '2026-03-08', '01:58');
  await page.clock.pauseAt(new Date('2026-07-01T19:17:00Z'));
  await page.getByRole('button', { name: 'Animate day' }).click();
  await page.clock.runFor(1000);
  await expect(time(page)).toHaveValue('03:02');
  await expect(page.locator('.time-controls .hint')).toContainText('UTC-07:00');
});

test('automatic and manual dial clock adjustments follow the selected design date', async ({ page }) => {
  await open(page);
  await custom(page, '2026-01-15', '12:00');
  await expect(page.locator('.stage')).toContainText('Hour labels: Zone time UTC-08:00');
  const winterLines = await svg(page).locator('line').evaluateAll((lines) => lines.map((line) => line.getAttribute('x2')));
  await custom(page, '2026-07-01', '12:00');
  await expect(page.locator('.stage')).toContainText('Hour labels: Zone time UTC-07:00');
  await page.getByLabel('Dial clock adjustment', { exact: true }).selectOption('0');
  await expect(page.locator('.stage')).toContainText('Hour labels: Zone time UTC-08:00');
  const manualLines = await svg(page).locator('line').evaluateAll((lines) => lines.slice(0, -1).map((line) => line.getAttribute('x2')));
  expect(manualLines).toEqual(winterLines.slice(0, -1));
  await page.getByLabel('Time zone (IANA)', { exact: true }).fill('Australia/Lord_Howe');
  await page.getByLabel('Dial clock adjustment', { exact: true }).selectOption('auto');
  await custom(page, '2026-01-15', '12:00');
  await expect(page.locator('.stage')).toContainText('Hour labels: Zone time UTC+11:00');
});

test('invalid numeric settings preserve the preview and stop stale downloads', async ({ page }) => {
  await open(page);
  await custom(page, '2026-07-01', '12:00');
  const before = await svg(page).innerHTML();
  await page.getByLabel('Latitude', { exact: true }).fill('');
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.stage')).toContainText('last valid design');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  expect(await svg(page).innerHTML()).toBe(before);
  await page.getByLabel('City', { exact: true }).selectOption('Rome');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('401');
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeDisabled();
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('30');
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeEnabled();
  await page.getByLabel('Time zone (IANA)', { exact: true }).fill('<invalid>');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await page.getByLabel('City', { exact: true }).selectOption('Tokyo');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
});

test('late geolocation callbacks cannot overwrite a later city or manual edit', async ({ page }) => {
  await page.addInitScript(() => {
    window.__locations = [];
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success) { window.__locations.push(success); } } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await page.getByLabel('City', { exact: true }).selectOption('Rome');
  await page.evaluate(() => window.__locations[0]({ coords: { latitude: 1, longitude: 2 } }));
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('41.9028');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await page.getByLabel('Longitude', { exact: true }).fill('18');
  await page.evaluate(() => window.__locations[1]({ coords: { latitude: 1, longitude: 2 } }));
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('18');
});

test('unsupported capabilities and degenerate geometry have useful recovery', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Analemmatic', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Standard/zone time', exact: true })).toBeHidden();
  await expect(page.getByLabel('Temporal (Roman unequal) hours')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Gnomon SVG', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'PDF (A4)', exact: true })).toBeDisabled();
  await expect(page.locator('.stage')).toContainText('Local apparent solar time');
  await expect(date(page)).toBeHidden();
  await page.getByLabel('Latitude', { exact: true }).fill('0');
  await expect(page.locator('.stage')).toContainText('ellipse collapses');
  await page.getByRole('button', { name: 'Horizontal', exact: true }).click();
  await expect(page.locator('.stage')).toContainText('style lies in this dial face');
  await page.getByRole('button', { name: 'Equatorial', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
  await expect(page.locator('.orientation-text').first()).toContainText('90.0° from horizontal');
});

test('SVG and PNG retain the selected design, motto and complete dimensions', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Vertical', exact: true }).click();
  const result = await download(page, 'Download SVG');
  expect(result.name).toBe('gnomon-vertical.svg');
  const text = result.bytes.toString();
  expect(text).toContain('America/Los_Angeles');
  expect(text).toContain('Horas non numero nisi serenas');
  expect(text).toContain('<desc>');
  expect(text).not.toMatch(/NaN|Infinity/);
  const png = await download(page, 'PNG');
  expect(png.name).toBe('gnomon-vertical.png');
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(png.bytes.readUInt32BE(16) * png.bytes.readUInt32BE(20)).toBeLessThanOrEqual(16_000_000);
  const gnomon = await download(page, 'Gnomon SVG');
  expect(gnomon.bytes.toString()).toContain('nodus, 28.8mm from foot');
});

test('delayed PDF loads retain click-time geometry and filename', async ({ page }) => {
  await open(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let requested;
  const started = new Promise((resolve) => { requested = resolve; });
  await page.route('**/pdf-*.js', async (route) => { requested(); await gate; await route.continue(); });
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF (A4)', exact: true }).click();
  await started;
  await expect(page.getByRole('button', { name: 'PDF (Letter)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Vertical', exact: true }).click();
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('300');
  release();
  const result = await ready;
  expect(result.suggestedFilename()).toBe('gnomon-horizontal-a4.pdf');
  const contents = (await readFile(await result.path())).toString('latin1');
  expect(contents).toContain('/MediaBox [0 0 595.279');
  expect(contents).toContain('Radius 90 mm');
  expect(contents).not.toContain('Radius 300 mm');
  await expect(page.getByRole('button', { name: 'PDF (A4)', exact: true })).toBeEnabled();
});

test('failed PNG recovers and a large PDF downloads as full-size sheets', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let fail = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (fail) { fail = false; callback(null); }
      else original.call(this, callback, ...args);
    };
  });
  await open(page);
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Export failed' })).toContainText('PNG encoding failed');
  await download(page, 'PNG');
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('300');
  const large = await download(page, 'PDF (A4)');
  expect(large.bytes.toString('latin1')).toContain('ASSEMBLY MAP - reduced size, not a cutting template');
  expect(large.bytes.toString('latin1')).toContain('Radius 300 mm');
  await expect(page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Export', exact: true }) })).toContainText('across');
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('80');
  expect((await download(page, 'PDF (Letter)')).name).toBe('gnomon-horizontal-letter.pdf');
});

test('300 mm circle exports four tiles in both paper formats and retains the guide', async ({ page }, testInfo) => {
  await open(page);
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Full circle', exact: true }).click();
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Export', exact: true }) });
  await expect(panel).toContainText('A4: 4 sheets (2 across, 2 down) + assembly guide. Letter: 4 sheets (2 across, 2 down) + assembly guide.');
  for (const format of ['A4', 'Letter']) {
    const result = await download(page, `PDF (${format})`);
    const text = result.bytes.toString('latin1');
    expect(text).toContain('/Count 5');
    expect(text).toContain('Radius 150 mm');
    expect(text).toContain('Horas non numero nisi serenas');
    expect(text.match(/100 mm calibration - verify before cutting/g)).toHaveLength(5);
    await testInfo.attach(result.name, { body: result.bytes, contentType: 'application/pdf' });
  }
  await page.setViewportSize({ width: 375, height: 1000 });
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Dial radius (mm)', { exact: true }).fill('80');
  await expect(panel).toContainText('A4: 1 sheet. Letter: 1 sheet.');
});

for (const width of [320, 375, 1440]) {
  test(`keyboard access, themes and layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await open(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to sundial preview' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Sundial preview' })).toBeFocused();
    if (width < 820) expect(await page.locator('#preview').evaluate((e) => e.getBoundingClientRect().top)).toBeLessThan(200);
    for (const theme of ['Brass', 'Laser cut']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      const audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.getByRole('button', { name: 'Vertical', exact: true }).click();
    await page.getByRole('button', { name: 'Brass', exact: true }).click();
    await custom(page, '2026-07-01', '12:00');
    await page.locator('#preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`vertical-${width}.png`), fullPage: true });
  });
}

test('preview zoom supports keyboard scrolling without changing export scale', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await open(page);
  const before = (await download(page, 'Download SVG')).bytes.toString();
  await page.getByRole('button', { name: 'Zoom in preview', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Preview zoom', { exact: true })).toHaveText('150%');
  const drawing = page.getByRole('group', { name: 'Scrollable sundial drawing', exact: true });
  expect(await drawing.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await drawing.focus();
  await drawing.evaluate((e) => {
    window.__scrollDone = false;
    e.addEventListener('scrollend', () => { window.__scrollDone = true; }, { once: true });
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => drawing.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  // Native keyboard scrolling has its own animation, independent of fake timers.
  await expect.poll(() => page.evaluate(() => window.__scrollDone)).toBe(true);
  await drawing.evaluate((e) => e.scrollTo({ left: 80, behavior: 'instant' }));
  const left = await drawing.evaluate((e) => e.scrollLeft);
  await page.clock.pauseAt(new Date('2026-07-01T19:17:00Z'));
  await page.clock.runFor(1000);
  expect(await drawing.evaluate((e) => e.scrollLeft)).toBeCloseTo(left, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await download(page, 'Download SVG')).bytes.toString()).toBe(before);
  await page.getByRole('button', { name: 'Fit preview', exact: true }).click();
  await expect(page.getByLabel('Preview zoom', { exact: true })).toHaveText('100%');
  expect(await drawing.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});


test('missing and out-of-range dates pause exports and changing years updates the table', async ({ page }) => {
  await open(page);
  await date(page).fill('');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await expect(page.locator('#simulation-note')).toContainText('complete date');
  await custom(page, '2101-01-01', '12:00');
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await custom(page, '2024-02-29', '12:00');
  await expect(page.getByRole('heading', { name: 'Equation of time (2024)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equation of time (2026)', exact: true })).toBeVisible();
});


test('accessible time errors, fold choice and dial capability changes', async ({ page }) => {
  await open(page);
  await custom(page, '2026-03-08', '02:30');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await custom(page, '2026-11-01', '01:30');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Analemmatic', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Equatorial', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
