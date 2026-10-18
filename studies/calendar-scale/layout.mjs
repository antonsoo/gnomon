// Native text metrology: glyph intersections and clipping, not image hashes.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium,firefox } from 'playwright';
const [directory,output,phase]=process.argv.slice(2);assert(directory&&output&&['before','after'].includes(phase));
const manifest=JSON.parse(await readFile(resolve(directory,'replay.json'),'utf8')),records=[];
await mkdir(output,{recursive:true});
for(const [engine,launcher] of Object.entries({chromium,firefox})){
 const browser=await launcher.launch();
 try{
  const context=await browser.newContext({offline:true}),page=await context.newPage();
  for(const item of manifest.cases){
   await page.goto(pathToFileURL(resolve(directory,item.name+'.svg')).href);
   const result=await page.evaluate(()=>{
    const svg=document.querySelector('svg'),view=svg.viewBox.baseVal;
    const rows=[...svg.querySelectorAll('text')].map(node=>{const b=node.getBBox();return {text:node.textContent,size:node.getAttribute('font-size'),x:b.x,y:b.y,width:b.width,height:b.height};});
    const outside=rows.filter(b=>b.x<-.1||b.y<-.1||b.x+b.width>view.width+.1||b.y+b.height>view.height+.1).map(b=>b.text);
    const calendar=rows.filter(b=>b.size==='2.6'),overlaps=[];
    for(let i=0;i<calendar.length;i++)for(let j=i+1;j<calendar.length;j++){
     const a=calendar[i],b=calendar[j];
     if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.1)overlaps.push([a.text,b.text]);
    }
    return {widthMm:view.width,heightMm:view.height,outside,overlaps,rows};
   });
   const signs=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
   const missing=item.zodiac?signs.filter(sign=>!result.rows.some(row=>row.text.includes(sign))):[];
   records.push({engine,name:item.name,zodiac:item.zodiac,missing,...result});
   if(['45-90-zodiac','80-30-zodiac','90-30-zodiac'].includes(item.name))await page.locator('svg').screenshot({path:resolve(output,`${engine}-${item.name}.png`)});
  }
  await context.close();
 }finally{await browser.close();}
}
const result={phase,scope:'Independent actual native SVG glyph boxes in millimetres. Before/after labels, unchanged physical hour marks checked separately.',layouts:records.length,clippedLabels:records.reduce((n,r)=>n+r.outside.length,0),overlappingPairs:records.reduce((n,r)=>n+r.overlaps.length,0),missingSignLabels:records.reduce((n,r)=>n+r.missing.length,0),records};
await writeFile(resolve(output,'layouts.json'),JSON.stringify(result,null,2)+'\n');
log(JSON.stringify({phase,layouts:result.layouts,clippedLabels:result.clippedLabels,overlappingPairs:result.overlappingPairs,missingSignLabels:result.missingSignLabels}));
if(phase==='after'){assert.equal(result.clippedLabels,0);assert.equal(result.overlappingPairs,0);assert.equal(result.missingSignLabels,0);}
