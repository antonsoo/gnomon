// Actual editable-file, SVG and PNG downloads, then native SVG inspection offline.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium,firefox } from 'playwright';
const [url,input,output,phase]=process.argv.slice(2);assert(url&&input&&output&&['before','after'].includes(phase));
const out=resolve(output);await mkdir(out,{recursive:true});const file=await readFile(input),settings=JSON.parse(file);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const records=[];
for(const [engine,launcher] of Object.entries({chromium,firefox})){
 const browser=await launcher.launch();
 try{
  for(const width of [1440,375]){
   const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Tokyo',locale:'en-US',colorScheme:'light'});
   try{
    const page=await context.newPage(),errors=[],lateRequests=[];let disconnected=false;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(disconnected&&/^https?:/.test(r.url()))lateRequests.push(r.url());});
    await page.goto(url);await page.evaluate(()=>document.fonts.ready);await context.setOffline(true);disconnected=true;
    await page.getByLabel('Gnomon design file',{exact:true}).setInputFiles({name:'Sydney-October.gnomon.json',mimeType:'application/json',buffer:file});
    await page.locator('#design-file-status').filter({hasText:'Opened Sydney-October.gnomon.json'}).waitFor();
    assert.equal(await page.locator('.stage-canvas [data-selected-minute]').count(),phase==='after'?1:0);
    if(phase==='after'){
     assert.equal(await page.locator('[data-selected-minute]').getAttribute('data-selected-minute'),settings.utcInstant);
     assert.equal(await page.getByLabel('Date for the standing mark',{exact:true}).isVisible(),true);
     assert.equal(await page.getByLabel('Local time for the standing mark',{exact:true}).isVisible(),true);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:resolve(out,`${engine}-${width}-designer.png`),fullPage:true});
    const download=async(name,suffix)=>{
     const ready=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
     const item=await ready,bytes=await readFile(await item.path());const nameOut=`${engine}-${width}.${suffix}`;
     await writeFile(resolve(out,nameOut),bytes);return {name:nameOut,bytes,sha256:sha(bytes)};
    };
    const svg=await download('Download SVG','svg');
    const png=await download('PNG','png');
    assert.equal(png.bytes.subarray(1,4).toString(),'PNG');
    const pixelWidth=png.bytes.readUInt32BE(16),pixelHeight=png.bytes.readUInt32BE(20);
    const match=/width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg.bytes.toString());assert(match);
    const widthMm=Number(match[1]),heightMm=Number(match[2]);
    assert(pixelWidth*pixelHeight<=16000000&&pixelWidth<=8192&&pixelHeight<=8192);
    assert(Math.abs(pixelWidth/pixelHeight-widthMm/heightMm)<.002);
    const saved=await download('Save design','gnomon.json');assert(saved.bytes.equals(file));
    let edited=null;
    if(phase==='after'){
     const initialY=await page.locator('[data-selected-minute]').getAttribute('cy');
     await page.getByLabel('Local time for the standing mark',{exact:true}).fill('18:00');
     await page.waitForFunction(()=>document.querySelector('[data-selected-minute]')?.getAttribute('data-selected-minute')==='2026-10-17T07:00:00.000Z');
     assert.notEqual(await page.locator('[data-selected-minute]').getAttribute('cy'),initialY);
     const drawing=await download('Download SVG','edited.svg');
     const inputs=await download('Save design','edited.gnomon.json');
     assert.equal(JSON.parse(inputs.bytes).utcInstant,'2026-10-17T07:00:00.000Z');
     edited={svg:drawing.name,sha256:drawing.sha256,utcInstant:'2026-10-17T07:00:00.000Z',savedInputsSha256:inputs.sha256};
    }
    const drawing=await context.newPage();await drawing.goto(pathToFileURL(resolve(out,svg.name)).href);
    const markers=await drawing.locator('circle[data-selected-minute]').count();assert.equal(markers,phase==='after'?1:0);
    assert.equal(await drawing.locator('script').count(),0);
    const textOverflow=await drawing.evaluate(()=>{
     const svg=document.querySelector('svg'),box=svg.viewBox.baseVal;
     return [...svg.querySelectorAll('text')].filter(node=>{
      const b=node.getBBox();return b.x<-.1||b.y<-.1||b.x+b.width>box.width+.1||b.y+b.height>box.height+.1;
     }).map(node=>node.textContent);
    });
    if(phase==='after')assert.deepEqual(textOverflow,[]);
    await drawing.locator('svg').screenshot({path:resolve(out,`${engine}-${width}-drawing.png`)});
    assert.deepEqual(errors,[]);assert.deepEqual(lateRequests,[]);
    records.push({engine,width,phase,svg:svg.name,svgSha256:svg.sha256,png:png.name,pngSha256:png.sha256,
     pixelWidth,pixelHeight,widthMm,heightMm,savedInputsSha256:saved.sha256,selectedMarkers:markers,textOverflow,errors,lateRequests,edited});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
await writeFile(resolve(out,'browser.json'),JSON.stringify({url,phase,input:{latitudeDeg:settings.latitudeDeg,radiusMm:settings.radiusMm,utcInstant:settings.utcInstant},scope:'Actual offline native SVG/PNG and unchanged portable-input downloads; native text bounds, no physical printing or field measurement.',records},null,2)+'\n');
log(JSON.stringify({phase,contexts:records.length}));
