#!/usr/bin/env python3
"""Check the standalone HTML and local-file extension access in a temporary Helium profile.

Run pnpm build:playground and pnpm build:local first. No test-page server is used.
Requires the existing websocket-client Python dependency.
"""
import base64
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / '.preview' / 'file-playground-check'
spec = importlib.util.spec_from_file_location('extension_check', ROOT / 'scripts/check-extension.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CDP, wait_for = module.CDP, module.wait_for


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = []
    connections = []
    with tempfile.TemporaryDirectory(prefix='shvyd-file-page-') as temporary:
        folder = Path(temporary)
        fixture = folder / 'Standalone test page.html'
        shutil.copyfile(ROOT / 'dist/playground.html', fixture)
        profile = folder / 'profile'
        process = subprocess.Popen([
            module.BROWSER, '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--user-data-dir=' + str(profile), '--remote-debugging-port=0',
            '--disable-extensions-except=' + str(ROOT / 'dist'), '--load-extension=' + str(ROOT / 'dist'), 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = profile / 'DevToolsActivePort'
            wait_for(port_file.exists, 'isolated browser startup', 12)
            port = int(port_file.read_text().splitlines()[0])

            def targets():
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as response:
                    return json.load(response)

            page = CDP(next(item for item in targets() if item['type'] == 'page')['webSocketDebuggerUrl'])
            connections.append(page)
            page.call('Page.enable')
            page.call('Runtime.enable')
            page.call('Emulation.setDeviceMetricsOverride', {'width':1280,'height':900,'deviceScaleFactor':1,'mobile':False})
            time.sleep(2)
            worker_info = wait_for(lambda: next((item for item in targets() if item['type']=='service_worker' and item['url'].endswith('/background.js')), None), 'extension worker')
            extension_id = worker_info['url'].split('/')[2]

            page.call('Page.navigate', {'url':fixture.as_uri()})
            wait_for(lambda:page.evaluate("location.protocol==='file:' && document.readyState==='complete' && !!document.getElementById('page-style')"), 'standalone HTML')
            assert page.evaluate("!document.querySelector('script[src],link[rel=stylesheet]') && getComputedStyle(document.body).backgroundColor==='rgb(246, 240, 228)' && performance.getEntriesByType('resource').length===0")
            checks.append({'check':'movable-single-html-without-asset-or-server-requests','passed':True})

            for style in ['editorial','technical','journal','warm','forest','contrast','neon','gradient']:
                page.evaluate("(() => {const s=document.getElementById('page-style');s.value=STYLE;s.dispatchEvent(new Event('change'));})()".replace('STYLE',json.dumps(style)))
                assert page.evaluate('document.body.dataset.style') == style
            checks.append({'check':'eight-local-file-style-controls','passed':True})
            page.evaluate("document.querySelector('[data-select=formatted-text]').click()")
            assert page.evaluate("getSelection().toString().includes('Which programming language do you prefer?')")
            checks.append({'check':'local-file-selection-helper','passed':True})

            # Check the normal extension Details control, enabling access if needed in this disposable profile.
            page.call('Page.navigate', {'url':f'chrome://extensions/?id={extension_id}'})
            toggle = "document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-detail-view')?.shadowRoot?.querySelector('#allow-on-file-urls')"
            wait_for(lambda:page.evaluate(f"!!({toggle})"), 'extension file-access control')
            if not page.evaluate(f"({toggle}).checked"):
                coords = page.evaluate(f"(() => {{const e={toggle};e.scrollIntoView({{block:'center'}});const r=e.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2,visible:r.width>0&&r.height>0}};}})()")
                assert coords.pop('visible'), 'The extension does not request access to file URLs.'
                page.call('Input.dispatchMouseEvent', {'type':'mousePressed','button':'left','clickCount':1,**coords})
                page.call('Input.dispatchMouseEvent', {'type':'mouseReleased','button':'left','clickCount':1,**coords})
            wait_for(lambda:page.evaluate(f"(() => {{const e={toggle};return e?.checked ?? e?.shadowRoot?.querySelector('cr-toggle')?.checked;}})()"), 'enabled file access')
            checks.append({'check':'file-access-confirmed-through-details-in-isolated-profile','passed':True})

            page.call('Page.navigate', {'url':fixture.as_uri() + '?style=technical'})
            wait_for(lambda:page.evaluate("location.protocol==='file:' && !!document.getElementById('shvyd-root')"), 'local-file content script')
            page.evaluate("document.querySelector('[data-select=formatted-text]').click()")
            wait_for(lambda:page.evaluate("!document.getElementById('shvyd-root').shadowRoot.querySelector('.bubble').hidden"), 'local-file Translate button')
            coords = page.evaluate("(() => {const r=document.getElementById('shvyd-root').shadowRoot.querySelector('.bubble').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
            page.call('Input.dispatchMouseEvent', {'type':'mousePressed','button':'left','clickCount':1,**coords})
            page.call('Input.dispatchMouseEvent', {'type':'mouseReleased','button':'left','clickCount':1,**coords})
            wait_for(lambda:page.evaluate("(() => {const r=document.getElementById('shvyd-root').shadowRoot,p=r.querySelector('.panel');return !p.hidden && p.getAttribute('aria-busy')==='false';})()"), 'local-file translation')
            value = page.evaluate("""(() => {const r=document.getElementById('shvyd-root').shadowRoot,o=r.querySelector('.translation');return {
              error:!r.querySelector('.actions').hidden,target:o.lang,text:o.textContent,
              paragraphs:o.querySelectorAll('p').length,items:o.querySelectorAll('li').length,
              background:getComputedStyle(r.querySelector('.panel')).backgroundColor};})()""")
            assert not value['error'] and value['target']=='uk' and value['paragraphs']==3 and value['items']==5, value
            assert value['background']=='rgb(29, 37, 49)'
            checks.append({'check':'live-formatted-translation-from-file-url','passed':True,**value})
            shot = page.call('Page.captureScreenshot', {'format':'png'})
            (OUTPUT/'translation.png').write_bytes(base64.b64decode(shot['data']))
            (OUTPUT/'results.json').write_text(json.dumps({'passed':True,'browser':'Helium','isolatedProfile':True,'fixtureProtocol':'file','checks':checks},ensure_ascii=False,indent=2))
            print(json.dumps({'passed':True,'checks':len(checks),'evidence':str(OUTPUT/'results.json')}))
        finally:
            for connection in connections: connection.close()
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill();process.wait(timeout=5)


if __name__=='__main__':
    main()
