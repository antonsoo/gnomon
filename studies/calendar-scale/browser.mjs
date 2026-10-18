// Real offline designer, native SVG/PNG and portable inputs. No rendering substitute.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium,firefox } from 'playwright';
const [url,input,output,phase]=process.argv.slice(2);assert(url&&input&&output&&['before','after'].includes(phase));
const file=await readFile(input),out=resolve(output);await mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),records=[];
const signs=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
for(const [engine,launcher] of Object.entries({chromium,firefox})){
 const browser=await launcher.launch();
 try{
  for(const width of [1440,375]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   try{
    const errors=[],lateRequests=[];let disconnected=false;
    context.on('request',r=>{if(disconnected&&/^https?:/.test(r.url()))lateRequests.push(r.url());});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.evaluate(()=>document.fonts.ready);await context.setOffline(true);disconnected=true;
    await page.getByLabel('Gnomon design file',{exact:true}).setInputFiles({name:'Sydney-zodiac.gnomon.json',mimeType:'application/json',buffer:file});
    await page.locator('#design-file-status').filter({hasText:'Opened Sydney-zodiac.gnomon.json'}).waitFor();
    await page.screenshot({path:resolve(out,`${engine}-${width}-designer.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const download=async(name,suffix)=>{
     const ready=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
     const item=await ready,bytes=await readFile(await item.path()),nameOut=`${engine}-${width}.${suffix}`;
     await writeFile(resolve(out,nameOut),bytes);return {name:nameOut,bytes,sha256:sha(bytes)};
    };
    const svg=await download('Download SVG','svg'),png=await download('PNG','png'),saved=await download('Save design','gnomon.json');
    assert(saved.bytes.equals(file));assert.equal(png.bytes.subarray(1,4).toString(),'PNG');
    const drawing=await context.newPage();await drawing.goto(pathToFileURL(resolve(out,svg.name)).href);
    const missing=signs.filter(sign=>!svg.bytes.toString().includes(sign));assert.equal(missing.length,phase==='before'?2:0);
    await drawing.locator('svg').screenshot({path:resolve(out,`${engine}-${width}-drawing.png`)});
    const geometry=await drawing.evaluate(()=>{
     const svg=document.querySelector('svg'),v=svg.viewBox.baseVal;
     return {widthMm:v.width,heightMm:v.height,keys:[...svg.querySelectorAll('[data-calendar-key]')].map(group=>({key:group.getAttribute('data-calendar-key'),label:group.querySelector('title').textContent,path:group.querySelector('path').getAttribute('d')}))};
    });
    if(phase==='after')assert.equal(geometry.keys.length,7);
    const pixelWidth=png.bytes.readUInt32BE(16),pixelHeight=png.bytes.readUInt32BE(20);
    assert(Math.abs(pixelWidth/pixelHeight-geometry.widthMm/geometry.heightMm)<.002);
    await page.getByLabel('Zodiac entries',{exact:true}).uncheck();
    const plain=await download('Download SVG','plain.svg'),plainInputs=await download('Save design','plain.gnomon.json');
    assert.deepEqual(JSON.parse(plainInputs.bytes),{...JSON.parse(file),showZodiac:false});
    assert.deepEqual(errors,[]);assert.deepEqual(lateRequests,[]);
    records.push({engine,width,svgSha256:svg.sha256,pngSha256:png.sha256,savedInputsSha256:saved.sha256,
     plainSvgSha256:plain.sha256,plainInputsSha256:plainInputs.sha256,pixelWidth,pixelHeight,missing,...geometry,errors,lateRequests});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
await writeFile(resolve(out,'browser.json'),JSON.stringify({url,phase,inputSha256:sha(file),scope:'Actual public/local native SVG/PNG and editable-file downloads after disconnecting, plus zodiac-off controls. No physical printing or field measurement.',contexts:records.length,downloads:records.length*5,records},null,2)+'\n');
log(JSON.stringify({phase,contexts:records.length,downloads:records.length*5}));
