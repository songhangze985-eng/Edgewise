/* eslint-disable no-restricted-globals */

const DEFAULT_TIMEOUT_MS = 2000

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

function buildRunner(source, entryPoint) {
  const wrapped = `
    "use strict";
    ${source}
    if (typeof ${entryPoint} !== "function") {
      throw new Error("未找到函数 ${entryPoint}");
    }
    return ${entryPoint};
  `
  // eslint-disable-next-line no-new-func
  return new Function(wrapped)()
}

function runCase(fn, testCase) {
  const args = testCase.args || []
  const result = fn(...args)
  const pass = deepEqual(result, testCase.expected)
  return {
    pass,
    expected: testCase.expected,
    actual: result,
    error: pass ? undefined : '输出与期望不一致',
  }
}

self.onmessage = (event) => {
  const {
    id,
    source,
    tests,
    entryPoint,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = event.data || {}

  const timer = setTimeout(() => {
    self.postMessage({
      id,
      ok: false,
      error: `执行超时（>${timeoutMs}ms）`,
      passed: 0,
      total: (tests || []).length,
      cases: [],
    })
  }, timeoutMs)

  try {
    const fn = buildRunner(source || '', entryPoint || 'solution')
    const caseResults = (tests || []).map((tc, index) => {
      try {
        const r = runCase(fn, tc)
        return { index, ...r }
      } catch (err) {
        return {
          index,
          pass: false,
          error: err?.message || String(err),
        }
      }
    })
    const passed = caseResults.filter((c) => c.pass).length
    clearTimeout(timer)
    self.postMessage({
      id,
      ok: true,
      passed,
      total: caseResults.length,
      cases: caseResults,
    })
  } catch (err) {
    clearTimeout(timer)
    self.postMessage({
      id,
      ok: false,
      error: err?.message || String(err),
      passed: 0,
      total: (tests || []).length,
      cases: [],
    })
  }
}
