"""Compare actual online/offline downloads and each build's served bytes.

python studies/offline-pdf/verify.py BEFORE AFTER BEFORE_DIST AFTER_DIST OUTPUT
Requires pypdfium2 and Pillow. Writes a JSON receipt; never rewrites the PDFs.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys

import pypdfium2 as pdfium


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_and_check(root, record):
    data = (root / f"{record['profile']}.pdf").read_bytes()
    check(len(data) == record['bytes'] and sha(data) == record['sha256'], 'Download receipt mismatch.')
    return data


def without_file_id(data):
    normalized, count = re.subn(rb'/ID \[ <[A-F0-9]{32}> <[A-F0-9]{32}> \]', b'/ID [ <' + b'0' * 32 + b'> <' + b'0' * 32 + b'> ]', data)
    check(count == 1, 'Expected exactly one jsPDF file-ID entry.')
    return normalized


def check_served(browser, dist):
    for item in browser['served']:
        check(item['path'].startswith('/gnomon/'), 'Unexpected response path.')
        relative = item['path'][len('/gnomon/'):] or 'index.html'
        path = (dist / relative).resolve()
        check(path.is_relative_to(dist), 'Response path leaves dist.')
        data = path.read_bytes()
        check(len(data) == item['bytes'] and sha(data) == item['sha256'], f'Served-file mismatch: {relative}')
    return len(browser['served'])


if len(sys.argv) != 6:
    raise SystemExit('Supply before/after download directories, both dist directories and an output JSON path.')
before_root, after_root, before_dist, after_dist, output = (Path(arg).resolve() for arg in sys.argv[1:])
before = json.loads((before_root / 'browser.json').read_text())
after = json.loads((after_root / 'browser.json').read_text())
old = {item['profile']: item for item in before['records']}
new = {item['profile']: item for item in after['records']}
check(len(old) == len(new) == 8 and set(old) == set(new), 'Expected the same eight browser/paper/width cases.')
records = []
for profile in sorted(old):
    left_record, right_record = old[profile], new[profile]
    check(left_record['mode'] == 'online' and right_record['mode'] == 'offline', 'Expected online before, offline after.')
    for item in (left_record, right_record):
        check(not item['errors'] and not item['external'] and not item['afterDisconnect'], 'Browser errors or requests after disconnecting.')
        check(item['dimensions']['page'] <= item['dimensions']['viewport'] + 1, 'Page overflow.')
    a, b = read_and_check(before_root, left_record), read_and_check(after_root, right_record)
    check(without_file_id(a) == without_file_id(b), f'PDF bytes changed beyond their random file ID: {profile}')
    pages = []
    with pdfium.PdfDocument(a) as left, pdfium.PdfDocument(b) as right:
        check(len(left) == len(right) and len(left) > 0, 'PDF page count changed.')
        for index in range(len(left)):
            lp, rp = left[index], right[index]
            try:
                check(lp.get_size() == rp.get_size(), 'PDF page dimensions changed.')
                lb, rb = lp.render(scale=2), rp.render(scale=2)
                try:
                    li, ri = lb.to_pil().convert('RGB'), rb.to_pil().convert('RGB')
                    check(li.size == ri.size and li.tobytes() == ri.tobytes(), f'Rendered PDF changed: {profile}, page {index + 1}')
                    pages.append({'page': index + 1, 'points': list(lp.get_size()), 'pixels': list(li.size), 'rgbSha256': sha(li.tobytes())})
                finally:
                    lb.close()
                    rb.close()
            finally:
                lp.close()
                rp.close()
    scripts = lambda record: {'bytes': sum(s['bytes'] for s in record['initialScripts']), 'gzipLevel9Bytes': sum(s['gzipLevel9Bytes'] for s in record['initialScripts'])}
    records.append({'profile': profile, 'pdfBytesIdenticalExceptFileId': True, 'allRenderedPixelsIdentical': True, 'normalizedPdfSha256': sha(without_file_id(a)), 'pages': pages, 'initialScriptsBefore': scripts(left_record), 'initialScriptsAfter': scripts(right_record)})
result = {
    'method': 'Compare PDF bytes except their random file ID, all page dimensions and every RGB byte at 144 dpi; match served responses to each build.',
    'packages': {name: importlib.metadata.version(name) for name in ('pypdfium2', 'pillow')},
    'servedAssetsMatched': {'before': check_served(before, before_dist), 'after': check_served(after, after_dist)},
    'records': records,
    'afterBuild': [{'path': str(path.relative_to(after_dist)), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())} for path in sorted(after_dist.rglob('*')) if path.is_file()],
}
output.write_text(json.dumps(result, indent=2) + '\n')
print(f"Matched {len(records)} PDF pairs and {sum(len(record['pages']) for record in records)} pages, with no drawing change.")
print(json.dumps({key: records[0][key] for key in ('initialScriptsBefore', 'initialScriptsAfter')}))
