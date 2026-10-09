/** Generate actual PDF artifacts; the Python verifier reads them independently. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { captureDesign } from '../src/design.ts';
import { defaultState } from '../src/state.ts';
import { exportPolarDialPDF } from '../src/lib/export/pdf.ts';

const directory = resolve(process.argv[2] ?? 'test-results/print-fixtures');
mkdirSync(directory, { recursive: true });
const cases = [
  ['compact', { radiusMm: 80, plateShape: 'fan', latitudeDeg: 45 }],
  ['north', { radiusMm: 150, plateShape: 'circle', latitudeDeg: 45 }],
  ['south', { radiusMm: 150, plateShape: 'circle', latitudeDeg: -45 }],
  ['wall', { radiusMm: 200, plateShape: 'fan', latitudeDeg: 51.5, dialType: 'vertical', wallDeclinationDeg: 35 }],
  ['equatorial', { radiusMm: 150, plateShape: 'circle', latitudeDeg: 37.7749, dialType: 'equatorial' }],
  ['maximum', { radiusMm: 400, plateShape: 'fan', latitudeDeg: 78, showZodiac: true, historicalHours: ['temporal', 'babylonian', 'italian'] }],
  ['one-sheet-edge', { radiusMm: 90, plateShape: 'circle', latitudeDeg: 45 }],
];
const records = [];
for (const [name, settings] of cases) {
  const state = { ...defaultState(), longitudeDeg: 0, timeZone: 'UTC', timeMode: 'apparent', ...settings };
  const instant = new Date('2026-06-21T12:00:00Z');
  const design = captureDesign(state, instant);
  for (const format of ['a4', 'letter']) {
    const start = performance.now();
    const bytes = exportPolarDialPDF(design.dial, { ...design.polarOptions, format });
    const elapsedMs = performance.now() - start;
    const file = `${name}-${format}.pdf`;
    writeFileSync(join(directory, file), bytes);
    records.push({ file, format, settings: state, instant: instant.toISOString(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), elapsedMs });
  }
}
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ generator: 'scripts/print-fixtures.mjs', node: process.version, records }, null, 2) + '\n');
process.stdout.write(`Wrote ${records.length} PDFs and manifest to ${directory}\n`);
