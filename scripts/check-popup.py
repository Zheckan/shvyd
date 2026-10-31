#!/usr/bin/env python3
"""Check popup placement, loading size, and selection inside the translation.

Runs the built extension in isolated Helium with controlled provider replies and
real mouse drags. No provider keys are needed. Results go to .preview/popup-check/.
"""
import base64
import importlib.util
import json
import os
import subprocess
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / '.preview/popup-check'
EXTENSION = Path(os.environ.get('SHVYD_EXTENSION_DIR') or ROOT / 'dist').resolve()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


browser = load('extension_checks', ROOT / 'scripts/check-extension.py')
reliability = load('reliability_checks', ROOT / 'scripts/check-reliability.py')

SHORT = 'Add team key validation'
LONG = ' '.join(['The release keeps settings in this browser and sends only the selected text to the provider you chose.'] * 6)
PAGE = f'''<!doctype html><html><head><title>Shvyd popup fixture</title>
<style>
  body {{ margin: 0; padding: 60px 80px; background: #111; color: #eee; font: 15px/1.6 system-ui; }}
  textarea, input {{ display: block; width: 520px; margin: 24px 0; padding: 10px; font: 22px/1.4 system-ui;
    background: #111; color: #eee; border: 1px solid #333; }}
  p {{ max-width: 620px; }}
</style></head><body>
<p id="short">{SHORT}</p>
<p id="long">{LONG}</p>
<textarea id="field" rows="2">{SHORT}</textarea>
<input id="secret" type="password" value="hunter2-secret-value">
</body></html>'''.encode()


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(PAGE)

    def log_message(self, *_args):
        pass


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = {'extension': str(EXTENSION), 'checks': [], 'passed': False}
    failures = []
    connections = []

    with tempfile.TemporaryDirectory(prefix='shvyd-popup-') as profile:
        process = subprocess.Popen([
            browser.BROWSER, '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--user-data-dir=' + profile, '--remote-debugging-port=0',
            '--disable-extensions-except=' + str(EXTENSION), '--load-extension=' + str(EXTENSION), 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        try:
            port_file = Path(profile) / 'DevToolsActivePort'
            browser.wait_for(port_file.exists, 'browser startup')
            port = int(port_file.read_text().splitlines()[0])

            def targets():
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as response:
                    return json.load(response)

            page = browser.CDP(next(item for item in targets() if item['type'] == 'page')['webSocketDebuggerUrl'])
            connections.append(page)
            page.call('Runtime.enable')
            page.call('Page.enable')
            page.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            page.call('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/'})
            browser.wait_for(lambda: page.evaluate("!!document.getElementById('shvyd-root')"), 'content script')
            worker_info = browser.wait_for(lambda: next((item for item in targets() if item['type'] == 'service_worker' and item['url'].endswith('/background.js')), None), 'worker')
            extension_id = worker_info['url'].split('/')[2]
            worker = reliability.WorkerProbe(worker_info['webSocketDebuggerUrl'])
            connections.append(worker)
            worker.hold = True
            options_id = page.call('Target.createTarget', {'url': f'chrome-extension://{extension_id}/options.html'})['targetId']
            options = browser.CDP(browser.wait_for(lambda: next((item for item in targets() if item['id'] == options_id), None), 'settings')['webSocketDebuggerUrl'])
            connections.append(options)
            options.call('Runtime.enable')
            browser.wait_for(lambda: options.evaluate("!document.getElementById('settings-fields').disabled"), 'settings load')
            assert options.evaluate("(async()=>{const c=await chrome.runtime.sendMessage({kind:'get-settings'});return (await chrome.runtime.sendMessage({kind:'save-settings',value:{...c.data,azure:{key:'controlled-test-key',region:''}}})).ok})()")
            page.call('Page.bringToFront')

            def popup(expression):
                return page.evaluate("(() => {const root=document.getElementById('shvyd-root').shadowRoot;" + expression + "})()")

            def mouse(kind, x, y, buttons=1):
                page.call('Input.dispatchMouseEvent', {'type': kind, 'x': x, 'y': y, 'button': 'left', 'buttons': buttons, 'clickCount': 1})

            def drag(x1, y1, x2, y2):
                mouse('mousePressed', x1, y1)
                for step in range(1, 9):
                    mouse('mouseMoved', x1 + (x2 - x1) * step / 8, y1 + (y2 - y1) * step / 8)
                mouse('mouseReleased', x2, y2, 0)

            def frames():
                page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

            def check(name, passed, detail):
                entry = {'check': name, 'passed': bool(passed), 'detail': detail}
                results['checks'].append(entry)
                print(json.dumps(entry), flush=True)
                if not passed:
                    failures.append(name)

            def close_popup():
                page.call('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
                page.call('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
                page.evaluate('getSelection().removeAllRanges(), document.activeElement?.blur?.(), true')
                frames()

            def select_text(element_id):
                page.evaluate("(() => {const range=document.createRange();range.selectNodeContents(document.getElementById(" + json.dumps(element_id) + "));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'))})()")
                browser.wait_for(lambda: popup("return !root.querySelector('.bubble').hidden"), 'bubble for ' + element_id)

            def open_loading(element_id):
                select_text(element_id)
                popup("root.querySelector('.bubble').click(); return true")
                browser.wait_for(lambda: worker.drain() >= 1, 'held request')
                frames()
                page.evaluate('new Promise(r=>setTimeout(r,200))')
                box = popup("const b=root.querySelector('.panel').getBoundingClientRect();return {x:b.x-10,y:b.y-10,width:b.width+20,height:b.height+20}")
                shot = page.call('Page.captureScreenshot', {'format': 'png', 'clip': {**box, 'scale': 1}})
                (OUTPUT / f'loading-{element_id}.png').write_bytes(base64.b64decode(shot['data']))
                return popup("""const panel=root.querySelector('.panel');const r=panel.getBoundingClientRect();
                  return {height:Math.round(r.height),scroll:panel.scrollHeight,client:panel.clientHeight,
                  scheme:getComputedStyle(panel).colorScheme,lines:root.querySelectorAll('.loading .line').length}""")

            def finish(text):
                worker.resolve(worker.pending.pop(0), text)
                browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden"), 'translation shown')
                page.evaluate('new Promise(r=>setTimeout(r,400))')
                return popup("return Math.round(root.querySelector('.panel').getBoundingClientRect().height)")

            # 1. Text selected in a text field gets a button next to the selection.
            field = page.evaluate("(()=>{const r=document.getElementById('field').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
            start = (field['x'] + 14, field['y'] + 22)
            end = (field['x'] + 200, field['y'] + 22)
            drag(*start, *end)
            frames()
            visible = popup("return !root.querySelector('.bubble').hidden")
            bubble = popup("const r=root.querySelector('.bubble').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}")
            near = visible and abs(bubble['y'] - (field['y'] + field['h'] / 2)) < 80 and field['x'] - 20 <= bubble['x'] <= field['x'] + field['w']
            check('text-field-selection-button-near-selection', near, {'visible': visible, 'bubble': bubble, 'pointer': end})
            close_popup()

            # 2. A password field never offers translation.
            secret = page.evaluate("(()=>{const r=document.getElementById('secret').getBoundingClientRect();return {x:r.x,y:r.y,h:r.height}})()")
            drag(secret['x'] + 12, secret['y'] + secret['h'] / 2, secret['x'] + 160, secret['y'] + secret['h'] / 2)
            frames()
            check('password-field-never-offers-translation', not popup("return !root.querySelector('.bubble').hidden"), {})
            close_popup()

            # 3. Loading has no scroll bar and uses the page's color scheme.
            short_loading = open_loading('short')
            check('loading-has-no-scrollbar', short_loading['scroll'] <= short_loading['client'], short_loading)
            check('popup-uses-dark-color-scheme-on-dark-page', short_loading['scheme'] == 'dark', short_loading)
            short_final = finish('Додати перевірку ключа команди')
            check('short-loading-close-to-final-size', abs(short_loading['height'] - short_final) <= 24, {'loading': short_loading['height'], 'final': short_final})
            close_popup()

            # 4. A long selection reserves roughly the space its translation needs.
            long_loading = open_loading('long')
            long_final = finish(LONG.replace('The release', 'Реліз'))
            check('long-loading-close-to-final-size', abs(long_loading['height'] - long_final) <= max(40, long_final * 0.25), {'loading': long_loading['height'], 'final': long_final, 'lines': long_loading['lines']})

            fits = popup("const r=root.querySelector('.panel').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight")
            check('long-translation-fits-viewport-after-resize', fits, {})

            # 4b. A short selection low on the screen whose translation turns out long
            # must still fit once the popup has grown.
            close_popup()
            page.evaluate("document.getElementById('short').textContent='Bottom edge title'; window.scrollTo(0, 0); true")
            page.evaluate("(()=>{const el=document.getElementById('short');el.style.marginTop=(innerHeight-260)+'px';return true})()")
            open_loading('short')
            worker.resolve(worker.pending.pop(0), LONG)
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.panel').getAnimations().length===0"), 'grown translation settled')
            edge = popup("const r=root.querySelector('.panel').getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),viewport:innerHeight}")
            check('grown-popup-near-bottom-fits-viewport', edge['top'] >= 0 and edge['bottom'] <= edge['viewport'], edge)
            close_popup()
            page.evaluate("document.getElementById('short').style.marginTop=''; window.scrollTo(0, 0); true")
            # The long translation is cached now, so it appears without a request.
            select_text('long')
            popup("root.querySelector('.bubble').click(); return true")
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.panel').getAnimations().length===0"), 'cached translation')

            # 5. Selecting part of the translation keeps the popup open so it can be copied.
            text_box = popup("const r=root.querySelector('.translation').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}")
            drag(text_box['x'] + 20, text_box['y'] + 22, text_box['x'] + 180, text_box['y'] + 22)
            frames()
            page.evaluate('new Promise(r=>setTimeout(r,200))')
            still_open = popup("return !root.querySelector('.panel').hidden")
            selected = popup("const s=(root.getSelection?root.getSelection():getSelection());return s?String(s):''")
            check('selecting-inside-translation-keeps-popup-open', still_open and len(selected) > 3, {'open': still_open, 'selected': selected})

            shot = page.call('Page.captureScreenshot', {'format': 'png'})
            (OUTPUT / 'popup.png').write_bytes(base64.b64decode(shot['data']))
            results['passed'] = not failures
        finally:
            for connection in connections:
                connection.close()
            process.terminate()
            process.wait(timeout=10)
            server.shutdown()
            (OUTPUT / 'results.json').write_text(json.dumps(results, indent=2))

    print(json.dumps({'passed': results['passed'], 'failed': failures}), flush=True)
    raise SystemExit(0 if results['passed'] else 1)


if __name__ == '__main__':
    main()
