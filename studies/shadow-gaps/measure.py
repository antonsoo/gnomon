# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Independent inverse-Sun checks of serialized native SVG/PDF date paths.

Recognizes this writer's circle plates and 0.25-mm date strokes; not a general
PDF semantic extractor. No product geometry helpers are imported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from xml.etree import ElementTree as ET

import pymupdf

MM = 25.4 / 72
NS = '{http://www.w3.org/2000/svg}'


def inverse(point, case):
    phi = math.radians(case['latitudeDeg'])
    az = math.radians(180 + case['wallDeclinationDeg'])
    direction = -1 if math.cos(az) < 0 else 1
    d = case['nodusDistanceMm']
    nodus = (0, direction*d*math.cos(phi), direction*d*math.sin(phi))
    plate = (-math.cos(az)*point[1], math.sin(az)*point[1], point[0])
    sun = [a-b for a,b in zip(nodus, plate, strict=True)]
    length = math.sqrt(sum(value*value for value in sun))
    declination = math.degrees(math.asin(max(-1,min(1,
        (sun[1]*math.cos(phi)+sun[2]*math.sin(phi))/length))))
    return declination, sun[2]/length


def audit(curves, center, case):
    result = []
    for curve in curves:
        points = [(center[1]-p[1], p[0]-center[0]) for p in curve]
        observed = [inverse(point, case)[0] for point in points]
        candidate = min((-23.44, 0, 23.44), key=lambda d: abs(d-observed[0]))
        assert max(abs(d-candidate) for d in observed) < .1
        bad = []
        errors = []
        for a,b in zip(points, points[1:]):
            mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
            declination, up = inverse(mid, case)
            error = abs(declination-candidate)
            errors.append(error)
            if error > .1 or up <= 0:
                bad.append({'fromMm':a,'toMm':b,'midpointMm':mid,
                            'impliedDeclinationDeg':declination,'expectedDeclinationDeg':candidate,
                            'errorDeg':error,'sunUp':up})
        result.append({'declinationDeg':candidate,'vertices':len(points),'badEdges':bad,
                       'maxDeclinationErrorDeg':max(errors,default=0)})
    assert result
    return result


def svg_curves(path):
    root = ET.parse(path).getroot()
    view = list(map(float,root.attrib['viewBox'].split()))
    assert abs(float(root.attrib['width'].removesuffix('mm'))-view[2]) < 1e-6
    assert abs(float(root.attrib['height'].removesuffix('mm'))-view[3]) < 1e-6
    feet = [node for node in root.findall(NS+'circle') if node.get('r')=='0.6']
    assert len(feet)==1
    center = (float(feet[0].attrib['cx']),float(feet[0].attrib['cy']))
    curves=[]
    for node in root.findall(NS+'path'):
        if node.get('stroke-width')!='0.25':continue
        values=list(map(float,re.findall(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)',node.attrib['d'])))
        assert len(values)%2==0
        curves.append(list(zip(values[::2],values[1::2],strict=True)))
    return curves,center


def pdf_curves(path, case):
    doc=pymupdf.open(path)
    page=doc[0]
    drawings=page.get_drawings()
    diameter=2*case['radiusMm']
    cuts=[draw for draw in drawings if abs(draw['rect'].width*MM-diameter)<.003
          and abs(draw['rect'].height*MM-diameter)<.003]
    assert len(cuts)==1
    rect=cuts[0]['rect']
    center=((rect.x0+rect.x1)*MM/2,(rect.y0+rect.y1)*MM/2)
    curves=[]
    for draw in drawings:
        if draw['width'] is None or abs(draw['width']*MM-.25)>.0005:continue
        lines=[item for item in draw['items'] if item[0]=='l']
        if not lines:continue
        curves.append([(lines[0][1].x*MM,lines[0][1].y*MM)]
                      +[(line[2].x*MM,line[2].y*MM) for line in lines])
    bars=[]
    for sheet in doc:
        matches=[]
        for draw in sheet.get_drawings():
            for item in draw['items']:
                if item[0]!='l':continue
                a,b=item[1:]
                if abs(a.y-b.y)<.001 and abs(a.y*MM-(sheet.rect.height*MM-12))<.005 and abs(a.x-b.x)*MM>50:
                    matches.append(abs(a.x-b.x)*MM)
        assert len(matches)==1 and abs(matches[0]-100)<.002
        bars.extend(matches)
    return curves,center,{'pages':len(doc),'calibrationBarsMm':bars}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture',type=Path,required=True)
    parser.add_argument('--browser',type=Path,
                        help='Inspect saved browser downloads instead of the native replay files')
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--expect',choices=['before','after'],required=True)
    args=parser.parse_args()
    native=json.loads((args.capture/'replay.json').read_text())
    records=[]
    jobs=[]
    if args.browser:
        browser=json.loads((args.browser/'browser.json').read_text())
        assert browser['phase']==args.expect
        case=next(row for row in native['cases'] if row['name']==browser['case'])
        for record in browser['records']:
            jobs.append((case,args.browser/record['svg'],record['svgSha256']))
            jobs.extend((case,args.browser/pdf['file'],pdf['sha256']) for pdf in record['pdfs'])
    else:
        for case in native['cases']:
            for filename in [f"{case['name']}.svg",f"{case['name']}.pdf",f"{case['name']}-fan.svg"]:
                path=args.capture/filename
                if path.exists():jobs.append((case,path,None))
    for case,path,expected_hash in jobs:
        suffix=path.suffix[1:]
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if expected_hash:assert digest==expected_hash,path
        extra={}
        if suffix=='svg':curves,center=svg_curves(path)
        else:curves,center,extra=pdf_curves(path,case)
        rows=audit(curves,center,case)
        bad=sum(len(row['badEdges']) for row in rows)
        if args.expect=='after':assert bad==0,(path,rows)
        records.append({'case':case['name'],'file':path.name,'format':suffix,
                        'sha256':digest,'datePaths':rows,'badEdges':bad,**extra})
    total=sum(row['badEdges'] for row in records)
    if args.expect=='before':assert total>0
    args.out.write_text(json.dumps({'scope':'Independent inverse geometry on native serialized date paths; 0.1-degree allowance includes 0.001-mm SVG rounding and sampled chord error. Not ephemeris or field accuracy.',
                                    'pymupdf':pymupdf.VersionBind,'phase':args.expect,
                                    'records':records,'badEdges':total},indent=2)+'\n')
    print(json.dumps({'files':len(records),'badEdges':total}))


if __name__=='__main__':main()
