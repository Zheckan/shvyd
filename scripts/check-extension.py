#!/usr/bin/env python3
"""Check the unpacked extension in an isolated Helium profile with live provider keys.

Run `bun run build:local` and `bun run dev` first. Requires websocket-client,
already used by the local benchmark harness. Never uses the regular browser profile.
"""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

import websocket

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / '.preview' / 'extension-check'
BROWSER = '/Applications/Helium.app/Contents/MacOS/Helium'


class CDP:
    def __init__(self, url):
        self.socket = websocket.create_connection(url, timeout=20, suppress_origin=True)
        self.counter = 0

    def call(self, method, params=None):
        self.counter += 1
        self.socket.send(json.dumps({'id': self.counter, 'method': method, 'params': params or {}}))
        while True:
            result = json.loads(self.socket.recv())
            if result.get('id') == self.counter:
                if 'error' in result:
                    raise RuntimeError(f'Browser operation failed: {method}')
                return result.get('result', {})

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {
            'expression': expression, 'returnByValue': True,
            'awaitPromise': True, 'userGesture': True,
        })
        if 'exceptionDetails' in result:
            raise RuntimeError('Browser evaluation failed; details withheld to protect settings.')
        return result.get('result', {}).get('value')

    def close(self):
        self.socket.close()


