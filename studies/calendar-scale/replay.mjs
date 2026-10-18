// Native calendar scales and unchanged non-zodiac control drawings.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [source,output]=process.argv.slice(2);assert(source&&output);
const root=resolve(source),out=resolve(output);await mkdir(out,{recursive:true});
const from=path=>import(pathToFileURL(resolve(root,path)).href);
const {captureDesign,designSvg}=await from('src/design.ts');
const {defaultState}=await from('src/state.ts');
const {saveDesignFile}=await from('src/design-file.ts');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const instant=new Date('2026-10-17T01:00:00Z'),cases=[],controls=[];
for(const latitude of [-90,-80,-45,-10,10,45,80,90])for(const radius of [30,90,400])for(const zodiac of [false,true]){
 const settings={...defaultState(instant),latitudeDeg:latitude,longitudeDeg:0,timeZone:'Etc/UTC',
  dialType:'analemmatic',radiusMm:radius,numerals:'arabic',mottoIndex:null,timeMode:'apparent',showZodiac:zodiac};
 const design=captureDesign(settings,instant),svg=designSvg(design,'laser'),name=`${latitude}-${radius}-${zodiac?'zodiac':'calendar'}`;
 await writeFile(resolve(out,name+'.svg'),svg);
 cases.push({name,latitudeDeg:latitude,radiusMm:radius,zodiac,marks:design.dial.dateScale,svgSha256:sha(svg),hourGeometrySha256:sha(JSON.stringify(design.dial.hourPoints))});
 if(!zodiac)for(const dialType of ['horizontal','vertical','equatorial']){
  const polar=captureDesign({...settings,dialType,wallDeclinationDeg:25},instant);
  controls.push({name:`${name}-${dialType}`,svgSha256:sha(designSvg(polar,'laser'))});
 }
}
const settings={...defaultState(instant),latitudeDeg:-33.8688,longitudeDeg:151.2093,timeZone:'Australia/Sydney',
 dialType:'analemmatic',radiusMm:90,numerals:'arabic',theme:'blueprint',mottoIndex:null,timeMode:'apparent',showZodiac:true,simMode:'custom'};
await writeFile(resolve(out,'Sydney-zodiac.gnomon.json'),saveDesignFile(settings,instant));
let revision=null;try{revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Archives have no Git directory. */}
await writeFile(resolve(out,'replay.json'),JSON.stringify({sourceRevision:revision,scope:'Authored native standing-scale drawings and non-zodiac controls, including limiting polar latitudes. No field measurements.',cases,polarControls:controls},null,2)+'\n');
log(JSON.stringify({drawings:cases.length,polarControls:controls.length}));
