import { test, expect } from '@playwright/test';
import { captureDesign, designSvg } from '../../src/design.ts';
import { defaultState } from '../../src/state.ts';

test('native calendar labels remain distinct and inside the drawing at small, large and polar layouts', async ({ page }) => {
  const drawings=[];
  const instant=new Date('2026-10-17T01:00:00Z');
  for(const latitudeDeg of [-90,-80,-45,-10,10,45,80,90])for(const radiusMm of [30,90,400])for(const showZodiac of [false,true])for(const numerals of ['arabic','roman']){
    const design=captureDesign({...defaultState(instant),latitudeDeg,longitudeDeg:0,timeZone:'Etc/UTC',dialType:'analemmatic',radiusMm,showZodiac,numerals,mottoIndex:null},instant);
    drawings.push({name:`${latitudeDeg}/${radiusMm}/${showZodiac}/${numerals}`,svg:designSvg(design,'laser'),showZodiac});
  }
  await page.setContent('<main></main>');
  const failures=await page.evaluate(inputs=>{
    const failures=[];
    for(const input of inputs){
      document.querySelector('main').innerHTML=input.svg;
      const svg=document.querySelector('svg'),view=svg.viewBox.baseVal;
      const labels=[...svg.querySelectorAll('text')].map(node=>({text:node.textContent,box:node.getBBox()}));
      for(const row of labels){
        const b=row.box;
        if(b.x<-.1||b.y<-.1||b.x+b.width>view.width+.1||b.y+b.height>view.height+.1)failures.push(`${input.name}: clipped ${row.text}`);
      }
      // Inspect actual glyph boxes. Calendar text includes old inline names,
      // new callouts and the printed key; unchanged hour numerals stay separate.
      const calendar=[...svg.querySelectorAll('text[font-size="2.6"]')].map(node=>({text:node.textContent,box:node.getBBox()}));
      for(let i=0;i<calendar.length;i++)for(let j=i+1;j<calendar.length;j++){
        const a=calendar[i].box,b=calendar[j].box;
        if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.1)
          failures.push(`${input.name}: ${calendar[i].text} overlaps ${calendar[j].text}`);
      }
      if(input.showZodiac)for(const sign of ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']){
        if(!labels.some(row=>row.text.includes(sign)))failures.push(`${input.name}: missing ${sign}`);
      }
    }
    return failures;
  },drawings);
  expect(failures).toEqual([]);
});
