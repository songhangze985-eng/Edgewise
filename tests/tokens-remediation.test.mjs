import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseCssVariables, ROOT_DIR } from './e2e/harness.mjs'

test('Remediation: src/index.css contains full :root token bridge', () => {
  const indexCss = fs.readFileSync(path.join(ROOT_DIR, 'src/index.css'), 'utf-8')
  assert.match(indexCss, /:root\s*\{/, 'index.css must contain inline :root declaration block')
  
  const vars = parseCssVariables(indexCss)
  // Background tokens & aliases
  assert.equal(vars.get('--canvas'), '#0b0b0e')
  assert.equal(vars.get('--surface'), '#151518')
  assert.equal(vars.get('--bg'), 'var(--canvas)')
  assert.equal(vars.get('--bg-surface'), 'var(--surface)')
  assert.equal(vars.get('--bg-elevated'), 'var(--surface-elevated)')
  assert.equal(vars.get('--bg-card'), 'var(--surface-card)')
  assert.equal(vars.get('--panel-bg'), 'var(--surface-card)')

  // Text tokens & aliases
  assert.equal(vars.get('--ink'), '#f5f5f7')
  assert.equal(vars.get('--muted'), '#86868b')
  assert.equal(vars.get('--chalk'), 'var(--ink)')
  assert.equal(vars.get('--chalk-dim'), 'var(--muted)')
  assert.equal(vars.get('--chalk-faint'), 'rgba(226, 224, 229, 0.12)')
  assert.equal(vars.get('--text-primary'), 'var(--ink)')
  assert.equal(vars.get('--text-secondary'), 'var(--muted)')
  assert.equal(vars.get('--text-muted'), 'var(--faint)')
  assert.equal(vars.get('--text-on-primary'), '#ffffff')

  // Spacing & Grid
  assert.equal(vars.get('--sp-xs'), '4px')
  assert.equal(vars.get('--sp-sm'), '8px')
  assert.equal(vars.get('--sp-md'), '16px')
  assert.equal(vars.get('--sp-lg'), '24px')
  assert.equal(vars.get('--sp-xl'), '32px')
  assert.equal(vars.get('--sp-2xl'), '48px')

  // Radius
  assert.equal(vars.get('--r-sm'), '6px')
  assert.equal(vars.get('--r-md'), '10px')
  assert.equal(vars.get('--r-lg'), '16px')
  assert.equal(vars.get('--r-xl'), '24px')

  // Breakpoints
  assert.equal(vars.get('--bp-sm'), '480px')
  assert.equal(vars.get('--bp-md'), '768px')
  assert.equal(vars.get('--bp-lg'), '1024px')

  // Shadows
  assert.ok(vars.get('--shadow-card').includes('rgba(0, 0, 0, 0.4)'))
  assert.equal(vars.get('--shadow-glow'), '0 0 20px var(--primary-glow)')

  // Typography font weight 400
  assert.match(indexCss, /font-weight:\s*400;/)
})

test('Remediation: src/styles/tokens.css has WCAG AA light theme contrast overrides', () => {
  const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'src/styles/tokens.css'), 'utf-8')
  
  // Extract [data-theme="light"] block
  const lightMatch = tokensCss.match(/\[data-theme="light"\]\s*\{([^}]+)\}/)
  assert.ok(lightMatch, '[data-theme="light"] block must exist in tokens.css')
  const lightContent = lightMatch[1]
  const lightVars = parseCssVariables(`:root { ${lightContent} }`)

  assert.equal(lightVars.get('--success'), '#1f7a35')
  assert.equal(lightVars.get('--warning'), '#a04000')
  assert.equal(lightVars.get('--danger'), '#d70015')
  assert.equal(lightVars.get('--info'), '#0066cc')
  assert.equal(lightVars.get('--reason'), '#b25000')
  assert.equal(lightVars.get('--purple'), '#783594')
  assert.equal(lightVars.get('--blue'), '#1459a6')
})

test('Remediation: Accessibility media queries in tokens.css', () => {
  const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'src/styles/tokens.css'), 'utf-8')

  // prefers-reduced-motion
  assert.match(tokensCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important;[\s\S]*?\}/)

  // prefers-reduced-transparency
  const transparencyMatch = tokensCss.match(/@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{([\s\S]*?\n\})/)
  assert.ok(transparencyMatch, '@media (prefers-reduced-transparency: reduce) must exist')
  const body = transparencyMatch[1]
  assert.ok(body.includes('.hw-panel'))
  assert.ok(body.includes('.hw-card'))
  assert.ok(body.includes('.text-block'))
  assert.ok(body.includes('.glass-sticky-header::before'))
  assert.ok(body.includes('background: var(--surface) !important;'))
})

test('Remediation: parseCssVariables in harness.mjs traverses @import recursively', () => {
  const tempCss = `@import './styles/tokens.css';\n:root { --test-override: 123; }`
  const vars = parseCssVariables(tempCss, { baseDir: path.join(ROOT_DIR, 'src') })
  assert.equal(vars.get('--test-override'), '123')
  assert.ok(vars.has('--canvas'), 'Should have traversed tokens.css and loaded --canvas')
  assert.ok(vars.has('--font-sans'), 'Should have traversed tokens.css and loaded --font-sans')
})
