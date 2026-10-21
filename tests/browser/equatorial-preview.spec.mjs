/* global Image, Blob, URL, crypto, atob, createImageBitmap */
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const width of [375, 1440]) for (const latitude of [37.7749, -33.9]) {
  test(`outside face, seasonal shadow and downloads at ${latitude}, ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [], violations = [], offlineRequests = [];
    let offline = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (offline && /^https?:/.test(request.url())) offlineRequests.push(request.url()); });
    await page.addInitScript(() => {
      window.faceViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.faceViolations.push(event.violatedDirective));
    });
    await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
    await page.goto('./');
    await page.getByLabel('Latitude', { exact: true }).fill(String(latitude));
    await page.getByLabel('Longitude', { exact: true }).fill('0');
    const zone = page.getByLabel('Time zone (IANA)', { exact: true });
    await zone.fill('UTC'); await zone.press('Tab');
    await page.getByRole('button', { name: 'Equatorial', exact: true }).click();
    await page.getByRole('button', { name: 'Local apparent time', exact: true }).click();
    await page.getByRole('button', { name: 'Full circle', exact: true }).click();
    await page.getByRole('button', { name: 'Laser cut', exact: true }).click();
    await page.getByLabel('Dial radius (mm)', { exact: true }).fill('80');
    await page.getByLabel('Local time for the simulated shadow').fill('12:00');
    await page.evaluate(async () => {
      await Promise.all(['400 24px Fraunces', '560 24px Fraunces', '650 24px Fraunces', 'italic 500 24px Fraunces'].map(font => document.fonts.load(font)));
      await document.fonts.ready;
    });
    await context.setOffline(true); offline = true;
    const selector = page.getByLabel('Equatorial face preview', { exact: true });
    await expect(selector).toHaveValue('pole-facing');
    const svg = page.locator('.stage-canvas > svg');
    const records = [];
    let savedPair, raster, pngSha256, pdfSha256;
    async function download(button, file) {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: button, exact: true }).click();
      const item = await pending;
      expect(await item.failure()).toBeNull();
      const bytes = await readFile(await item.path());
      if (file) await item.saveAs(testInfo.outputPath(file));
      return { bytes, filename: item.suggestedFilename(), sha256: hash(bytes) };
    }
    for (const season of ['06-21', '12-21']) {
      const date = page.getByLabel('Date for the simulated shadow');
      await date.fill(`2026-${season}`); await date.dispatchEvent('change');
      for (const face of ['pole-facing', 'opposite']) {
        await selector.selectOption(face);
        await expect(svg).toHaveAttribute('aria-label', new RegExp(`${face === 'pole-facing' ? 'Pole-facing' : 'Opposite'} face, viewed from outside`));
        const normalSign = (latitude >= 0 ? 1 : -1) * (face === 'pole-facing' ? 1 : -1);
        const halfYear = normalSign > 0 ? 'March equinox to September equinox' : 'September equinox to March equinox';
        await expect(page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Dial type', exact: true }) }))
          .toContainText(`Sun-facing half-year: ${halfYear}`);
        const poleSeason = (latitude > 0) === (season === '06-21');
        const lit = face === 'pole-facing' ? poleSeason : !poleSeason;
        await expect(page.locator('.readout')).toContainText(lit ? 'shadow visible on this face' : 'sun not illuminating this face');
        await expect(svg.locator('line[stroke-width="0.6"]')).toHaveCount(lit ? 1 : 0);
        const solar = await page.locator('.readout').evaluate(node => Object.fromEntries([...node.querySelectorAll('span')].filter(span => span.querySelector('strong')).map(span => {
          const key = span.querySelector('strong').textContent.trim();
          return [key, Number.parseFloat(span.textContent.replace(span.querySelector('strong').textContent, ''))];
        })));
        expect(solar.alt).toBeGreaterThan(0);
        let shadowTip = null, projectionErrorMm = null;
        if (lit) {
          const point = await svg.evaluate(root => {
            const foot = root.querySelector('circle[r="0.6"]'), tip = root.querySelector('line[stroke-width="0.6"]');
            return { u: Number(foot.getAttribute('cy')) - Number(tip.getAttribute('y2')), v: Number(tip.getAttribute('x2')) - Number(foot.getAttribute('cx')) };
          });
          const h = solar['hour angle'] * Math.PI / 180, delta = solar.declination * Math.PI / 180;
          const sign = (latitude >= 0 ? 1 : -1) * (face === 'pole-facing' ? 1 : -1);
          const distance = 80 * .32 / Math.abs(Math.tan(delta));
          shadowTip = point;
          projectionErrorMm = Math.hypot(point.u + distance * Math.cos(h), point.v + sign * distance * Math.sin(h));
          expect(projectionErrorMm).toBeLessThan(.25);
        }
        const file = `${season}-${face}.svg`, result = await download('Download SVG', file);
        expect(result.filename).toBe(`gnomon-equatorial${face === 'opposite' ? '-opposite' : ''}.svg`);
        expect(result.bytes.toString()).toContain(`This drawing is the ${face} face, viewed from outside.`);
        records.push({ season, face, file, sha256: result.sha256, shadowVisible: lit, solar, shadowTip, projectionErrorMm });
        if (season === '06-21') {
          const saved = await download('Save design', face === 'pole-facing' ? 'pair.gnomon.json' : undefined);
          if (face === 'pole-facing') savedPair = saved.bytes;
          else {
            expect(saved.bytes).toEqual(savedPair);
            const png = await download('PNG', 'opposite.png');
            pngSha256 = png.sha256;
            expect(png.filename).toBe('gnomon-equatorial-opposite.png');
            expect([...png.bytes.subarray(0, 8)]).toEqual([137,80,78,71,13,10,26,10]);
            raster = await page.evaluate(async ({ svgText, pngBase64 }) => {
              const bytes = Uint8Array.from(atob(pngBase64), ch => ch.charCodeAt(0));
              const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
              const actual = document.createElement('canvas'), expected = document.createElement('canvas');
              actual.width = expected.width = bitmap.width; actual.height = expected.height = bitmap.height;
              const a = actual.getContext('2d'), b = expected.getContext('2d');
              a.drawImage(bitmap, 0, 0); bitmap.close();
              const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
              try {
                const image = new Image();
                await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
                b.drawImage(image, 0, 0, actual.width, actual.height);
              } finally { URL.revokeObjectURL(url); }
              const x = a.getImageData(0, 0, actual.width, actual.height).data, y = b.getImageData(0, 0, actual.width, actual.height).data;
              let maxComponentDifference = 0, differentComponents = 0;
              for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); maxComponentDifference = Math.max(maxComponentDifference, d); if (d) differentComponents++; }
              const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
              return { width: actual.width, height: actual.height, maxComponentDifference, differentComponents, pngPixelsSha256: await sha(x), svgPixelsSha256: await sha(y) };
            }, { svgText: result.bytes.toString(), pngBase64: png.bytes.toString('base64') });
            expect(raster.maxComponentDifference).toBeLessThanOrEqual(2);
            const pdf = await download('PDF (A4)', 'opposite-first.pdf');
            pdfSha256 = pdf.sha256;
            const text = pdf.bytes.toString('latin1');
            expect(text).toContain('/Count 3');
            expect(text.indexOf('O | Opposite face')).toBeLessThan(text.indexOf('P | Pole-facing face'));
          }
        }
      }
    }
    const fileInput = page.getByLabel('Gnomon design file', { exact: true });
    await fileInput.setInputFiles({ name: 'pair.gnomon.json', mimeType: 'application/json', buffer: savedPair });
    await expect(selector).toHaveValue('pole-facing');
    await expect(page.getByLabel('Date for the simulated shadow')).toHaveValue('2026-06-21');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    violations.push(...await page.evaluate(() => window.faceViolations));
    expect(errors).toEqual([]); expect(violations).toEqual([]); expect(offlineRequests).toEqual([]);
    await writeFile(testInfo.outputPath('faces.json'), JSON.stringify({ browser: testInfo.project.name, browserVersion: context.browser().version(), node: process.version, latitude, width, viewport: page.viewportSize(), radiusMm: 80, records, raster, pngSha256, pdfSha256 }, null, 2) + '\n');
    await selector.selectOption('opposite');
    await page.getByRole('button', { name: 'Brass', exact: true }).click();
    if (latitude > 0) {
      const date = page.getByLabel('Date for the simulated shadow');
      await date.fill('2026-12-21'); await date.dispatchEvent('change');
    }
    await expect(page.locator('.readout')).toContainText('shadow visible on this face');
    await page.locator('.stage').screenshot({ path: testInfo.outputPath('opposite-preview.png') });
    await page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Dial type', exact: true }) })
      .screenshot({ path: testInfo.outputPath('face-control.png') });
  });
}
