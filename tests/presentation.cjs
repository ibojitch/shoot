// Browser regression: run with Playwright installed or supplied via NODE_PATH.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'shoot-presentation-'));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{let data=fs.readFileSync(file);if(path.basename(file)==='game.js')data=Buffer.concat([data,Buffer.from('\nglobalThis.__testGame=game;')]);
    res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url);await page.waitForFunction(()=>!!globalThis.__testGame);
    await page.screenshot({path:path.join(output,'title.png')});
    for(const viewport of [{width:857,height:482},{width:667,height:375},{width:360,height:740}]){
      await page.setViewportSize(viewport);
      for(const title of ['I-JIGEN SHOT','MISSION CLEAR','GAME OVER']){
        await page.evaluate(title=>__testGame.ui.show(title,'FINAL SCORE 005000','RESTART'),title);
        const fits=await page.locator('#title').evaluate(el=>{const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();return text.left>=0&&text.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1&&r.bottom<=innerHeight;});
        assert.ok(fits,`${title} clipped at ${viewport.width}`);
      }
      await page.screenshot({path:path.join(output,`title-fit-${viewport.width}.png`)});
    }
    await page.setViewportSize({width:1280,height:720});
    const drift=await page.evaluate(()=>{const g=__testGame,before=g.scenery.spaceOffset;g.animateBackground(2);return (g.scenery.spaceOffset-before)/((g.camera.right-g.camera.left)/innerWidth);});
    assert.ok(Math.abs(drift-1)<1e-6);

    await page.locator('#start').click();
    await page.evaluate(()=>{__testGame.debugInvincible=true;});
    await page.waitForTimeout(700);
    await page.screenshot({path:path.join(output,'space.png')});
    await page.evaluate(()=>{__testGame.beginStage2();__testGame.stageScroll=85;__testGame.terrain.update(85);});
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>__testGame.audio.scene),'fortress');
    await page.screenshot({path:path.join(output,'fortress.png')});
    const flight=await page.evaluate(()=>{
      const g=__testGame;g.togglePause();const m=g.missiles[0],t=g.terrain,start=35;t.update(start);const gap=t.safeGap(-10,.22);
      m.activate(-10,gap.bottom+.7,{active:true,generation:1,x:30,y:-9},3,-.25);
      const headings=[];let hit=false;
      for(let i=0;i<100;i++){t.update(start+(i+1)*3/60);m.update(1/60,t);headings.push(m.heading);if(Number.isFinite(t.hitTime(m)))hit=true;}
      const result={hit,active:m.active,x:m.x,rotation:m.mesh.rotation.z,heading:m.heading,turned:Math.max(...headings)-Math.min(...headings)>.1};
      m.deactivate();g.resume();return result;
    });
    assert.equal(flight.hit,false);assert.equal(flight.active,true);assert.ok(flight.x>5);assert.ok(flight.turned);assert.equal(flight.rotation,flight.heading);
    await page.evaluate(()=>{__testGame.stageScroll=200;__testGame.updateStage2(0);__testGame.battleship.x=9;});
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>__testGame.audio.scene),'boss');
    for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:667,height:375}]){
      await page.setViewportSize(viewport);
      const bounds=await page.evaluate(()=>{
        const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {bar:rect('.enemy-health-track'),name:rect('#enemy-hp-name'),panel:rect('#enemy-hp'),hud:rect('.hud'),charge:rect('.charge-panel'),debug:['#enemy-hp-status','#enemy-hp-value'].map(id=>getComputedStyle(document.querySelector(id)).display)};
      });
      assert.ok(bounds.name.bottom<=bounds.bar.y,JSON.stringify(bounds));assert.ok(bounds.bar.width>=230);assert.ok(bounds.bar.height>=11);
      assert.ok(bounds.panel.x>=0&&bounds.panel.right<=viewport.width);assert.ok(bounds.panel.y>=bounds.hud.bottom,JSON.stringify({viewport,bounds}));
      assert.ok(bounds.panel.x>=bounds.charge.right||bounds.panel.bottom<=bounds.charge.y||bounds.panel.y>=bounds.charge.bottom);
      assert.deepEqual(bounds.debug,['none','none']);
      await page.screenshot({path:path.join(output,`boss-${viewport.width}.png`)});
    }
    await page.locator('#pause').click();assert.equal(await page.evaluate(()=>__testGame.audio.playing),false);
    const frozen=await page.evaluate(()=>__testGame.scenery.time);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__testGame.scenery.time),frozen);
    await page.locator('#start').click();
    await page.goto(url+'/?debugBattleship=1&debugHud=1&debugInvincible=1');await page.waitForFunction(()=>!!globalThis.__testGame);await page.locator('#start').click();await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#enemy-hp-value').innerText(),'');assert.equal(await page.locator('#enemy-hp-status').isVisible(),true);
    await page.evaluate(()=>{__testGame.start();});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>__testGame.audio.scene),'space');assert.equal(await page.locator('#enemy-hp').isVisible(),false);
    const mobile=await browser.newPage({viewport:{width:667,height:375},isMobile:true,hasTouch:true});
    mobile.on('pageerror',error=>errors.push(error.message));
    await mobile.goto(url+'/?debugBattleship=1&debugInvincible=1');await mobile.waitForFunction(()=>!!globalThis.__testGame);await mobile.locator('#start').tap();await mobile.waitForTimeout(200);
    assert.equal(await mobile.locator('#fire').isVisible(),true);assert.equal(await mobile.locator('#rotate-guide').isVisible(),false);
    assert.equal(await mobile.locator('#enemy-hp-value').isVisible(),false);
    await mobile.screenshot({path:path.join(output,'boss-touch.png')});await mobile.close();
    assert.deepEqual(errors,[]);console.log('PASS: title, both backgrounds, scene music, desktop/mobile boss HUD, touch controls, debug visibility, pause/resume and restart; no page errors');console.log('Screenshots: '+output);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
