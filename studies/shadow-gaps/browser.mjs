import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { log } from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
const [url, designArg, outputArg, phase] = process.argv.slice(2);
assert.ok(url && designArg && outputArg && ['before','after'].includes(phase));
const output=resolve(outputArg),design=await readFile(resolve(designArg));
await mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const records=[];
for(const [engine,launcher]of Object.entries({chromium,firefox})){
 const browser=await launcher.launch();
 try{for(const width of[1440,375]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  const page=await context.newPage(),errors=[],requests=[],late=[];let offline=false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())){requests.push(r.url());if(offline)late.push(r.url());}});
  try{
   await page.goto(url);await page.evaluate(()=>document.fonts.ready);
   await context.setOffline(true);offline=true;
   await page.getByLabel('Gnomon design file',{exact:true}).setInputFiles({name:'Polar-wall.gnomon.json',mimeType:'application/json',buffer:design});
   await page.locator('#design-file-status').filter({hasText:'Opened Polar-wall.gnomon.json'}).waitFor();
   const scene=page.locator('.stage-canvas svg');
   const datePaths=await scene.locator('path[stroke-width="0.25"]').count();
   assert.equal(datePaths,phase==='before'?2:3);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const stem=`${engine}-${width}`;
   await page.screenshot({path:resolve(output,`${stem}-designer.png`),fullPage:true,animations:'disabled'});
   let pending=page.waitForEvent('download');
   await page.getByRole('button',{name:'Download SVG',exact:true}).click();
   const vector=await pending;assert.equal(await vector.failure(),null);
   const svgName=`${stem}.svg`;await vector.saveAs(resolve(output,svgName));
   pending=page.waitForEvent('download');
   await page.getByRole('button',{name:'Save design',exact:true}).click();
   const portable=await pending;assert.equal(await portable.failure(),null);
   assert.equal(sha(await readFile(await portable.path())),sha(design));
   const pdfs=[];
   for(const paper of['A4','Letter']){
    pending=page.waitForEvent('download');
    await page.getByRole('button',{name:`PDF (${paper})`,exact:true}).click();
    const pdf=await pending;assert.equal(await pdf.failure(),null);
    const name=`${stem}-${paper}.pdf`;await pdf.saveAs(resolve(output,name));
    pdfs.push({file:name,paper,sha256:sha(await readFile(resolve(output,name)))});
   }
   const standalone=await context.newPage();
   try{
    await standalone.goto(pathToFileURL(resolve(output,svgName)).href);
    assert.equal(await standalone.locator('path[stroke-width="0.25"]').count(),datePaths);
    assert.equal(await standalone.locator('script').count(),0);
    await standalone.locator('svg').first().screenshot({path:resolve(output,`${stem}-drawing.png`)});
   }finally{await standalone.close();}
   assert.deepEqual(errors,[]);assert.deepEqual(late,[]);
   assert.ok(requests.every(address=>address.startsWith(new URL(url).origin)));
   records.push({engine,width,phase,svg:svgName,svgSha256:sha(await readFile(resolve(output,svgName))),pdfs,
                 datePaths,portableInputSha256:sha(design),errors,lateRequests:late,requests});
  }finally{await context.close();}
 }}finally{await browser.close();}
}
await writeFile(resolve(output,'browser.json'),JSON.stringify({url,phase,case:'north-west-90',
 scope:'Actual offline designer, original portable inputs, native SVG and A4/Letter construction kits. Independent metrology reads the saved vectors; no physical printing or field observation.',records},null,2)+'\n');
log(JSON.stringify({contexts:records.length,svgDownloads:records.length,pdfDownloads:records.reduce((n,r)=>n+r.pdfs.length,0)}));
