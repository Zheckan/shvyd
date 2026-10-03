#!/usr/bin/env python3
"""Check the live playground without an extension in an isolated Helium profile.

Start `bun run dev` with a configured provider key first. This makes a few live
translations and changes the demo preferences; it leaves regular browser profiles alone.
"""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import importlib.util
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('extension_checks', ROOT / 'scripts/check-extension.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CDP, wait_for = module.CDP, module.wait_for
output = ROOT / '.preview/demo-check'
output.mkdir(exist_ok=True)
checks = []
with tempfile.TemporaryDirectory(prefix='shvyd-demo-') as profile:
    process = subprocess.Popen([module.BROWSER, '--headless=new', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--user-data-dir='+profile,
        '--remote-debugging-port=0', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    page = None
    try:
        port_file = Path(profile) / 'DevToolsActivePort'
        wait_for(lambda: port_file.exists(), 'browser startup')
        port = int(port_file.read_text().splitlines()[0])
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list') as response: tabs = json.load(response)
        page = CDP(next(x for x in tabs if x['type']=='page')['webSocketDebuggerUrl'])
        page.call('Runtime.enable')
        page.call('Page.enable')
        page.call('Emulation.setDeviceMetricsOverride', {'width':1280,'height':900,'deviceScaleFactor':1,'mobile':False})
        time.sleep(2)
        page.call('Page.navigate', {'url':'http://127.0.0.1:5173/'})
        wait_for(lambda: page.evaluate("document.readyState==='complete' && !!document.getElementById('shvyd-root')"), 'live demo startup')
        time.sleep(2)
        wait_for(lambda: page.evaluate("document.readyState==='complete' && !!document.getElementById('shvyd-root')"), 'stable live demo startup')
        page.evaluate("window.shvydDemoErrors=[];addEventListener('unhandledrejection',e=>shvydDemoErrors.push(String(e.reason?.message ?? e.reason)));addEventListener('error',e=>shvydDemoErrors.push(e.message));")

        def click(selector, shadow=False):
            prefix="document.getElementById('shvyd-root').shadowRoot" if shadow else 'document'
            coords=page.evaluate(f"(() => {{const e={prefix}.querySelector({json.dumps(selector)});e.scrollIntoView({{block:'center'}});const r=e.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
            page.call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**coords})
            page.call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**coords})

        def complete(target):
            wait_for(lambda:page.evaluate("(() => {const r=document.getElementById('shvyd-root').shadowRoot,p=r.querySelector('.panel'),o=r.querySelector('.translation');return !p.hidden && p.getAttribute('aria-busy')==='false' && o.lang===TARGET && o.textContent.length>0;})()".replace('TARGET',json.dumps(target))), 'demo translation to '+target)
            value=page.evaluate("(() => {const r=document.getElementById('shvyd-root').shadowRoot,o=r.querySelector('.translation');return {target:o.lang,direction:o.dir,text:o.textContent,error:!r.querySelector('.actions').hidden};})()")
            assert not value['error']
            return value

        def select():
            page.evaluate("(() => {const p=document.getElementById('sample-text');p.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);})()")
            wait_for(lambda:page.evaluate("!document.getElementById('shvyd-root').shadowRoot.querySelector('.bubble').hidden"),'demo selection button')
            click('.bubble', True)

        click('#open-demo-settings')
        wait_for(lambda: page.evaluate("document.getElementById('demo-settings').open"),'settings dialog')
        page.evaluate("""(() => {
          const f=document.getElementById('demo-preferences'),m=f.querySelector('[name=targetMode]');m.value='fixed';m.dispatchEvent(new Event('change'));
          const t=f.querySelector('[name=target]');t.value='uk';t.dispatchEvent(new Event('change'));
          const c=f.querySelector('.favorite-list input[value=ar]');c.checked=true;c.dispatchEvent(new Event('change'));
          f.requestSubmit();
        })()""")
        try:
            wait_for(lambda:page.evaluate("document.getElementById('demo-settings-status').textContent.startsWith('Saved.')"),'demo settings saved')
        except Exception:
            print(page.evaluate("({epoch:performance.timeOrigin,status:document.getElementById('demo-settings-status').textContent,valid:document.getElementById('demo-preferences').checkValidity(),errors:window.shvydDemoErrors,globalStatus:window.status,href:location.href})"))
            raise
        checks.append({'check':'demo-settings-save','passed':True})
        click('#close-demo-settings')
        select()
        checks.append({'check':'demo-default-target',**complete('uk')})
        click('.target',True)
        click('[data-language=ar]',True)
        value=complete('ar')
        assert value['direction']=='rtl'
        checks.append({'check':'demo-temporary-target',**value})
        click('button[aria-label="Close translation"]',True)
        select()
        checks.append({'check':'demo-default-reset-on-close',**complete('uk')})
        click('.target',True)
        screenshot=page.call('Page.captureScreenshot',{'format':'png'})
        (output/'preferred-menu.png').write_bytes(base64.b64decode(screenshot['data']))
        click('.more-languages',True)
        page.evaluate("(() => {const s=document.getElementById('shvyd-root').shadowRoot.querySelector('.language-search');s.value='Chinese';s.dispatchEvent(new Event('input'));})()")
        assert page.evaluate("!!document.getElementById('shvyd-root').shadowRoot.querySelector('[data-language=zh-hant]')")
        checks.append({'check':'demo-additional-language-search','passed':True})
        screenshot=page.call('Page.captureScreenshot',{'format':'png'})
        (output/'search-menu.png').write_bytes(base64.b64decode(screenshot['data']))
        (output/'results.json').write_text(json.dumps({'passed':True,'browser':'Helium','isolatedProfile':True,'extensionLoaded':False,'checks':checks},ensure_ascii=False,indent=2))
        print(json.dumps({'passed':True,'checks':len(checks)}))
    finally:
        if page: page.close()
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill();process.wait(timeout=5)
