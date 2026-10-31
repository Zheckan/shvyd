#!/usr/bin/env python3
"""Exercise the built extension with controlled providers in isolated Helium.

No provider keys or playground server are required. Observations use the popup
UI and extension messages; only external fetch and storage timing are controlled.
"""
import importlib.util
import json
import base64
import queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
import urllib.request

import websocket

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('extension_checks', ROOT / 'scripts/check-extension.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
OUTPUT = ROOT / '.preview/reliability-check'


class WorkerProbe:
    """Pause real network requests with DevTools, leaving service code untouched."""

    def __init__(self, url):
        self.socket = websocket.create_connection(url, timeout=20, suppress_origin=True)
        self.counter = 0
        self.replies = {}
        self.lock = threading.Lock()
        self.events = queue.Queue()
        self.pending = []
        self.requests = []
        self.hold = False
        self.status = 200
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()
        self.call('Runtime.enable')
        self.call('Fetch.enable', {'patterns': [{'urlPattern': 'https://api.cognitive.microsofttranslator.com/translate*'}]})

    def read(self):
        try:
            while True:
                result = json.loads(self.socket.recv())
                if 'id' in result:
                    with self.lock:
                        reply = self.replies.get(result['id'])
                    if reply:
                        reply.put(result)
                elif result.get('method') == 'Fetch.requestPaused':
                    self.events.put(result['params'])
        except (websocket.WebSocketException, ValueError, OSError):
            pass

    def call(self, method, params=None):
        reply = queue.Queue()
        with self.lock:
            self.counter += 1
            request_id = self.counter
            self.replies[request_id] = reply
            self.socket.send(json.dumps({'id': request_id, 'method': method, 'params': params or {}}))
        try:
            result = reply.get(timeout=20)
            if 'error' in result:
                raise RuntimeError(f'Browser operation failed: {method}: {result["error"]}')
            return result.get('result', {})
        finally:
            with self.lock:
                self.replies.pop(request_id, None)

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in result:
            raise RuntimeError('Controlled worker fixture failed.')
        return result.get('result', {}).get('value')

    def drain(self):
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            target = json.loads(event['request']['postData'])['inputs'][0]['targets'][0]['language'].lower()
            request = {'id': event['requestId'], 'target': target}
            self.requests.append(request)
            if self.hold:
                self.pending.append(request)
            else:
                self.resolve(request, 'Translated ' + target, self.status)
        return len(self.pending)

    def resolve(self, request, text, status=200):
        body = {'value': [{'translations': [{'text': text}]}]} if status == 200 else {'error': {'code': 403001}}
        self.call('Fetch.fulfillRequest', {'requestId': request['id'], 'responseCode': status, 'responseHeaders': [{'name': 'Content-Type', 'value': 'application/json'}], 'body': base64.b64encode(json.dumps(body).encode()).decode()})

    def reject(self, request):
        self.call('Fetch.failRequest', {'requestId': request['id'], 'errorReason': 'ConnectionFailed'})

    def close(self):
        self.socket.close()


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        html = b'<!doctype html><html><head><title>Shvyd reliability fixture</title></head><body style="padding:80px"><p id="first">A first selected sentence.</p><p id="second">A different selected sentence.</p></body></html>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(html)

    def log_message(self, *_args):
        pass


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = {'browser': 'Helium', 'isolatedProfile': True, 'controlledProviders': True, 'passed': False, 'checks': []}
    connections = []
    with tempfile.TemporaryDirectory(prefix='shvyd-reliability-') as profile:
        process = subprocess.Popen([
            module.BROWSER, '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--user-data-dir=' + profile, '--remote-debugging-port=0',
            '--disable-extensions-except=' + str(ROOT / 'dist'),
            '--load-extension=' + str(ROOT / 'dist'), 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile) / 'DevToolsActivePort'
            module.wait_for(port_file.exists, 'isolated browser startup')
            port = int(port_file.read_text().splitlines()[0])

            def targets():
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5) as response:
                    return json.load(response)

            page = module.CDP(next(item for item in targets() if item['type'] == 'page')['webSocketDebuggerUrl'])
            connections.append(page)
            page.call('Runtime.enable')
            page.call('Page.enable')
            page.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            fixture = f'http://127.0.0.1:{server.server_port}/'
            page.call('Page.navigate', {'url': fixture})
            module.wait_for(lambda: page.evaluate("!!document.getElementById('shvyd-root')"), 'content script startup')
            worker_info = module.wait_for(lambda: next((item for item in targets() if item['type'] == 'service_worker' and item['url'].endswith('/background.js')), None), 'extension worker')
            extension_id = worker_info['url'].split('/')[2]
            worker = WorkerProbe(worker_info['webSocketDebuggerUrl'])
            connections.append(worker)
            options_id = page.call('Target.createTarget', {'url': f'chrome-extension://{extension_id}/options.html'})['targetId']
            options_info = module.wait_for(lambda: next((item for item in targets() if item['id'] == options_id), None), 'settings tab')
            options = module.CDP(options_info['webSocketDebuggerUrl'])
            connections.append(options)
            options.call('Runtime.enable')
            module.wait_for(lambda: options.evaluate("!!document.getElementById('settings-fields') && !document.getElementById('settings-fields').disabled"), 'settings bootstrap')
            assert options.evaluate("(async()=>{const current=await chrome.runtime.sendMessage({kind:'get-settings'});const saved=await chrome.runtime.sendMessage({kind:'save-settings',value:{...current.data,azure:{key:'controlled-test-key',region:''},target:'uk',defaultTarget:'uk',targetMode:'last',favoriteLanguages:['uk','pl','en']}});return saved.ok})()")
            assert worker.evaluate((ROOT / 'src/test/browser/reliability-storage.js').read_text())
            page.call('Page.bringToFront')

            def popup(expression):
                return page.evaluate("(() => {const root=document.getElementById('shvyd-root').shadowRoot;" + expression + "})()")

            def click(selector):
                assert popup('const item=root.querySelector(' + json.dumps(selector) + ');if(!item||item.hidden)return false;item.click();return true;')

            def select(passage='first'):
                page.evaluate("(() => {const range=document.createRange();range.selectNodeContents(document.getElementById(" + json.dumps(passage) + "));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'))})()")
                module.wait_for(lambda: popup("return !root.querySelector('.bubble').hidden"), 'selection button')
                click('.bubble')

            def record(name):
                results['checks'].append({'check': name, 'passed': True})
                print(json.dumps({'check': name, 'passed': True}), flush=True)

            def completed(text):
                module.wait_for(lambda: popup("return !root.querySelector('.translation').hidden && root.querySelector('.translation').textContent === " + json.dumps(text) + " && root.querySelector('.panel').getAttribute('aria-busy') === 'false'"), 'latest translation: ' + text)

            def fresh_selection(text):
                click('[aria-label="Close translation"]')
                page.evaluate('document.getElementById("first").textContent=' + json.dumps(text))
                select()

            def choose(code):
                click('.target')
                click('[data-language="' + code + '"]')

            def settle():
                page.evaluate('(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()')

            worker.hold = True
            select()
            module.wait_for(lambda: worker.drain() == 1, 'initial delayed request')
            worker.evaluate('shvydProbe.holdSaves=true')
            click('.target')
            click('[data-language="pl"]')
            module.wait_for(lambda: worker.evaluate('shvydProbe.saves.length===1'), 'delayed language preference save')
            worker.resolve(worker.pending.pop(0), 'STALE UK')
            state = page.evaluate("(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const root=document.getElementById('shvyd-root').shadowRoot;return {hidden:root.querySelector('.translation').hidden,busy:root.querySelector('.panel').getAttribute('aria-busy')}})()")
            assert state['hidden'] and state['busy'] == 'true', 'Old language appeared while the new target was saving: ' + json.dumps(state)
            record('old-response-ignored-as-soon-as-target-changes')
            worker.evaluate('shvydProbe.holdSaves=false;shvydProbe.saves.shift().resolve()')
            module.wait_for(lambda: worker.drain() == 1, 'new target request')
            assert worker.pending[0]['target'] == 'pl'
            worker.resolve(worker.pending.pop(0), 'CURRENT PL')
            completed('CURRENT PL')

            worker.evaluate('shvydProbe.holdSaves=true')
            click('.target')
            click('[data-language="en"]')
            module.wait_for(lambda: worker.evaluate('shvydProbe.saves.length===1'), 'closing during preference save')
            click('[aria-label="Close translation"]')
            select('second')
            worker.evaluate('shvydProbe.holdSaves=false;shvydProbe.saves.shift().reject()')
            module.wait_for(lambda: worker.drain() == 1, 'new selection after failed old save')
            assert popup("return root.querySelector('.status').classList.contains('sr-only')"), 'A dismissed language save failure changed the new popup'
            worker.resolve(worker.pending.pop(0), 'SECOND PL')
            completed('SECOND PL')
            record('dismissed-language-save-failure-ignored')

            worker.evaluate('shvydProbe.holdSaves=true')
            click('.target')
            click('[data-language="en"]')
            module.wait_for(lambda: worker.evaluate('shvydProbe.saves.length===1'), 'current preference save')
            worker.evaluate('shvydProbe.holdSaves=false;shvydProbe.saves.shift().reject()')
            module.wait_for(lambda: popup("return root.querySelector('.status').textContent.includes('could not be saved')"), 'current save failure')
            assert popup("return root.querySelector('.loading').hidden && root.querySelector('.panel').getAttribute('aria-busy')==='false'"), 'A failed language save left the popup loading'
            record('language-save-failure-stops-loading')

            fresh_selection('Rapid language changes.')
            module.wait_for(lambda: worker.drain() == 1, 'rapid initial request')
            choose('en')
            module.wait_for(lambda: worker.drain() == 2, 'rapid English request')
            choose('uk')
            module.wait_for(lambda: worker.drain() == 3, 'rapid Ukrainian request')
            assert [item['target'] for item in worker.pending] == ['pl', 'en', 'uk']
            worker.resolve(worker.pending.pop(), 'LATEST UK')
            completed('LATEST UK')
            worker.resolve(worker.pending.pop(), 'OLD EN')
            worker.resolve(worker.pending.pop(), 'OLD PL')
            settle()
            completed('LATEST UK')
            record('rapid-target-changes-ignore-out-of-order-replies')

            fresh_selection('Close before this reply arrives.')
            module.wait_for(lambda: worker.drain() == 1, 'closing request')
            closed_request = worker.pending.pop()
            click('[aria-label="Close translation"]')
            worker.resolve(closed_request, 'CLOSED REPLY')
            settle()
            assert popup("return root.querySelector('.panel').hidden"), 'A reply reopened a closed popup'
            page.evaluate('document.getElementById("first").textContent="A new selection after closing."')
            select()
            module.wait_for(lambda: worker.drain() == 1, 'reopened request')
            worker.resolve(worker.pending.pop(), 'REOPENED UK')
            completed('REOPENED UK')
            record('close-ignores-late-reply-and-next-selection-works')

            fresh_selection('Retry after a network failure.')
            module.wait_for(lambda: worker.drain() == 1, 'network failure request')
            worker.reject(worker.pending.pop())
            module.wait_for(lambda: popup("return !root.querySelector('.actions').hidden && root.querySelector('.status').textContent.includes('connect')"), 'network error UI')
            click('.actions button')
            module.wait_for(lambda: worker.drain() == 1, 'manual retry request')
            worker.resolve(worker.pending.pop(), 'RETRY UK')
            completed('RETRY UK')
            record('network-failure-shows-error-and-manual-retry-recovers')

            def message(value):
                options.evaluate('globalThis.shvydReply=null;chrome.runtime.sendMessage(' + json.dumps(value) + ').then(value=>{globalThis.shvydReply=value});true')

                def response():
                    worker.drain()
                    return options.evaluate('globalThis.shvydReply')

                return module.wait_for(response, 'extension message response')

            worker.hold = False
            for status, code in [(429, 'rate-limit'), (403, 'quota'), (504, 'timeout')]:
                worker.status = status
                reply = message({'kind': 'translate', 'text': f'Error status {status}', 'target': 'uk'})
                assert not reply['ok'] and reply['code'] == code, 'Incorrect error classification through extension messages'
            worker.status = 200
            record('rate-limit-quota-and-timeout-cross-worker-message-interface')

            checkpoint = {'kind': 'translate', 'text': 'Worker restart cache checkpoint.', 'target': 'uk'}
            first = message(checkpoint)
            second = message(checkpoint)
            assert first['ok'] and not first['data']['cached']
            assert second['ok'] and second['data']['cached']
            usage_before = message({'kind': 'get-usage'})
            assert usage_before['ok'], 'Usage could not be read before restart'
            before = options.evaluate("chrome.runtime.sendMessage({kind:'preferences'})")
            old_id = worker_info['id']
            worker.close()
            connections.remove(worker)
            page.call('ServiceWorker.enable')
            page.call('ServiceWorker.stopAllWorkers')
            module.wait_for(lambda: not any(item['id'] == old_id for item in targets()), 'actual service-worker stop')
            after = options.evaluate("chrome.runtime.sendMessage({kind:'preferences'})")
            assert after == before, 'Saved preferences changed across worker restart'
            worker_info = module.wait_for(lambda: next((item for item in targets() if item['type'] == 'service_worker' and item['url'].endswith('/background.js')), None), 'restarted worker')
            assert worker_info['id'] != old_id, 'The original worker was not replaced'
            worker = WorkerProbe(worker_info['webSocketDebuggerUrl'])
            connections.append(worker)
            restarted = message(checkpoint)
            cached_again = message(checkpoint)
            assert restarted['ok'] and not restarted['data']['cached'], 'A new worker retained the old memory cache'
            assert cached_again['ok'] and cached_again['data']['cached']
            assert len(worker.requests) == 1, 'Restarted worker did not cache its new result'
            record('actual-worker-restart-retains-settings-and-rebuilds-memory-cache')

            def own_key_totals(reply):
                rows = [day for day in reply['data']['days'] if day['provider'] == 'azure' and day['access'] == 'own-key']
                return {key: sum(day[key] for day in rows) for key in ['requests', 'succeeded', 'failed', 'uncertain', 'reused', 'characters']}

            usage_after = message({'kind': 'get-usage'})
            old_totals = own_key_totals(usage_before)
            new_totals = own_key_totals(usage_after)
            assert old_totals['requests'] >= 1 and old_totals['failed'] >= 2 and old_totals['uncertain'] >= 1, 'Provider failures were not counted: ' + json.dumps(old_totals)
            assert new_totals['requests'] == old_totals['requests'] + 1, 'Usage did not survive the worker restart: ' + json.dumps([old_totals, new_totals])
            assert new_totals['reused'] == old_totals['reused'] + 1, 'Cache hit was not counted as reused'
            assert new_totals['characters'] == old_totals['characters'] + len(checkpoint['text'])
            record('usage-counts-survive-worker-restart-and-count-provider-calls-once')

            secret_text = 'Private diagnostic sentence.'
            enabled = message({'kind': 'set-diagnostics', 'enabled': True})
            assert enabled['ok'] and enabled['data']['diagnostics']['enabled']
            worker.status = 429
            failed = message({'kind': 'translate', 'text': secret_text, 'target': 'uk'})
            worker.status = 200
            assert not failed['ok'] and failed['code'] == 'rate-limit'
            exported = message({'kind': 'export-diagnostics'})
            assert exported['ok'] and len(exported['data']['records']) == 1
            assert sorted(exported['data']['records'][0]) == ['code', 'durationMs', 'provider', 'reference', 'status', 'time', 'version']
            serialized = json.dumps(exported['data'])
            for forbidden in [secret_text, 'controlled-test-key', '127.0.0.1', 'reliability fixture']:
                assert forbidden not in serialized, 'Diagnostics export leaked ' + forbidden
            disabled = message({'kind': 'set-diagnostics', 'enabled': False})
            assert disabled['data']['diagnostics'] == {'enabled': False, 'count': 0}
            record('diagnostics-opt-in-export-is-redacted-and-disable-deletes-records')

            options.call('Page.reload')
            module.wait_for(lambda: options.evaluate("[...document.querySelectorAll('#usage-rows th')].some(cell=>cell.textContent==='Azure · your key')"), 'usage table on settings page')
            options.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            options.evaluate("document.querySelector('[data-usage-period=\"7\"]').click(),document.getElementById('usage').scrollIntoView(),true")
            box = options.evaluate("(()=>{const a=document.getElementById('usage').getBoundingClientRect();const b=document.getElementById('diagnostics').getBoundingClientRect();return {x:a.x-8,y:a.y+scrollY-8,width:a.width+16,height:b.bottom-a.top+16}})()")
            shot = options.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True, 'clip': {**box, 'scale': 1}})
            (OUTPUT / 'usage-settings.png').write_bytes(base64.b64decode(shot['data']))
            options.evaluate("document.querySelector('#clear-usage') && (window.confirm=()=>true, document.querySelector('#clear-usage').click(), true)")
            module.wait_for(lambda: options.evaluate("!document.querySelector('#usage-empty').hidden && document.querySelectorAll('#usage-rows tr').length===0"), 'usage cleared from settings page')
            record('settings-page-shows-and-clears-usage')
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
            server.shutdown()
            server.server_close()
            (OUTPUT / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps({'passed': results.get('passed', False), 'checks': len(results['checks'])}), flush=True)


if __name__ == '__main__':
    main()
