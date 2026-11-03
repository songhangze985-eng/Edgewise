/**
 * Edgewise E2E Testing Harness
 * Provides suite registration, assertion helpers, DOM/CSS inspection utilities,
 * routing table parsers, and environment mocks for Node.js execution.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '../..')

/**
 * Read source file from project root
 */
export function readSource(relativePath) {
  const fullPath = path.resolve(ROOT_DIR, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath} (${fullPath})`)
  }
  return fs.readFileSync(fullPath, 'utf-8')
}

/**
 * Check if file exists relative to project root
 */
export function fileExists(relativePath) {
  return fs.existsSync(path.resolve(ROOT_DIR, relativePath))
}

/**
 * Parse CSS variables and their values from CSS text
 */
export function parseCssVariables(cssText) {
  const vars = new Map()
  // Match --variable-name: value;
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match
  while ((match = regex.exec(cssText)) !== null) {
    vars.set(match[1].trim(), match[2].trim())
  }
  return vars
}

/**
 * Parse routes defined in App.jsx
 */
export function parseAppRoutes() {
  const appContent = readSource('src/App.jsx')
  const routes = []
  
  // Find the protected layout block
  const protectedStart = appContent.indexOf('<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>')
  const protectedEnd = appContent.indexOf('</Route>', protectedStart + 100)

  const routeRegex = /<Route\s+([^>]*?)path=["']([^"']+)["']([\s\S]*?)(?:\/>|<\/Route>)/g
  let match
  while ((match = routeRegex.exec(appContent)) !== null) {
    const full = match[0]
    const pathVal = match[2]
    const isProtected = match.index > protectedStart && match.index < protectedEnd
    const isAdmin = full.includes('AdminRoute')

    // Match component names inside element={...}
    const compMatch = full.match(/<([A-Z]\w+)(?:\s|\/|>)/g)
    const comps = compMatch 
      ? compMatch.map(c => c.slice(1, -1).trim()).filter(c => c !== 'Suspense' && c !== 'AdminRoute' && c !== 'Route') 
      : []
    const element = comps.length > 0 ? comps[0] : null

    routes.push({
      path: pathVal,
      element,
      elements: comps,
      isProtected,
      isAdmin,
      raw: full
    })
  }

  return routes
}


/**
 * Test Suite definition
 */
export class TestSuite {
  constructor(name, tier) {
    this.name = name
    this.tier = tier
    this.tests = []
  }

  test(name, fn) {
    this.tests.push({ name, fn })
  }

  async run({ verbose = false } = {}) {
    const results = []
    let passed = 0
    let failed = 0

    for (const t of this.tests) {
      const start = performance.now()
      try {
        await t.fn()
        const duration = performance.now() - start
        passed++
        results.push({ name: t.name, status: 'pass', duration, error: null })
      } catch (err) {
        const duration = performance.now() - start
        failed++
        results.push({ name: t.name, status: 'fail', duration, error: err })
      }
    }

    return {
      name: this.name,
      tier: this.tier,
      total: this.tests.length,
      passed,
      failed,
      results
    }
  }
}

/**
 * Create a new test suite
 */
export function createSuite(name, tier) {
  return new TestSuite(name, tier)
}

/**
 * Re-export standard assert
 */
export { assert }
