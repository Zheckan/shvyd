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
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; padding: 60px 80px; background: #111; color: #eee; font: 15px/1.6 system-ui; }}
  textarea, input {{ display: block; width: 520px; margin: 24px 0; padding: 10px; font: 22px/1.4 system-ui;
    background: #111; color: #eee; border: 1px solid #333; }}
  p {{ max-width: 620px; }}
</style></head><body>
<div id="post"><a href="/cytrus"><span style="color: #1d9bf0">@cytrus</span></a><p id="post-text">Every ex driver is backing Haas</p></div>
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
            browser.wait_for(lambda: options.evaluate("document.getElementById('settings-fields')?.disabled === false"), 'settings load')
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

            # 2b. By default the button appears beside the cursor.
            def drag_across(element_id):
                box = page.evaluate("(()=>{const r=document.createRange();r.selectNodeContents(document.getElementById(" + json.dumps(element_id) + "));const b=r.getClientRects()[0];return {x:b.x,y:b.y,w:b.width,h:b.height}})()")
                y = box['y'] + box['h'] / 2
                drag(box['x'] + 2, y, box['x'] + box['w'] - 2, y)
                frames()
                return (box['x'] + box['w'] - 2, y)

            def bubble_box():
                return popup("const r=root.querySelector('.bubble').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,visible:!root.querySelector('.bubble').hidden}")

            end_x, end_y = drag_across('short')
            beside = bubble_box()
            check('button-beside-cursor-by-default', beside['visible'] and abs(beside['left'] - (end_x + 12)) <= 3 and abs(beside['top'] - (end_y + 12)) <= 3, {'bubble': beside, 'pointer': [end_x, end_y]})
            close_popup()

            # 2c. The toolbar menu switches to the end of the selection, and open pages follow without a reload.
            menu_id = page.call('Target.createTarget', {'url': f'chrome-extension://{extension_id}/popup.html', 'background': True})['targetId']
            menu = browser.CDP(browser.wait_for(lambda: next((item for item in targets() if item['id'] == menu_id), None), 'menu')['webSocketDebuggerUrl'])
            connections.append(menu)
            menu.call('Runtime.enable')
            menu.call('Emulation.setDeviceMetricsOverride', {'width': 340, 'height': 600, 'deviceScaleFactor': 2, 'mobile': False})
            browser.wait_for(lambda: menu.evaluate("document.getElementById('site-name')?.textContent==='127.0.0.1' && document.querySelector('[data-anchor=cursor]')?.getAttribute('aria-pressed')==='true'"), 'menu loaded')
            # A background tab renders no frames, so transitions would freeze mid-way in screenshots.
            menu.evaluate("(()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important}';document.head.append(s);return true})()")
            for theme in ['light', 'dark']:
                menu.evaluate(f"document.documentElement.dataset.theme='{theme}', true")
                height = menu.evaluate('document.body.scrollHeight')
                shot = menu.call('Page.captureScreenshot', {'format': 'png', 'clip': {'x': 0, 'y': 0, 'width': 340, 'height': height, 'scale': 1}})
                (OUTPUT / f'menu-{theme}.png').write_bytes(base64.b64decode(shot['data']))
            menu.evaluate("document.querySelector('[data-anchor=selection]').click(), true")
            browser.wait_for(lambda: menu.evaluate("document.querySelector('[data-anchor=selection]').getAttribute('aria-pressed')==='true'"), 'menu saved position')
            page.evaluate('new Promise(r=>setTimeout(r,300))')
            drag_across('short')
            at_end = bubble_box()
            last = page.evaluate("(()=>{const r=document.createRange();r.selectNodeContents(document.getElementById('short'));const rects=r.getClientRects();const b=rects[rects.length-1];return {right:b.right,bottom:b.bottom}})()")
            check('menu-switches-button-to-selection-end-without-reload', at_end['visible'] and abs(at_end['right'] - last['right']) <= 3 and abs(at_end['top'] - (last['bottom'] + 9)) <= 3, {'bubble': at_end, 'selectionEnd': last})
            close_popup()
            menu.evaluate("document.querySelector('[data-anchor=cursor]').click(), true")
            browser.wait_for(lambda: menu.evaluate("document.querySelector('[data-anchor=cursor]').getAttribute('aria-pressed')==='true'"), 'menu restored position')
            page.evaluate('new Promise(r=>setTimeout(r,300))')

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
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.window').getAnimations({subtree:true}).length===0"), 'grown translation settled')
            edge = popup("const r=root.querySelector('.panel').getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),viewport:innerHeight}")
            check('grown-popup-near-bottom-fits-viewport', edge['top'] >= 0 and edge['bottom'] <= edge['viewport'], edge)
            close_popup()
            page.evaluate("document.getElementById('short').style.marginTop=''; window.scrollTo(0, 0); true")

            # 4c. A long selection opens at the size its translation will take, so the popup
            # neither flips to the other side nor moves when the translation arrives.
            # Before the size was measured, this popup opened below at 333 px and jumped above at 527 px.
            def panel_rect():
                return popup("const r=root.querySelector('.panel').getBoundingClientRect();return {top:Math.round(r.top),height:Math.round(r.height)}")

            page.evaluate("(()=>{const el=document.getElementById('short');el.textContent='Prediction check. '+" + json.dumps(LONG + ' ' + LONG) + ";el.style.marginTop='150px';return true})()")
            mouse('mousePressed', 700, 470)
            mouse('mouseReleased', 700, 470, 0)
            frames()
            select_text('short')
            popup("root.querySelector('.bubble').click(); return true")
            browser.wait_for(lambda: worker.drain() >= 1, 'held prediction request')
            frames()
            predicted = panel_rect()
            # A translation about as long as its source, like a translated YouTube description.
            worker.resolve(worker.pending.pop(0), '\n\n'.join([LONG] * 2))
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.window').getAnimations({subtree:true}).length===0"), 'predicted translation settled')
            arrived = panel_rect()
            check('long-selection-opens-at-final-size-without-moving', abs(predicted['top'] - arrived['top']) <= 1 and abs(predicted['height'] - arrived['height']) <= 2, {'loading': predicted, 'final': arrived})
            close_popup()
            page.evaluate("(()=>{const el=document.getElementById('short');el.textContent=" + json.dumps(SHORT) + ";el.style.marginTop='';return true})()")
            # The long translation is cached now, so it appears without a request.
            select_text('long')
            popup("root.querySelector('.bubble').click(); return true")
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.window').getAnimations({subtree:true}).length===0"), 'cached translation')

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
            close_popup()

            # 6. Text that scrolls under the toolbar fades at the edge and the toolbar gets a divider.
            page.evaluate("document.getElementById('short').textContent='Scroll edge title'; true")
            open_loading('short')
            worker.resolve(worker.pending.pop(0), '\n\n'.join([LONG] * 3))
            browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.window').getAnimations({subtree:true}).length===0"), 'scrolling translation settled')

            def edges(name):
                page.evaluate('new Promise(r=>setTimeout(r,250))')
                box = popup("const b=root.querySelector('.panel').getBoundingClientRect();return {x:b.x-10,y:b.y-10,width:b.width+20,height:b.height+20}")
                shot = page.call('Page.captureScreenshot', {'format': 'png', 'clip': {**box, 'scale': 1}})
                (OUTPUT / f'scroll-{name}.png').write_bytes(base64.b64decode(shot['data']))
                return popup("""const panel=root.querySelector('.panel');
                  return {above:panel.hasAttribute('data-above'),below:panel.hasAttribute('data-below'),
                  divider:getComputedStyle(root.querySelector('.toolbar')).borderBottomColor}""")

            top = edges('top')
            check('unscrolled-translation-fades-only-at-the-bottom', not top['above'] and top['below'] and top['divider'] == 'rgba(0, 0, 0, 0)', top)
            popup("root.querySelector('.translation').scrollTop=200; return true")
            middle = edges('middle')
            check('scrolled-translation-fades-under-toolbar-divider', middle['above'] and middle['below'] and middle['divider'] != 'rgba(0, 0, 0, 0)', middle)
            popup("const t=root.querySelector('.translation');t.scrollTop=t.scrollHeight; return true")
            bottom = edges('bottom')
            check('translation-scrolled-to-the-end-has-no-bottom-fade', bottom['above'] and not bottom['below'], bottom)
            close_popup()

            # 6b. Every edge and corner resizes the window and keeps the opposite edges in place.
            def panel_box():
                return popup("const r=root.querySelector('.panel').getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height),sized:root.querySelector('.panel').hasAttribute('data-sized')}")

            def center(selector):
                return popup("const r=root.querySelector(" + json.dumps(selector) + ").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}")

            def drag_by(selector, dx, dy):
                point = center(selector)
                drag(point['x'], point['y'], point['x'] + dx, point['y'] + dy)
                frames()

            def handle(name):
                return f'.resize-handle[data-handle="{name}"]'

            def open_cached_long():
                select_text('long')
                popup("root.querySelector('.bubble').click(); return true")
                browser.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.window').getAnimations({subtree:true}).length===0"), 'cached long translation')

            open_cached_long()
            default_width = panel_box()['width']
            drag_by('.toolbar', -2000, -2000)
            drag_by('.toolbar', 400, 200)
            moves = {'right': (60, 0), 'bottom': (0, -40), 'left': (-50, 0), 'top': (0, -30),
                     'top-left': (20, 20), 'top-right': (20, -20), 'bottom-left': (-20, 20), 'bottom-right': (30, 30)}
            for name, (dx, dy) in moves.items():
                before = panel_box()
                drag_by(handle(name), dx, dy)
                after = panel_box()
                expected = dict(before)
                if 'left' in name:
                    expected['left'] += dx
                if 'right' in name:
                    expected['right'] += dx
                if 'top' in name:
                    expected['top'] += dy
                if 'bottom' in name:
                    expected['bottom'] += dy
                matches = after['sized'] and all(abs(after[key] - expected[key]) <= 1 for key in ['left', 'top', 'right', 'bottom'])
                check(f'resize-from-{name}', matches, {'before': before, 'after': after, 'move': [dx, dy]})
            gap = popup("const p=root.querySelector('.panel').getBoundingClientRect(),t=root.querySelector('.translation').getBoundingClientRect();return Math.round(p.bottom-t.bottom)")
            check('resized-text-fills-window', gap <= 2, {'textGapAtBottom': gap})
            shot = page.call('Page.captureScreenshot', {'format': 'png'})
            (OUTPUT / 'resized.png').write_bytes(base64.b64decode(shot['data']))
            anchored = panel_box()
            drag_by(handle('bottom-right'), -2000, -2000)
            smallest = panel_box()
            check('resized-window-keeps-minimum-size', smallest['width'] == 220 and smallest['height'] == 100 and smallest['left'] == anchored['left'], smallest)
            drag_by(handle('top-left'), -5000, -5000)
            largest = panel_box()
            check('resized-window-stays-inside-viewport', largest['left'] == 12 and largest['top'] == 12 and largest['right'] == smallest['right'], largest)
            grip = center(handle('right'))
            for count in [1, 2]:
                for kind in ['mousePressed', 'mouseReleased']:
                    page.call('Input.dispatchMouseEvent', {'type': kind, **grip, 'button': 'left', 'buttons': 1 if kind == 'mousePressed' else 0, 'clickCount': count})
            frames()
            restored = panel_box()
            check('double-click-on-edge-restores-default-size', not restored['sized'] and restored['width'] == default_width, restored)
            drag_by(handle('bottom-right'), 80, 80)
            close_popup()
            open_cached_long()
            reopened = panel_box()
            check('new-popup-resets-manual-size', not reopened['sized'] and reopened['width'] == default_width, reopened)
            close_popup()

            # 6c. The Translate button shows only its icon by default; the toolbar menu brings back the word.
            def bubble_state():
                return popup("const b=root.querySelector('.bubble'),r=b.getBoundingClientRect();return {compact:b.classList.contains('compact'),labelShown:getComputedStyle(b.querySelector('.bubble-label')).display!=='none',width:Math.round(r.width),height:Math.round(r.height),name:b.getAttribute('aria-label')}")

            select_text('short')
            icon_only = bubble_state()
            check('translate-button-is-icon-only-by-default', icon_only['compact'] and not icon_only['labelShown'] and icon_only['width'] == icon_only['height'] and icon_only['name'] == 'Translate selected text', icon_only)
            box = popup("const b=root.querySelector('.bubble').getBoundingClientRect();return {x:b.x-12,y:b.y-12,width:b.width+24,height:b.height+24}")
            shot = page.call('Page.captureScreenshot', {'format': 'png', 'clip': {**box, 'scale': 2}})
            (OUTPUT / 'button-icon-only.png').write_bytes(base64.b64decode(shot['data']))
            menu.evaluate("document.getElementById('quick-compact').click(), true")
            browser.wait_for(lambda: menu.evaluate("!document.getElementById('quick-compact').checked && !document.getElementById('quick-status').textContent"), 'menu saved full button')
            browser.wait_for(lambda: bubble_state()['labelShown'], 'visible button shows its label')
            labeled = bubble_state()
            check('visible-button-follows-compact-change', not labeled['compact'] and labeled['width'] > icon_only['width'] + 30 and labeled['height'] == icon_only['height'], labeled)
            menu.evaluate("document.getElementById('quick-compact').click(), true")
            browser.wait_for(lambda: menu.evaluate("document.getElementById('quick-compact').checked"), 'menu restored icon-only button')
            close_popup()

            # 7. Links colored on an inner span (as on X) set the accent, not the browser's default link color.
            select_text('post-text')
            accent = page.evaluate("getComputedStyle(document.getElementById('shvyd-root')).getPropertyValue('--shvyd-accent').trim()")
            check('accent-follows-visible-link-text-color', accent == 'rgb(29, 155, 240)', {'accent': accent})
            close_popup()

            # 8. After the extension reloads, the copy left in this tab removes itself on the next selection.
            try:
                # The settings page closes with the reload, so its reply may never come.
                options.evaluate('setTimeout(()=>chrome.runtime.reload(),50), true')
            except Exception:
                pass
            page.evaluate('new Promise(r=>setTimeout(r,1500))')
            page.evaluate("(() => {const range=document.createRange();range.selectNodeContents(document.getElementById('short'));getSelection().removeAllRanges();getSelection().addRange(range);return true})()")
            page.evaluate('new Promise(r=>setTimeout(r,300))')
            left = page.evaluate("!!document.getElementById('shvyd-root')")
            check('orphaned-script-leaves-the-page-after-extension-reload', not left, {'rootStillThere': left})
            results['passed'] = not failures
        finally:
            for connection in connections:
                try:
                    connection.close()
                except Exception:
                    pass
            process.terminate()
            process.wait(timeout=10)
            server.shutdown()
            (OUTPUT / 'results.json').write_text(json.dumps(results, indent=2))

    print(json.dumps({'passed': results['passed'], 'failed': failures}), flush=True)
    raise SystemExit(0 if results['passed'] else 1)


if __name__ == '__main__':
    main()
