// Inspect native SVG captions in both actual browser font renderers, in millimetres.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium,firefox } from 'playwright';
const [directory,output]=process.argv.slice(2);assert(directory&&output);
const manifest=JSON.parse(await readFile(resolve(directory,'replay.json'),'utf8'));
const records=[];
for(const [engine,launcher] of Object.entries({chromium,firefox})){
 const browser=await launcher.launch();
 try{
  const context=await browser.newContext({offline:true});
  const page=await context.newPage();
  for(const item of manifest.cases){
   await page.goto(pathToFileURL(resolve(directory,item.name+'.svg')).href);
   const result=await page.evaluate(()=>{
    const svg=document.querySelector('svg'),view=svg.viewBox.baseVal;
    const rows=[...svg.querySelectorAll('text')].map(node=>{
     const b=node.getBBox();return {text:node.textContent,x:b.x,y:b.y,width:b.width,height:b.height};
    });
    return {widthMm:view.width,heightMm:view.height,rows};
   });
   const bad=result.rows.filter(b=>b.x<-.1||b.y<-.1||b.x+b.width>result.widthMm+.1||b.y+b.height>result.heightMm+.1);
   assert.deepEqual(bad,[],`${engine} ${item.name}`);
   records.push({engine,case:item.name,...result});
  }
  await context.close();
 }finally{await browser.close();}
}
await writeFile(output,JSON.stringify({scope:'Actual native SVG text bounds in browser user units, two font renderers. No screenshot or pixel-size approximation.',records},null,2)+'\n');
log(JSON.stringify({layouts:records.length,textOverflow:0}));
