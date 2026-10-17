import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { log } from 'node:console';
import { chromium, firefox } from 'playwright';
const [url, designArg, outputArg, phase] = process.argv.slice(2);
assert.ok(url && designArg && outputArg && ['before','after'].includes(phase), 'URL DESIGN_FILE OUTPUT_DIR before|after');
const output = resolve(outputArg);
await mkdir(output, { recursive: true });
const drawingInput = await readFile(resolve(designArg));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const results=[];
for (const [engine, launcher] of Object.entries({chromium,firefox})) {
  const browser=await launcher.launch();
  try {
    for (const width of [1440,375]) {
      const context=await browser.newContext({viewport:{width,height:1000}});
      const page=await context.newPage(), errors=[], requests=[], lateRequests=[];
      let disconnected=false;
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(/^https?:/.test(r.url())) {requests.push(r.url());if(disconnected)lateRequests.push(r.url());}});
      try {
        await page.goto(url);
        await page.evaluate(()=>document.fonts.ready);
        await context.setOffline(true);disconnected=true;
        await page.getByLabel('Gnomon design file',{exact:true}).setInputFiles({name:'Sydney.gnomon.json',mimeType:'application/json',buffer:drawingInput});
        await page.locator('#design-file-status').filter({hasText:'Opened Sydney.gnomon.json'}).waitFor();
        const svg=page.locator('.stage-canvas svg');
        const labels=await svg.locator('text').allTextContents();
        assert.ok(labels.includes(phase==='before'?'Summer solstice':'June solstice'));
        assert.ok(labels.includes(phase==='before'?'Winter solstice':'December solstice'));
        if (phase === 'after') assert.match(await page.locator('#instructions').innerText(), /Use a vertical rod, checked with a plumb line/);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const stem=`${engine}-${width}`;
        await page.screenshot({path:resolve(output,`${stem}-designer.png`),fullPage:true,animations:'disabled'});
        let pending=page.waitForEvent('download');
        await page.getByRole('button',{name:'Download SVG',exact:true}).click();
        const download=await pending;assert.equal(await download.failure(),null);
        const svgPath=resolve(output,`${stem}.svg`);await download.saveAs(svgPath);
        pending=page.waitForEvent('download');
        await page.getByRole('button',{name:'Save design',exact:true}).click();
        const saved=await pending;assert.equal(await saved.failure(),null);
        const bytes=await readFile(await saved.path());
        assert.equal(sha(bytes),sha(drawingInput));
        const standalone=await context.newPage();
        try {
          await standalone.goto(pathToFileURL(svgPath).href);
          const evidence=await standalone.evaluate(()=>({
            width:document.documentElement.getAttribute('width'),height:document.documentElement.getAttribute('height'),
            labels:[...document.querySelectorAll('text')].filter(t=>/solstice|Equinox/.test(t.textContent)).map(t=>({label:t.textContent,x:t.getAttribute('x'),y:t.getAttribute('y')})),
            scripts:document.querySelectorAll('script').length,
          }));
          assert.equal(evidence.width,'234mm');assert.equal(evidence.height,'234mm');assert.equal(evidence.scripts,0);
          await standalone.locator('svg').first().screenshot({path:resolve(output,`${stem}-drawing.png`)});
          results.push({engine,width,phase,inputSha256:sha(drawingInput),svgSha256:sha(await readFile(svgPath)),evidence,errors,requests,lateRequests});
        } finally {await standalone.close();}
        assert.deepEqual(errors,[]);assert.deepEqual(lateRequests,[]);
        assert.ok(requests.every(u=>u.startsWith(new URL(url).origin)));
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
await writeFile(resolve(output,'browser.json'),JSON.stringify({url,phase,scope:'Actual designer opened a portable Sydney setup after disconnecting; native SVG and design-file downloads, standalone SVG reopen. No physical field measurement.',results},null,2)+'\n');
log(JSON.stringify({contexts:results.length,offlineDrawings:results.length,portableFilesUnchanged:results.length}));
