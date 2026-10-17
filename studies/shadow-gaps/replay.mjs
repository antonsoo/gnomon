// Invert the Sun direction implied by each drawn segment; do not use the forward projector as the oracle.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { log } from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [sourceArg, outputArg, phase] = process.argv.slice(2);
assert.ok(sourceArg && outputArg && ['before','after'].includes(phase), 'SOURCE_ROOT OUTPUT_DIR before|after');
const root=resolve(sourceArg),out=resolve(outputArg);await mkdir(out,{recursive:true});
const from=p=>import(pathToFileURL(resolve(root,p)).href);
const {buildVerticalDial}=await from('src/lib/dials/vertical.ts');
const {polarHourMarks}=await from('src/lib/render/hour-marks.ts');
const {clipCurve}=await from('src/lib/render/curves.ts');
const {renderPolarDialSVG}=await from('src/lib/render/svg.ts');
const {exportConstructionPDF}=await from('src/lib/export/pdf.ts');
const {defaultState}=await from('src/state.ts');
const {saveDesignFile}=await from('src/design-file.ts');
const rad=x=>x*Math.PI/180;
function impliedSun(latitude,wall,d,p){
  const phi=rad(latitude),A=rad(180+wall);
  const sign=Math.cos(A)<0?-1:1;
  // Literal vertical receiving plane: up is u; u cross normal is v.
  const N=[0,sign*d*Math.cos(phi),sign*d*Math.sin(phi)];
  const P=[-Math.cos(A)*p.v,Math.sin(A)*p.v,p.u];
  const S=N.map((value,i)=>value-P[i]);const length=Math.hypot(...S);
  const delta=Math.asin(Math.max(-1,Math.min(1,(S[1]*Math.cos(phi)+S[2]*Math.sin(phi))/length)))*180/Math.PI;
  return {declinationDeg:delta,up:S[2]/length};
}
const rows=[];
for(const config of [{name:'north-west',lat:70,wall:100},{name:'north-east',lat:70,wall:-100},
                     {name:'south-west',lat:-70,wall:80},{name:'south-east',lat:-70,wall:-80}]){
  for(const R of [90,350]){
    const d=R*.32,delta=Math.sign(config.lat)*23.44,name=`${config.name}-${R}`;
    const dial=buildVerticalDial({latitudeDeg:config.lat,wallDeclinationDeg:config.wall,
      timeReference:{mode:'apparent',longitudeDeg:0},hourLineOptions:{startHour:3,endHour:21,stepHours:.25},
      nodusDistanceMm:d,gnomonBaseLengthMm:R*.62});
    const curve=dial.declinationLines.find(line=>line.declinationDeg===delta);assert.ok(curve);
    const marks=polarHourMarks(dial,R),runs=clipCurve(curve.points,marks.hourRadius,'circle',marks.thetaMax,marks.thetaCenter);
    const edges=[];
    for(const run of runs)for(let i=1;i<run.length;i++){
      const a=run[i-1],b=run[i],mid={u:(a.u+b.u)/2,v:(a.v+b.v)/2};
      const actual=impliedSun(config.lat,config.wall,d,mid);
      edges.push({from:a,to:b,midpoint:mid,inverseSun:actual,declinationErrorDeg:Math.abs(actual.declinationDeg-delta)});
    }
    const bad=edges.filter(edge=>edge.declinationErrorDeg>.02||edge.inverseSun.up<=0);
    if(phase==='after')assert.equal(bad.length,0,name);
    const opts={radiusMm:R,innerRadiusMm:Math.max(4,R*.06),plateShape:'circle',numerals:'arabic',
      theme:'laser',showDeclinationLines:true,showHistoricalHours:false,
      title:`Controlled ${config.lat} deg, wall ${config.wall} deg`,
      description:'Controlled polar-day wall geometry. Local apparent solar hour lines; no field measurement.'};
    const svg=renderPolarDialSVG(dial,opts);await writeFile(resolve(out,`${name}.svg`),svg);
    const fan=renderPolarDialSVG(dial,{...opts,plateShape:'fan'});
    await writeFile(resolve(out,`${name}-fan.svg`),fan);
    if(R===90)await writeFile(resolve(out,`${name}.pdf`),exportConstructionPDF(dial,{...opts,format:'a4'}));
    rows.push({name,latitudeDeg:config.lat,wallDeclinationDeg:config.wall,radiusMm:R,nodusDistanceMm:d,
      fanSvgSha256:createHash('sha256').update(fan).digest('hex'),
      declinationDeg:delta,gnomonStyleHeightDeg:dial.gnomon.styleHeightDeg,nativeSamples:curve.points.length,
      visibleSamples:curve.points.filter(point=>point!==null).length,nullSamples:curve.points.filter(point=>point===null).length,
      plottedRuns:runs.length,plottedEdges:edges.length,badEdges:bad,
      maxInverseDeclinationErrorDeg:Math.max(...edges.map(e=>e.declinationErrorDeg)),
      finitePointSha256:createHash('sha256').update(JSON.stringify(curve.points.filter(point=>point!==null))).digest('hex')});
  }
}
const instant=new Date('2026-06-21T12:00:00Z');
const state={...defaultState(instant),latitudeDeg:70,longitudeDeg:0,timeZone:'Etc/UTC',
  dialType:'vertical',wallDeclinationDeg:100,plateShape:'circle',radiusMm:90,timeMode:'apparent',
  numerals:'arabic',theme:'blueprint',mottoIndex:null,simMode:'custom',showZodiac:false,historicalHours:[]};
await writeFile(resolve(out,'Polar-wall.gnomon.json'),saveDesignFile(state,instant));
const inputs=[];
for(const file of ['src/lib/dials/declination-lines.ts','src/lib/dials/types.ts','src/lib/render/curves.ts','src/lib/render/svg.ts','src/lib/export/pdf.ts']){
 inputs.push({file,sha256:createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')});
}
let sourceRevision=null;
try{sourceRevision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
catch{/* A clean source archive has no Git metadata; exact input hashes remain below. */}
const result={phase,sourceRevision,
 scope:'Controlled polar-day receiving faces; inverse geometry of rendered segment midpoints, not a field measurement or general ephemeris accuracy estimate.',
 method:'From each plate point P, reconstruct the direction toward the physical nodus N. Its dot product with the north celestial axis gives sin(declination). A June/December date curve must retain its fixed declination, allowing the 0.02-degree bound for chords between 3.75-degree adjacent hour samples.',
 inputs,cases:rows,badEdges:rows.reduce((n,row)=>n+row.badEdges.length,0)};
if(phase==='before')assert.ok(result.badEdges>0);
await writeFile(resolve(out,'replay.json'),JSON.stringify(result,null,2)+'\n');
log(JSON.stringify({cases:rows.length,badEdges:result.badEdges,maxDeclinationErrorDeg:Math.max(...rows.map(r=>r.maxInverseDeclinationErrorDeg))}));
