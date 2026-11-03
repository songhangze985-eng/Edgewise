/**
 * CodeRunner — local JS/Python execution; swap implementation for Judge0 later.
 */

let jsWorker = null
let pyWorker = null
let seq = 0

function nextId() {
  seq += 1
  return `run-${Date.now()}-${seq}`
}

function runInWorker(worker, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = payload.id || nextId()
    const w = worker

    const onMessage = (event) => {
      if (event.data?.id !== id) return
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      resolve(event.data)
    }
    const onError = (err) => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      reject(err)
    }

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ ...payload, id, timeoutMs })
  })
}

function getJsWorker() {
  if (!jsWorker) {
    jsWorker = new Worker(new URL('./runner.worker.js', import.meta.url), { type: 'classic' })
  }
  return jsWorker
}

function getPyWorker() {
  if (!pyWorker) {
    pyWorker = new Worker(new URL('./pyRunner.worker.js', import.meta.url), { type: 'classic' })
  }
  return pyWorker
}

/**
 * @param {object} opts
 * @param {'javascript'|'python'} opts.language
 * @param {string} opts.source
 * @param {Array<{args: unknown[], expected: unknown}>} opts.tests
 * @param {string} opts.entryPoint
 * @param {number} [opts.timeoutMs]
 */
export async function runCode({
  language,
  source,
  tests,
  entryPoint,
  timeoutMs,
}) {
  const lang = (language || 'javascript').toLowerCase()
  if (lang === 'python' || lang === 'py') {
    return runInWorker(
      getPyWorker(),
      { source, tests, entryPoint },
      timeoutMs ?? 15000,
    )
  }
  return runInWorker(
    getJsWorker(),
    { source, tests, entryPoint },
    timeoutMs ?? 2000,
  )
}

/** Placeholder for future remote judge integration. */
export const CodeRunner = {
  run: runCode,
  provider: 'local',
}

export default CodeRunner