def wait_for(check, description, timeout=18):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(.05)
    raise RuntimeError(f'Timed out: {description}')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    assert (ROOT / 'dist/manifest.json').exists(), 'Build the extension first.'
    connections = []
    results = {'browser': 'Helium', 'isolatedProfile': True, 'checks': []}
    with tempfile.TemporaryDirectory(prefix='shvyd-extension-') as profile:
        process = subprocess.Popen([
            BROWSER, '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--user-data-dir=' + profile, '--remote-debugging-port=0',
            '--disable-extensions-except=' + str(ROOT / 'dist'),
            '--load-extension=' + str(ROOT / 'dist'), 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile) / 'DevToolsActivePort'
            wait_for(lambda: port_file.exists(), 'isolated browser startup', 12)
            port = int(port_file.read_text().splitlines()[0])

            def targets():
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as response:
                    return json.load(response)

            tab = next(item for item in targets() if item['type'] == 'page')
            page = CDP(tab['webSocketDebuggerUrl'])
            connections.append(page)
            page.call('Runtime.enable')
            page.call('Page.enable')
            page.call('Page.bringToFront')
            page.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            time.sleep(2)

            navigation = 0
            def navigate(style):
                nonlocal navigation
                navigation += 1
                page.call('Page.navigate', {'url': f'http://127.0.0.1:5173/fixture?style={style}&check={navigation}'})
                wait_for(lambda: page.evaluate(f"document.readyState === 'complete' && document.body?.dataset.style === {json.dumps(style)} && new URL(location.href).searchParams.get('check') === '{navigation}' && !!document.getElementById('shvyd-root')"), 'content script startup')

            def click(selector, shadow=True):
                prefix = "document.getElementById('shvyd-root').shadowRoot" if shadow else "document"
                coords = page.evaluate(f"(() => {{const e={prefix}.querySelector({json.dumps(selector)});e.scrollIntoView({{block:'nearest'}});const r=e.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
                page.call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'button': 'left', 'clickCount': 1, **coords})
                page.call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'button': 'left', 'clickCount': 1, **coords})

            def completed(target=None):
                expected = f" && r.querySelector('.translation').lang === {json.dumps(target)}" if target else ''
                wait_for(lambda: page.evaluate("(() => {const r=document.getElementById('shvyd-root')?.shadowRoot,p=r?.querySelector('.panel');return p && !p.hidden && p.getAttribute('aria-busy')==='false'" + expected + ";})()"), 'completed translation')
                return page.evaluate("""(() => {
                  const root=document.getElementById('shvyd-root').shadowRoot;
                  const p=root.querySelector('.panel'), o=root.querySelector('.translation');
                  const r=p.getBoundingClientRect(), style=getComputedStyle(p);
                  return {text:o.textContent, target:o.lang, direction:o.dir, error:!root.querySelector('.actions').hidden,
                    font:getComputedStyle(o).fontFamily, fontSize:getComputedStyle(o).fontSize,
                    letterSpacing:getComputedStyle(o).letterSpacing, background:style.backgroundColor, color:style.color,
                    accent:getComputedStyle(root.querySelector('.target')).color,
                    border:style.borderColor, radius:style.borderRadius,
                    fitsViewport:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight};
                })()""")

            def translate_selection(passage='sample-text', target=None):
                page.evaluate("""(() => {
                  const p = document.getElementById(PASSAGE); p.scrollIntoView({block:'center'});
                  const range = document.createRange(); range.selectNodeContents(p);
                  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
                })()""".replace('PASSAGE', json.dumps(passage)))
                wait_for(lambda: page.evaluate("document.getElementById('shvyd-root')?.shadowRoot.querySelector('.bubble')?.hidden === false"), 'selection button')
                started = time.monotonic()
                click('.bubble')
                value = completed(target)
                assert value['text'] and not value['error'], 'The actual extension did not receive a translation.'
                assert value['fitsViewport'], 'Popup exceeded the viewport.'
                value['observedClickToCompleteMs'] = round((time.monotonic() - started) * 1000, 1)
                return value

            def choose_language(code, search=None):
                before=page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').getBoundingClientRect().toJSON()")
                click('.target')
                after=page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').getBoundingClientRect().toJSON()")
                assert all(abs(before[key]-after[key])<1 for key in ['x','y','width','height']), 'Opening languages moved the translation.'
                if search:
                    click('.more-languages')
                    page.evaluate("(() => {const s=document.getElementById('shvyd-root').shadowRoot.querySelector('.language-search');s.value=QUERY;s.dispatchEvent(new Event('input'));})()".replace('QUERY', json.dumps(search)))
                    after=page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').getBoundingClientRect().toJSON()")
                    assert all(abs(before[key]-after[key])<1 for key in ['x','y','width','height']), 'Searching languages moved the translation.'
                    selector = f'.language-menu > div:last-child button[data-language="{code}"]'
                else:
                    selector = f'.language-menu button[data-language="{code}"]'
                click(selector)
                value = completed(code)
                assert value['text'] and not value['error'] and value['fitsViewport']
                return value

            def options():
                page.call('Page.navigate', {'url': f'chrome-extension://{extension_id}/options.html'})
                wait_for(lambda: page.evaluate("!!document.querySelector('[name=provider]') && document.getElementById('key-summary').textContent.includes('Azure ready')"), 'settings bootstrap')

            def save_options():
                page.evaluate("document.getElementById('settings').requestSubmit()")
                wait_for(lambda: page.evaluate("document.getElementById('status').textContent.startsWith('Saved.')"), 'saved provider setting')

            def screenshot(name):
                shot = page.call('Page.captureScreenshot', {'format': 'png'})
                (OUTPUT / f'{name}.png').write_bytes(base64.b64decode(shot['data']))

            def record(name, value):
                results['checks'].append({'check': name, **value})
                print(json.dumps({'check': name, 'passed': True}), flush=True)

            navigate('editorial')
            worker_info = wait_for(lambda: next((item for item in targets() if item['type'] == 'service_worker' and item['url'].endswith('/background.js')), None), 'extension worker')
            extension_id = worker_info['url'].split('/')[2]
            worker = CDP(worker_info['webSocketDebuggerUrl'])
            connections.append(worker)
            readiness = wait_for(lambda: worker.evaluate("chrome.storage.local.get('settings').then(({settings})=>settings?({azure:!!settings.azure.key,deepl:!!settings.deepl.key}):null)"), 'initialized provider settings')
            assert readiness['azure'] and readiness['deepl'], 'Use build:local with both provider keys configured.'
            results['providerKeysPresent'] = readiness

            for style in ['editorial', 'technical', 'journal', 'warm', 'forest', 'contrast', 'neon', 'gradient']:
                navigate(style)
                value = translate_selection()
                print(json.dumps({'observedStyle': style, 'background': value['background'], 'color': value['color'], 'accent': value['accent'], 'radius': value['radius']}), flush=True)
                assert value['target'] == 'uk', 'Ukrainian was not the default.'
                assert '-apple-system' in value['font'] and 'SF Pro Text' in value['font'], 'Popup did not use system typography.'
                assert value['fontSize'] == '15px' and value['letterSpacing'] == 'normal', 'Popup typography changed with the page.'
                if style == 'editorial': assert value['background'] == 'rgb(246, 240, 228)'
                if style == 'technical': assert value['radius'] == '16px'
                if style == 'journal': assert value['background'] == 'rgb(255, 255, 255)'
                if style == 'warm': assert value['radius'] == '20px'
                value['style'] = style
                results['checks'].append(value)
                screenshot(style)
                print(json.dumps({'check': style, 'target': value['target'], 'fitsViewport': True, 'font': value['font'], 'radius': value['radius']}), flush=True)

            value = translate_selection('formatted-text', 'uk')
            structure = page.evaluate("""(() => {const o=document.getElementById('shvyd-root').shadowRoot.querySelector('.translation');return {
              paragraphs:o.querySelectorAll('p').length, bullets:o.querySelectorAll('ul > li').length,
              numbered:o.querySelectorAll('ol > li').length, heading:!!o.querySelector('h3'),
              strong:!!o.querySelector('strong'), emphasis:!!o.querySelector('em'), lineBreak:!!o.querySelector('br')};})()""")
            assert structure == {'paragraphs':3,'bullets':3,'numbered':2,'heading':True,'strong':True,'emphasis':True,'lineBreak':True}, structure
            record('azure-preserved-paragraphs-and-lists', {**value, **structure})
            screenshot('formatted-paragraphs')

            value = translate_selection('structured-text', 'uk')
            structure = page.evaluate("""(() => {const o=document.getElementById('shvyd-root').shadowRoot.querySelector('.translation');return {
              rows:o.querySelectorAll('tr').length, cells:o.querySelectorAll('th,td').length,
              codePreserved:o.querySelector('pre code')?.textContent===document.getElementById('code-text').textContent};})()""")
            assert structure == {'rows':3,'cells':6,'codePreserved':True}, structure
            record('azure-preserved-table-and-code', {**value, **structure})
            screenshot('formatted-table')

            page.evaluate("document.querySelector('#table-text tbody td:last-child').id='partial-cell'")
            value = translate_selection('partial-cell', 'uk')
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation td').length") == 1
            record('partial-table-cell-selection', value)

            page.evaluate("document.querySelector('#formatted-text ol li:last-child').id='fourth-item'")
            value = translate_selection('fourth-item', 'uk')
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.translation ol').getAttribute('start')") == '4'
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation li').length") == 1
            record('partial-list-retains-numbering', value)

            choose_language('pl')
            navigate('journal')
            value = translate_selection(target='pl')
            assert value['target'] == 'pl', 'Target was not remembered across page navigation.'
            results['checks'].append({'check': 'remembered-target', 'target': value['target']})

            options()
            page.evaluate("""(() => {
              const mode=document.querySelector('[name=targetMode]');mode.value='fixed';mode.dispatchEvent(new Event('change'));
              const target=document.querySelector('[name=target]');target.value='uk';target.dispatchEvent(new Event('change'));
              for(const code of ['en','ar']) {const c=document.querySelector('.favorite-list input[value="'+code+'"]');c.checked=code==='ar';c.dispatchEvent(new Event('change'));}
            })()""")
            save_options()
            screenshot('language-settings')
            navigate('editorial')
            translate_selection(target='uk')
            value = choose_language('ar')
            assert value['direction'] == 'rtl'
            record('temporary-arabic-target', value)
            screenshot('arabic-target')
            click('button[aria-label="Close translation"]')
            record('fixed-default-reset-on-close', translate_selection(target='uk'))
            choose_language('zh-hant', 'Chinese')
            screenshot('additional-languages')
            record('additional-language-search', completed('zh-hant'))
            navigate('warm')
            record('fixed-default-reset-on-navigation', translate_selection(target='uk'))

            def menu_placement():
                return page.evaluate("""(() => {
                  const r=document.getElementById('shvyd-root').shadowRoot,m=r.querySelector('.language-menu'),a=r.querySelector('.target');
                  const b=m.getBoundingClientRect(),anchor=a.getBoundingClientRect();
                  const gap=Math.min(Math.abs(b.top-anchor.bottom),Math.abs(anchor.top-b.bottom));
                  return {visible:!m.hidden,fitsViewport:b.left>=11&&b.top>=11&&b.right<=innerWidth-11&&b.bottom<=innerHeight-11,
                    anchored:Math.abs(gap-6)<=1,scrollable:m.scrollHeight>m.clientHeight};
                })()""")

            def ready_menu():
                value=menu_placement()
                return value if all(value[key] for key in ['visible','fitsViewport','anchored']) else None

            click('.target')
            click('.more-languages')
            screenshot('language-popover-desktop')
            for width,height in [(390,520),(320,240),(1280,900)]:
                page.call('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':1,'mobile':False})
                try:
                    value=wait_for(ready_menu, 'language menu placement after resize')
                except Exception:
                    print(json.dumps({'failedViewport':[width,height],'placement':menu_placement()}),flush=True)
                    raise
                if height==240:
                    assert value['scrollable'], 'A short viewport must keep the menu scrollable.'
                    page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.language-menu').scrollTop=1000")
                    assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.language-menu').scrollTop>0")
                    screenshot('language-popover-short-viewport')
                record(f'language-popover-resize-{width}x{height}',value)
            time.sleep(.1)
            page.evaluate('window.scrollBy(0,40)')
            wait_for(lambda:page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').hidden && document.getElementById('shvyd-root').shadowRoot.querySelector('.language-menu').hidden"), 'page scroll dismisses both popups')
            record('page-scroll-still-dismisses-language-and-translation',{'passed':True})

            options()
            assert page.evaluate("[...document.querySelectorAll('.favorite-list input:checked')].map(x=>x.value).sort().join(',')") == 'ar,pl,uk'
            record('preferred-language-persistence', {'languages': ['uk','pl','ar']})
            page.evaluate("document.querySelector('[name=showOtherLanguages]').checked=false")
            save_options()
            navigate('journal')
            translate_selection(target='uk')
            click('.target')
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.more-languages').hidden")
            record('hide-additional-languages', {'passed': True})
            page.call('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape'})
            assert page.evaluate("!document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').hidden")
            record('escape-closes-language-menu-first', {'passed': True})

            value = translate_selection('long-text', 'uk')
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation p').length") == 4
            record('long-selection-viewport', value)
            screenshot('long-translation')
            value = translate_selection('contrast-text', 'uk')
            assert value['color'] == 'rgb(0, 0, 0)'
            record('faint-source-readable-translation', value)
            value = translate_selection('dark-text', 'uk')
            assert value['background'] == 'rgb(21, 40, 55)' and value['accent'] == 'rgb(142, 224, 198)'
            record('nested-dark-card-adaptation', value)

            options()
            page.evaluate("""(() => {const p=document.querySelector('[name=provider]');p.value='deepl';p.dispatchEvent(new Event('change'));document.querySelector('[name=showOtherLanguages]').checked=true;})()""")
            save_options()
            navigate('warm')
            value = translate_selection(target='uk')
            record('deepl-direct-request', value)
            value = translate_selection('formatted-text', 'uk')
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation p').length") == 3
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelectorAll('.translation li').length") == 5
            record('deepl-preserved-paragraphs-and-lists', value)
            screenshot('deepl-formatted-paragraphs')
            record('deepl-expanded-target-hindi', choose_language('hi', 'Hindi'))

            options()
            count = page.evaluate("document.querySelector('[name=target]').options.length")
            assert count == 126
            record('provider-filtered-targets', {'provider': 'deepl', 'count': count})

            page.call('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': False})
            navigate('technical')
            value = translate_selection(target='uk')
            results['checks'].append({'check': 'narrow-viewport', **value})

            page.call('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape'})
            assert page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.panel').hidden"), 'Escape did not close the popup.'
            results['checks'].append({'check': 'escape-dismissal', 'passed': True})
            results['passed'] = True
        finally:
            for connection in connections:
                connection.close()
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            (OUTPUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(json.dumps({'passed': results.get('passed', False), 'checks': len(results['checks']), 'evidence': str(OUTPUT / 'results.json')}), flush=True)


if __name__ == '__main__':
    main()
