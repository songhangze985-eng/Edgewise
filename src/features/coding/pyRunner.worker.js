/* eslint-disable no-restricted-globals */

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
let pyodideReady = null

async function ensurePyodide() {
  if (pyodideReady) return pyodideReady
  pyodideReady = (async () => {
    importScripts(`${PYODIDE_CDN}pyodide.js`)
    // eslint-disable-next-line no-undef
    return loadPyodide({ indexURL: PYODIDE_CDN })
  })()
  return pyodideReady
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

self.onmessage = async (event) => {
  const {
    id,
    source,
    tests,
    entryPoint,
    timeoutMs = 15000,
  } = event.data || {}

  const fail = (message) => {
    self.postMessage({
      id,
      ok: false,
      error: message,
      passed: 0,
      total: (tests || []).length,
      cases: [],
    })
  }

  const timer = setTimeout(() => {
    fail(`Python 执行超时（>${timeoutMs}ms）`)
  }, timeoutMs)

  try {
    const pyodide = await ensurePyodide()
    await pyodide.runPythonAsync(source || '')
    const ep = entryPoint || 'solution'
    const fn = pyodide.globals.get(ep)
    if (!fn) {
      clearTimeout(timer)
      fail(`未找到函数 ${ep}`)
      return
    }

    const caseResults = []
    for (let index = 0; index < (tests || []).length; index += 1) {
      const tc = tests[index]
      try {
        const argsJson = JSON.stringify(tc.args || [])
        const py = `
import json, copy
_args = json.loads('''${argsJson.replace(/'/g, "\\'")}''')
_fn = globals().get("${ep}")
if _fn is None:
    raise RuntimeError("未找到函数 ${ep}")
if len(_args) == 1 and isinstance(_args[0], list):
    _work = copy.deepcopy(_args[0])
    _fn(_work)
    _result = _work
else:
    _result = _fn(*_args)
json.dumps(_result)
`
        const outRaw = await pyodide.runPythonAsync(py)
        const actual = JSON.parse(outRaw)
        const pass = deepEqual(actual, tc.expected)
        caseResults.push({
          index,
          pass,
          expected: tc.expected,
          actual,
          error: pass ? undefined : '输出与期望不一致',
        })
      } catch (err) {
        caseResults.push({
          index,
          pass: false,
          error: err?.message || String(err),
        })
      }
    }

    clearTimeout(timer)
    const passed = caseResults.filter((c) => c.pass).length
    self.postMessage({
      id,
      ok: true,
      passed,
      total: caseResults.length,
      cases: caseResults,
    })
  } catch (err) {
    clearTimeout(timer)
    fail(err?.message || String(err))
  }
}
