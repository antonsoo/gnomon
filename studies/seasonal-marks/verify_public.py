"""Compare deployed designer bytes with a specific local build, including the root URL."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--build', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--base', default='https://antonsoo.github.io/gnomon/')
args = parser.parse_args()
files = [(p.relative_to(args.build).as_posix(), p.read_bytes())
         for p in sorted(args.build.rglob('*')) if p.is_file()]
files.append(('', (args.build / 'index.html').read_bytes()))

def check(item):
    name, wanted = item
    url = args.base + name
    try:
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
            data = response.read()
            return {'file': name or '(root alias)', 'url': url, 'status': response.status,
                    'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                    'expectedSha256': hashlib.sha256(wanted).hexdigest(),
                    'matches': data == wanted, 'etag': response.headers.get('etag')}
    except (HTTPError, URLError) as exc:
        return {'file': name or '(root alias)', 'url': url,
                'status': getattr(exc, 'code', None), 'error': str(exc), 'matches': False}

attempts = []
for attempt in range(12):
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(check, files))
    summary = {'matching': sum(row['matches'] for row in results), 'total': len(results)}
    attempts.append(summary)
    print(json.dumps(summary), flush=True)
    if summary['matching'] == len(results):
        break
    if attempt < 11:
        time.sleep(5)
receipt = {'base': args.base, 'scope': 'Exact bytes for every built file and the canonical root alias.',
           'attempts': attempts, 'files': results, 'complete': all(row['matches'] for row in results)}
args.out.write_text(json.dumps(receipt, indent=2) + '\n')
assert receipt['complete'], [row for row in results if not row['matches']]
