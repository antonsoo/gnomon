// Actual native drawings, with a pinned independent ephemeris as the date oracle.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [source,output,phase]=process.argv.slice(2);assert(source&&output&&['before','after'].includes(phase));
const root=resolve(source),out=resolve(output);await mkdir(out,{recursive:true});
const from=path=>import(pathToFileURL(resolve(root,path)).href);
const {captureDesign,designSvg}=await from('src/design.ts');
const {defaultState}=await from('src/state.ts');
const {saveDesignFile}=await from('src/design-file.ts');
const fixtureBytes=await readFile(resolve(root,'tests/fixtures/solar-oracle.json'));
const fixture=JSON.parse(fixtureBytes),dates=fixture.points.filter(row=>row[0].startsWith('2026-')).filter((_,i)=>i%5===0);
assert.equal(dates.length,5);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cases=[],controls=[];
for(const [utc,declination] of dates)for(const latitude of [37.7749,-33.8688])for(const radius of [30,90,400]){
 const instant=new Date(utc),settings={...defaultState(instant),latitudeDeg:latitude,longitudeDeg:0,timeZone:'Etc/UTC',
  dialType:'analemmatic',radiusMm:radius,numerals:'arabic',mottoIndex:null,timeMode:'apparent'};
 const design=captureDesign(settings,instant),svg=designSvg(design,'laser');
 const name=`${utc.slice(0,10)}-${latitude>0?'north':'south'}-${radius}`;
 const count=[...svg.matchAll(/data-selected-minute=/g)].length;assert.equal(count,phase==='after'?1:0);
 await writeFile(resolve(out,name+'.svg'),svg);
 cases.push({name,utc,latitudeDeg:latitude,radiusMm:radius,oracleDeclinationDeg:declination,
  selectedMarkers:count,calendarGeometrySha256:sha(JSON.stringify(design.dial)),svgSha256:sha(svg)});
 for(const dialType of ['horizontal','vertical','equatorial']){
  const polar=captureDesign({...settings,dialType,wallDeclinationDeg:25},instant);
  controls.push({name:`${name}-${dialType}`,svgSha256:sha(designSvg(polar,'laser'))});
 }
}
const instant=new Date('2026-10-17T01:00:00Z'),settings={...defaultState(instant),latitudeDeg:-33.8688,
 longitudeDeg:151.2093,timeZone:'Australia/Sydney',dialType:'analemmatic',radiusMm:90,numerals:'arabic',
 theme:'blueprint',mottoIndex:null,timeMode:'apparent',simMode:'custom'};
await writeFile(resolve(out,'Sydney-October.gnomon.json'),saveDesignFile(settings,instant));
let revision=null;try{revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Source archives have no Git metadata. */}
await writeFile(resolve(out,'replay.json'),JSON.stringify({phase,sourceRevision:revision,
 scope:'Controlled selected-date native drawings and unchanged polar/calendar geometry; not physical printing or field accuracy.',
 oracle:{file:'tests/fixtures/solar-oracle.json',sha256:sha(fixtureBytes),source:fixture.source},cases,polarControls:controls},null,2)+'\n');
log(JSON.stringify({phase,drawings:cases.length,polarControls:controls.length}));
