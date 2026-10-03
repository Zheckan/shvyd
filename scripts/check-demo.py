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

        def select(passage='sample-text', range_expression=None):
            page.evaluate("(() => {const p=document.getElementById(PASSAGE);p.scrollIntoView({block:'center'});const r=document.createRange();RANGE;const s=getSelection();s.removeAllRanges();s.addRange(r);})()".replace('PASSAGE',json.dumps(passage)).replace('RANGE',range_expression or 'r.selectNodeContents(p)'))
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

        menu_checks=page.evaluate((ROOT/'tests/browser/language-menu.js').read_text())
        checks.extend({'check':check,'passed':True,'controlledResponse':True} for check in menu_checks['checks'])

        # Controlled provider responses exercise the public popup without sending attack fixtures to a cloud API.
        page.evaluate("""(() => {
          window.shvydTestRequests=[];window.shvydTestReply=null;window.shvydExecuted=0;
          const original=window.fetch.bind(window);window.shvydOriginalFetch=original;
          window.fetch=async (input,init) => {
            if (input==='/api' && init?.body) {
              const value=JSON.parse(init.body);
              if(value.kind==='translate') {
                window.shvydTestRequests.push(value);
                return Response.json({ok:true,data:{text:window.shvydTestReply ?? value.text,format:value.format ?? 'plain',
                  target:value.target,provider:value.provider,cached:false,durationMs:0}});
              }
            }
            return original(input,init);
          };
          const section=document.createElement('section');section.id='partial-paragraphs';
          section.innerHTML='<p class="source-class" style="font-family:serif" onclick="window.shvydExecuted++">OUTSIDE_START Keep <strong>this</strong><span hidden>HIDDEN_SENTINEL</span> paragraph.</p><p data-private="source-attribute">Second <em>paragraph</em>. OUTSIDE_END</p>';
          document.querySelector('article').append(section);
        })()""")
        click('button[aria-label="Close translation"]',True)
        select('partial-paragraphs', "r.setStart(p.firstChild.firstChild,14);r.setEnd(p.lastChild.lastChild,1)")
        complete('uk')
        request=page.evaluate('window.shvydTestRequests.at(-1)')
        assert request['format']=='html'
        assert all(marker not in request['text'] for marker in ['OUTSIDE_START','OUTSIDE_END','HIDDEN_SENTINEL','source-class','style=','onclick=','data-private=']),request['text']
        assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation p').length")==2
        assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.translation').textContent")=="Keep this paragraph.Second paragraph."
        checks.append({'check':'partial-selection-only-with-paragraph-boundaries','passed':True,'controlledResponse':True})

        page.evaluate("""(() => {const section=document.createElement('section');section.id='css-paragraphs';section.innerHTML='<span style="display:block">First CSS paragraph.</span><span style="display:block">Second CSS paragraph.</span>';document.querySelector('article').append(section);})()""")
        click('button[aria-label="Close translation"]',True)
        select('css-paragraphs')
        complete('uk')
        request=page.evaluate('window.shvydTestRequests.at(-1)')
        assert '<div>First CSS paragraph.</div>' in request['text'] and '<div>Second CSS paragraph.</div>' in request['text']
        checks.append({'check':'css-block-paragraph-boundaries','passed':True,'controlledResponse':True})

        page.evaluate("""window.shvydTestReply='<div id="evil" onclick="window.shvydExecuted++" style="font-family:serif"><p>Safe <strong onclick="window.shvydExecuted++">paragraph</strong>.</p><ul><li>First item</li><li>Second item</li></ul><table><tr><td>A</td><td>B</td></tr></table><img src="/shvyd-security-probe" onerror="window.shvydExecuted++"><iframe src="/shvyd-security-probe"></iframe><svg onload="window.shvydExecuted++"></svg><script>window.shvydExecuted++</script><a href="javascript:window.shvydExecuted++">Readable link text</a></div>';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.shvydCopiedText=text;}}});""")
        click('button[aria-label="Close translation"]',True)
        select('formatted-text')
        complete('uk')
        assert page.evaluate("""(() => {const o=document.getElementById('shvyd-root').shadowRoot.querySelector('.translation');return !o.querySelector('img,iframe,svg,script,a') && !o.querySelector('[onclick],[onerror],[onload],[style],[href],[id]') && window.shvydExecuted===0 && !performance.getEntriesByType('resource').some(e=>e.name.includes('shvyd-security-probe'));})()""")
        checks.append({'check':'provider-html-has-no-active-content-or-page-attributes','passed':True,'controlledResponse':True})
        click('button[aria-label="Copy translation"]',True)
        wait_for(lambda:page.evaluate("typeof window.shvydCopiedText==='string'"),'formatted clipboard result')
        copied=page.evaluate('window.shvydCopiedText')
        assert 'Safe paragraph.\n\n• First item\n• Second item\n\nA\tB' in copied,copied
        assert '<' not in copied and 'shvydExecuted' not in copied
        checks.append({'check':'copy-preserves-paragraphs-list-markers-and-table-columns','passed':True,'controlledResponse':True})

        page.evaluate("window.shvydTestReply=null;const p=document.createElement('p');p.id='oversized-markup';p.innerHTML='<strong>x</strong>'.repeat(1200);document.querySelector('article').append(p);")
        click('button[aria-label="Close translation"]',True)
        select('oversized-markup')
        complete('uk')
        request=page.evaluate('window.shvydTestRequests.at(-1)')
        assert request['format']=='plain' and request['text']=='x'*1200
        checks.append({'check':'excessive-markup-falls-back-to-bounded-plain-text','passed':True,'controlledResponse':True})
        page.evaluate('window.fetch=window.shvydOriginalFetch')
        (output/'results.json').write_text(json.dumps({'passed':True,'browser':'Helium','isolatedProfile':True,'extensionLoaded':False,'checks':checks},ensure_ascii=False,indent=2))
        print(json.dumps({'passed':True,'checks':len(checks)}))
    finally:
        if page: page.close()
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill();process.wait(timeout=5)
