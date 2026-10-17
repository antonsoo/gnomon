# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Inspect actual public offline PDF downloads and their physical calibration."""
import argparse
import hashlib
import json
from pathlib import Path
import pymupdf

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
manifest = json.loads((args.browser/'browser.json').read_text())
MM = 25.4 / 72
rows = []
for context in manifest['results']:
    for item in context['polarPdfDownloads']:
        source = args.browser/item['file']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256']
        pdf = pymupdf.open(source)
        dimensions = (210,297) if item['paper']=='A4' else (215.9,279.4)
        assert len(pdf)==2
        bars = []
        for page in pdf:
            assert abs(page.rect.width*MM-dimensions[0]) < .005
            assert abs(page.rect.height*MM-dimensions[1]) < .005
            matches = []
            for draw in page.get_drawings():
                for shape in draw['items']:
                    if shape[0]=='l':
                        a,b=shape[1:]
                        if abs(a.y-b.y)<.001 and abs(a.y*MM-(dimensions[1]-12))<.005 and abs(a.x-b.x)*MM>50:
                            matches.append(abs(a.x-b.x)*MM)
            assert len(matches)==1 and abs(matches[0]-100)<.002
            bars.extend(matches)
        rows.append({'engine':context['engine'],'width':context['width'],'file':item['file'],
                     'paper':item['paper'],'pages':len(pdf),'calibrationBarMm':bars,'sha256':item['sha256']})
assert len(rows)==8
args.out.write_text(json.dumps({'scope':'Actual public downloads after disconnecting and changing to a horizontal dial; independent PDF parser verifies both kit pages and physical calibration. No physical printer or field measurement.',
                                'pymupdf':pymupdf.VersionBind,'cases':rows},indent=2)+'\n')
print(json.dumps({'pdfs':len(rows),'pages':sum(row['pages'] for row in rows),'calibrationBars':sum(len(row['calibrationBarMm']) for row in rows)}))
