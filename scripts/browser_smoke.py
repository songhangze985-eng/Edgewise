import asyncio
import http.client
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

import websockets

config = json.load(sys.stdin)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Proxy(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def proxy(self):
        port = config["api_port"] if self.path.startswith("/api/") else 3000
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else None
        excluded = {"host", "connection", "accept-encoding", "content-length"}
        headers = {k: v for k, v in self.headers.items() if k.lower() not in excluded}
        headers["Host"] = f"127.0.0.1:{port}"
        try:
            conn.request(self.command, self.path, body, headers)
            response = conn.getresponse()
            data = response.read()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in {"transfer-encoding", "connection", "content-length", "content-encoding"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        finally:
            conn.close()

    do_GET = proxy
    do_POST = proxy


class BrowserProxyServer(ThreadingHTTPServer):
    # Vite loads many modules concurrently; the default backlog of five can reset requests.
    request_queue_size = 128


proxy = BrowserProxyServer(("127.0.0.1", 0), Proxy)
threading.Thread(target=proxy.serve_forever, daemon=True).start()
debug_port = free_port()


async def exercise(websocket_url):
    async with websockets.connect(websocket_url, max_size=2**24) as ws:
        next_id = 0
        errors = []

        async def call(method, params=None):
            nonlocal next_id
            next_id += 1
            wanted = next_id
            await ws.send(json.dumps({"id": wanted, "method": method, "params": params or {}}))
            while True:
                message = json.loads(await asyncio.wait_for(ws.recv(), 20))
                if message.get("method") in ("Runtime.exceptionThrown", "Network.loadingFailed"):
                    errors.append(message.get("params", {}))
                if message.get("id") == wanted:
                    if "error" in message:
                        raise RuntimeError(message["error"])
                    return message.get("result", {})

        async def evaluate(expression):
            result = await call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
            if result.get("exceptionDetails"):
                raise RuntimeError(result["exceptionDetails"])
            return result.get("result", {}).get("value")

        await call("Page.enable")
        await call("Runtime.enable")
        await call("Network.enable")
        auth = json.dumps({"state": {"user": config["user"], "accessToken": config["token"], "isAuthenticated": True}, "version": 0}, ensure_ascii=False)
        script = f"localStorage.setItem('edgewise-auth', {json.dumps(auth, ensure_ascii=False)});"
        await call("Page.addScriptToEvaluateOnNewDocument", {"source": script})
        await call("Page.navigate", {"url": f"http://127.0.0.1:{proxy.server_port}/"})
        for _ in range(150):
            found = await evaluate("Boolean(document.querySelector('[aria-labelledby=\"micro-survey-modal-title\"] button[role=radio]'))")
            if found:
                break
            await asyncio.sleep(0.1)
        else:
            state = await evaluate("({url: location.href, ready: document.readyState, body: document.body.innerText.slice(0, 1200)})")
            raise RuntimeError(f"Survey modal did not appear: {state}; browser errors: {errors[-5:]}")
        clicked = await evaluate("""(() => {
          const dialog = document.querySelector('[aria-labelledby="micro-survey-modal-title"]');
          dialog.querySelector('button[role=radio]').click();
          const submit = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('提交回答'));
          return !!submit;
        })()""")
        assert clicked
        await asyncio.sleep(0.3)
        await evaluate("""[...document.querySelectorAll('[aria-labelledby="micro-survey-modal-title"] button')].find(b => b.textContent.includes('提交回答')).click()""")
        for _ in range(100):
            if not await evaluate("Boolean(document.querySelector('[aria-labelledby=\"micro-survey-modal-title\"]'))"):
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Survey did not close after submission")

        await evaluate("""document.querySelector('[aria-label="AI Copilot 准备诊断助手"]').click()""")
        for _ in range(100):
            clicked = await evaluate("""(() => {
                const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '说不清我做了什么');
                if (!button) return false;
                button.click();
                return true;
            })()""")
            if clicked:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Copilot intake option did not appear")
        for _ in range(100):
            accepted = await evaluate("""Boolean(document.querySelector('[class*="result-judgment"]')) &&
                !localStorage.getItem('edgewise:research_event_retry_queue:' +
                    encodeURIComponent(JSON.parse(localStorage.getItem('edgewise-auth')).state.user.id))""")
            if accepted:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Copilot response or event acknowledgement did not arrive")

        await evaluate("""[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '开始经历整理练习').click()""")
        for _ in range(100):
            task_link = await evaluate("""(() => {
                const cta = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === '开始匹配练习');
                if (!cta) return null;
                const triageId = new URL(location.href).searchParams.get('copilot_triage_id');
                if (!triageId || new URL(cta.href).searchParams.get('copilot_triage_id') !== triageId) return null;
                cta.click();
                return triageId;
            })()""")
            if task_link:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Copilot diagnostic ID did not reach the task CTA")
        for _ in range(100):
            if await evaluate(f"location.pathname === '/interview/lobby' && new URL(location.href).searchParams.has('task_entry_click_id') && new URL(location.href).searchParams.get('copilot_triage_id') === {json.dumps(task_link)}"):
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Copilot diagnostic ID did not reach the interview lobby")

        await call("Page.navigate", {"url": f"http://127.0.0.1:{proxy.server_port}/series/creator-internship-mirror"})
        for _ in range(100):
            ready = await evaluate("""Boolean(document.querySelector('[data-episode-id]')) &&
                document.visibilityState === 'visible'""")
            if ready:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Creator series episodes did not render")
        await evaluate("""document.querySelector('[data-episode-id]').scrollIntoView({block: 'center'})""")
        await asyncio.sleep(0.5)
        for _ in range(100):
            flushed = await evaluate("""!localStorage.getItem('edgewise:research_event_retry_queue:' +
                encodeURIComponent(JSON.parse(localStorage.getItem('edgewise-auth')).state.user.id))""")
            if flushed:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Creator exposure event was not acknowledged")

        await evaluate("""document.querySelector('[data-episode-id] button').click()""")
        for _ in range(100):
            task_clicked = await evaluate("""(() => {
                const cta = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === '开始匹配练习');
                if (!cta || !new URL(location.href).searchParams.has('series_task_click_id')) return false;
                cta.click();
                return true;
            })()""")
            if task_clicked:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Creator link did not reach the task page")
        for _ in range(100):
            if await evaluate("""location.pathname === '/interview/lobby' &&
                !localStorage.getItem('edgewise:research_event_retry_queue:' +
                    encodeURIComponent(JSON.parse(localStorage.getItem('edgewise-auth')).state.user.id))"""):
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Creator task click did not reach the lobby or finish uploading")


try:
    with tempfile.TemporaryDirectory(prefix="edgewise-browser-") as directory:
        chrome = subprocess.Popen([
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--disable-gpu",
            "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
            "--remote-allow-origins=*", f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={directory}", "about:blank",
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1) as response:
                        pages = json.load(response)
                    if pages:
                        break
                except Exception:
                    pass
                if chrome.poll() is not None:
                    raise RuntimeError("Chrome exited before opening DevTools")
                time.sleep(0.1)
            else:
                raise RuntimeError("Chrome DevTools did not start")
            asyncio.run(exercise(pages[0]["webSocketDebuggerUrl"]))
        finally:
            chrome.terminate()
            chrome.wait(timeout=10)
finally:
    proxy.shutdown()
    proxy.server_close()

print("PASS: browser displayed and submitted the survey")
