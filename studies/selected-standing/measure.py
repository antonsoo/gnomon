"""Read actual SVG standing points and compare independent date/Sun geometry.

Uses only the standard library. It imports no product projector or ephemeris.
The DE421 values and original input hash are in the native replay manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET

NS = '{http://www.w3.org/2000/svg}'


def inspect(path, case, phase):
    root = ET.parse(path).getroot()
    box = list(map(float, root.attrib['viewBox'].split()))
    assert float(root.attrib['width'].removesuffix('mm')) == box[2]
    assert float(root.attrib['height'].removesuffix('mm')) == box[3]
    ellipse = root.find(NS+'ellipse')
    cx, cy = float(ellipse.attrib['cx']), float(ellipse.attrib['cy'])
    markers = [node for node in root.iter(NS+'circle') if node.get('data-selected-minute')]
    assert len(markers) == (1 if phase == 'after' else 0)
    record = {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'selectedMarkers': len(markers)}
    if not markers:
        return record
    mark = markers[0]
    assert mark.attrib['data-selected-minute'].replace('.000Z','Z') == case['utc']
    x, y = float(mark.attrib['cx'])-cx, cy-float(mark.attrib['cy'])
    assert abs(x) < .001
    phi = math.radians(case['latitudeDeg'])
    inverse = math.degrees(math.atan(y/(case['radiusMm']*math.cos(phi))))
    error = abs(inverse-case['oracleDeclinationDeg'])
    assert error < .01, (path, error)
    # At apparent 15:00, reconstruct the Sun in east/north/up coordinates
    # from the independent declination, and locate the actual printed hour dot.
    delta, hour = math.radians(case['oracleDeclinationDeg']), math.radians(45)
    sun = (-math.cos(delta)*math.sin(hour),
           math.cos(phi)*math.sin(delta)-math.sin(phi)*math.cos(delta)*math.cos(hour),
           math.sin(phi)*math.sin(delta)+math.cos(phi)*math.cos(delta)*math.cos(hour))
    assert sun[2] > 0
    expected = (case['radiusMm']*math.sin(hour), case['radiusMm']*math.sin(phi)*math.cos(hour))
    dots = [(float(node.attrib['cx'])-cx, cy-float(node.attrib['cy']))
            for node in root.findall(NS+'circle') if node.get('r') == '1.1']
    target = min(dots, key=lambda dot: math.dist(dot, expected))
    assert math.dist(target, expected) < .002
    observed = (target[0]-x,target[1]-y)
    shadow = (-sun[0],-sun[1])
    cross = observed[0]*shadow[1]-observed[1]*shadow[0]
    dot = sum(a*b for a,b in zip(observed, shadow, strict=True))
    angle = abs(math.degrees(math.atan2(cross,dot)))
    assert angle < .02, (path, angle)
    return {**record, 'offsetMm': y, 'inverseDeclinationDeg': inverse,
            'oracleDeclinationDeg': case['oracleDeclinationDeg'],
            'declinationErrorDeg': error, 'printed15hShadowDirectionErrorDeg': angle,
            'svgPhysicalWidthMm': box[2], 'svgPhysicalHeightMm': box[3]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--browser', type=Path)
    parser.add_argument('--input', type=Path, help='Original portable inputs for browser geometry')
    parser.add_argument('--oracle', type=Path, help='Independent declinations for browser-selected minutes')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--phase', choices=['before','after'], required=True)
    args = parser.parse_args()
    if args.browser:
        assert args.input and args.oracle
        settings = json.loads(args.input.read_text())
        oracle = {row['utc']: row['apparentDeclinationDeg'] for row in json.loads(args.oracle.read_text())['points']}
        browser = json.loads((args.browser/'browser.json').read_text())
        records = []
        for row in browser['records']:
            cases = [(row['svg'],settings['utcInstant'])]
            if row.get('edited'):cases.append((row['edited']['svg'],row['edited']['utcInstant']))
            for filename,utc in cases:
                utc = utc.replace('.000Z','Z')
                case = {'utc':utc,'latitudeDeg':settings['latitudeDeg'],
                        'radiusMm':settings['radiusMm'],'oracleDeclinationDeg':oracle[utc]}
                records.append(inspect(args.browser/filename,case,args.phase))
    else:
        manifest = json.loads((args.capture/'replay.json').read_text())
        records = [inspect(args.capture/(case['name']+'.svg'),case,args.phase) for case in manifest['cases']]
    args.out.write_text(json.dumps({'scope':'Actual native SVG coordinates against retained DE421 declinations and an independent ENU Sun ray. Numerical controlled check, not physical fabrication or field accuracy.',
        'phase':args.phase,'records':records,'maximumDeclinationErrorDeg':max((r.get('declinationErrorDeg',0) for r in records),default=0),
        'maximumShadowDirectionErrorDeg':max((r.get('printed15hShadowDirectionErrorDeg',0) for r in records),default=0)},indent=2)+'\n')
    print(json.dumps({'files':len(records),'selectedMarkers':sum(r['selectedMarkers'] for r in records)}))


if __name__ == '__main__':main()
