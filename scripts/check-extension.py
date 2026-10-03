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
            page.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})

            navigation = 0
            def navigate(style):
                nonlocal navigation
                navigation += 1
                page.call('Page.navigate', {'url': f'http://127.0.0.1:5173/fixture?style={style}&check={navigation}'})
                wait_for(lambda: page.evaluate(f"document.readyState === 'complete' && document.body?.dataset.style === {json.dumps(style)} && new URL(location.href).searchParams.get('check') === '{navigation}' && !!document.getElementById('shvyd-root')"), 'content script startup')

            def translate_selection():
                page.evaluate("""(() => {
                  const p = document.getElementById('sample-text'); p.scrollIntoView({block:'center'});
                  const range = document.createRange(); range.selectNodeContents(p);
                  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
                })()""")
                wait_for(lambda: page.evaluate("document.getElementById('shvyd-root')?.shadowRoot.querySelector('.bubble')?.hidden === false"), 'selection button')
                coords = page.evaluate("(() => {const r=document.getElementById('shvyd-root').shadowRoot.querySelector('.bubble').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
                started = time.monotonic()
                page.call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'button': 'left', 'clickCount': 1, **coords})
                page.call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'button': 'left', 'clickCount': 1, **coords})
                wait_for(lambda: page.evaluate("(() => {const p=document.getElementById('shvyd-root')?.shadowRoot.querySelector('.panel');return p && !p.hidden && p.getAttribute('aria-busy')==='false';})()"), 'completed translation')
                value = page.evaluate("""(() => {
                  const root=document.getElementById('shvyd-root').shadowRoot;
                  const p=root.querySelector('.panel'), o=root.querySelector('.translation');
                  const r=p.getBoundingClientRect(), style=getComputedStyle(p);
                  return {text:o.textContent, target:o.lang, error:!root.querySelector('.actions').hidden,
                    font:getComputedStyle(o).fontFamily, fontSize:getComputedStyle(o).fontSize,
                    letterSpacing:getComputedStyle(o).letterSpacing, background:style.backgroundColor, color:style.color,
                    border:style.borderColor, radius:style.borderRadius,
                    fitsViewport:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight};
                })()""")
                assert value['text'] and not value['error'], 'The actual extension did not receive a translation.'
                assert value['fitsViewport'], 'Popup exceeded the viewport.'
                value['observedClickToCompleteMs'] = round((time.monotonic() - started) * 1000, 1)
                return value

            navigate('editorial')
            worker_info = wait_for(lambda: next((item for item in targets() if item['type'] == 'service_worker' and item['url'].endswith('/background.js')), None), 'extension worker')
            extension_id = worker_info['url'].split('/')[2]
            worker = CDP(worker_info['webSocketDebuggerUrl'])
            connections.append(worker)
            readiness = wait_for(lambda: worker.evaluate("chrome.storage.local.get('settings').then(({settings})=>settings?({azure:!!settings.azure.key,deepl:!!settings.deepl.key}):null)"), 'initialized provider settings')
            assert readiness['azure'] and readiness['deepl'], 'Use build:local with both provider keys configured.'
            results['providerKeysPresent'] = readiness

            for style in ['editorial', 'technical', 'journal', 'warm']:
                navigate(style)
                value = translate_selection()
                assert value['target'] == 'uk', 'Ukrainian was not the default.'
                assert '-apple-system' in value['font'] and 'SF Pro Text' in value['font'], 'Popup did not use system typography.'
                assert value['fontSize'] == '15px' and value['letterSpacing'] == 'normal', 'Popup typography changed with the page.'
                if style == 'editorial': assert value['background'] == 'rgb(246, 240, 228)'
                if style == 'technical': assert value['radius'] == '16px'
                if style == 'journal': assert value['background'] == 'rgb(255, 255, 255)'
                if style == 'warm': assert value['radius'] == '20px'
                value['style'] = style
                results['checks'].append(value)
                screenshot = page.call('Page.captureScreenshot', {'format': 'png'})
                (OUTPUT / f'{style}.png').write_bytes(base64.b64decode(screenshot['data']))
                print(json.dumps({'check': style, 'target': value['target'], 'fitsViewport': True, 'font': value['font'], 'radius': value['radius']}), flush=True)

            page.evaluate("(() => {const s=document.getElementById('shvyd-root').shadowRoot.querySelector('.target');s.value='pl';s.dispatchEvent(new Event('change'));})()")
            wait_for(lambda: page.evaluate("document.getElementById('shvyd-root').shadowRoot.querySelector('.translation').lang==='pl'"), 'target language change')
            navigate('journal')
            value = translate_selection()
            assert value['target'] == 'pl', 'Target was not remembered across page navigation.'
            results['checks'].append({'check': 'remembered-target', 'target': value['target']})

            page.call('Page.navigate', {'url': f'chrome-extension://{extension_id}/options.html'})
            wait_for(lambda: page.evaluate("!!document.querySelector('[name=provider]') && document.getElementById('key-summary').textContent.includes('Azure ready')"), 'settings bootstrap')
            page.evaluate("(() => {document.querySelector('[name=provider]').value='deepl';document.querySelector('[name=target]').value='uk';document.getElementById('settings').requestSubmit();})()")
            wait_for(lambda: page.evaluate("document.getElementById('status').textContent.startsWith('Saved.')"), 'saved provider setting')
            navigate('warm')
            value = translate_selection()
            results['checks'].append({'check': 'deepl-direct-request', **value})

            page.call('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': False})
            navigate('technical')
            value = translate_selection()
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
