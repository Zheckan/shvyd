import http.server
import json
import pathlib
import subprocess
import tempfile
import threading
import time
import urllib.request

import psutil
import websocket

ROOT = pathlib.Path(__file__).parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_):
        pass


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=12, suppress_origin=True)
        self.counter = 0

    def call(self, method, params=None):
        self.counter += 1
        self.ws.send(json.dumps({'id': self.counter, 'method': method, 'params': params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get('id') == self.counter:
                if 'error' in message:
                    raise RuntimeError(message['error'])
                return message.get('result', {})

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')


def rss(pid):
    process = psutil.Process(pid)
    children = process.children(recursive=True)
    return sum(p.memory_info().rss for p in [process, *children] if p.is_running())


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
results = {}
for name, binary in [('helium', '/Applications/Helium.app/Contents/MacOS/Helium')]:
    profile = pathlib.Path(tempfile.mkdtemp(prefix='profile-' + name + '-', dir=ROOT))
    log = (ROOT / (name + '-browser.log')).open('w')
    process = subprocess.Popen([binary, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + str(profile), '--remote-debugging-port=0', 'about:blank'], stdout=log, stderr=log)
    cdp = None
    try:
        port_file = profile / 'DevToolsActivePort'
        deadline = time.monotonic() + 15
        while not port_file.exists():
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('Isolated browser did not start')
            time.sleep(.1)
        port = int(port_file.read_text().splitlines()[0])
        tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=5))
        page = next(tab for tab in tabs if tab['type'] == 'page')
        cdp = CDP(page['webSocketDebuggerUrl'])
        cdp.call('Runtime.enable')
        cdp.call('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/bench.html'})
        deadline = time.monotonic() + 15
        while cdp.evaluate('window.bench?.state') != 'ready':
            if time.monotonic() > deadline:
                raise RuntimeError('Benchmark page did not become ready')
            time.sleep(.1)
        time.sleep(2)
        baseline = rss(process.pid)
        info = cdp.evaluate('window.bench')
        results[name] = {'info': info, 'baselineRssBytes': baseline, 'modes': {}}
        print(json.dumps({'browser': name, 'info': info, 'baselineRssMiB': round(baseline / 1024**2, 1)}), flush=True)
        # Test both the current Mozilla model and the old package registry model.
        for mode in ['modern', 'old']:
            cdp.evaluate(f'window.runLocal({json.dumps(mode)}); undefined')
            peak = rss(process.pid)
            deadline = time.monotonic() + 80
            restart_count = 0
            while True:
                status = cdp.evaluate("window.bench?({state:window.bench.state,count:window.bench.samples.length,errors:window.bench.errors}):({state:'missing',href:location.href})")
                if status['state'] == 'ready' and restart_count < 2:
                    restart_count += 1
                    print(json.dumps({'browser':name,'mode':mode,'harnessRestartAfterPageReload':restart_count}),flush=True)
                    cdp.evaluate(f'window.runLocal({json.dumps(mode)}); undefined')
                peak = max(peak, rss(process.pid))
                if status['state'] in ['done', 'failed']:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError(f'Benchmark timed out: {status}')
                time.sleep(.25)
            data = cdp.evaluate('window.bench')
            data['peakRssBytes'] = peak
            data['peakIncreaseRssBytes'] = peak - baseline
            results[name]['modes'][mode] = data
            (ROOT / 'local-results.json').write_text(json.dumps(results, indent=2))
            print(json.dumps({'browser': name, 'mode': mode, 'state': data['state'], 'cold': data.get('cold'), 'samples': len(data['samples']), 'errors': data['errors'], 'peakIncreaseRssMiB': round((peak - baseline) / 1024**2, 1)}), flush=True)
            cdp.call('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/bench.html'})
            deadline = time.monotonic() + 10
            while cdp.evaluate('window.bench?.state') != 'ready' and time.monotonic() < deadline:
                time.sleep(.1)
        if info['translatorApi'] != 'undefined':
            cdp.evaluate("window.nativeAvailability={state:'pending'}; Translator.availability({sourceLanguage:'en',targetLanguage:'uk'}).then(value=>window.nativeAvailability={state:'done',value},e=>window.nativeAvailability={state:'error',error:String(e)}); undefined")
            deadline = time.monotonic() + 8
            while cdp.evaluate('window.nativeAvailability?.state') == 'pending' and time.monotonic() < deadline:
                time.sleep(.2)
            results[name]['nativeAvailability'] = cdp.evaluate('window.nativeAvailability')
            cdp.call('Runtime.evaluate', {'expression': 'window.runNative(); undefined', 'userGesture': True})
            deadline = time.monotonic() + 40
            while cdp.evaluate('window.nativeBench?.state') in ['creating','running'] and time.monotonic() < deadline:
                time.sleep(.25)
            results[name]['nativeBenchmark'] = cdp.evaluate('window.nativeBench')
            results[name]['nativeFiles'] = [{'name': str(p.relative_to(profile)), 'bytes':p.stat().st_size} for p in profile.rglob('*') if p.is_file() and ('translate' in str(p).lower() or 'translation' in str(p).lower())]
            print(json.dumps({'browser':name,'nativeAvailability':results[name]['nativeAvailability'],'nativeState':results[name]['nativeBenchmark']['state'],'nativeError':results[name]['nativeBenchmark'].get('error'),'nativeSamples':len(results[name]['nativeBenchmark']['samples']),'nativeFiles':results[name]['nativeFiles']}),flush=True)
    except Exception as error:
        results.setdefault(name, {})['error'] = str(error)
        print(json.dumps({'browser': name, 'error': str(error)}), flush=True)
    finally:
        if cdp:
            cdp.ws.close()
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        log.close()
        (ROOT / 'local-results.json').write_text(json.dumps(results, indent=2))
server.shutdown()
print(json.dumps({'resultFile': str(ROOT / 'local-results.json')}), flush=True)
