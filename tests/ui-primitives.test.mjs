import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const PRIMITIVES_DIR = fs.existsSync(path.resolve(import.meta.dirname, '../src/components/ui/Button.jsx'))
  ? path.resolve(import.meta.dirname, '../src/components/ui')
  : path.resolve(import.meta.dirname, '../proposed_ui')

test('UI Primitives: all 8 component files and CSS modules exist in proposed_ui', () => {
  const expectedFiles = [
    'Button.jsx',
    'Button.module.css',
    'Card.jsx',
    'Card.module.css',
    'Input.jsx',
    'Input.module.css',
    'SegmentedControl.jsx',
    'SegmentedControl.module.css',
    'Switch.jsx',
    'Switch.module.css',
    'Badge.jsx',
    'Badge.module.css',
    'Modal.jsx',
    'Modal.module.css',
    'Tabs.jsx',
    'Tabs.module.css',
    'Select.jsx',
    'Select.module.css',
    'index.js',
  ]

  for (const file of expectedFiles) {
    const fullPath = path.join(PRIMITIVES_DIR, file)
    assert.ok(fs.existsSync(fullPath), `Expected file ${file} must exist in proposed_ui`)
    const stats = fs.statSync(fullPath)
    assert.ok(stats.size > 50, `File ${file} must not be empty (size=${stats.size})`)
  }
})

test('UI Primitives: Button adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Button.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Button.module.css'), 'utf-8')

  // Contract: variant="solid" | "ghost" | "accent" | "danger"
  assert.match(jsx, /variant\s*=\s*['"]solid['"]/, 'Default variant should be solid')
  assert.match(css, /\.solid\s*\{/, 'CSS must implement .solid variant')
  assert.match(css, /\.ghost\s*\{/, 'CSS must implement .ghost variant')
  assert.match(css, /\.accent\s*\{/, 'CSS must implement .accent variant')
  assert.match(css, /\.danger\s*\{/, 'CSS must implement .danger variant')

  // Contract: size="sm" | "md" | "lg"
  assert.match(jsx, /size\s*=\s*['"]md['"]/, 'Default size should be md')
  assert.match(css, /\.sm\s*\{/, 'CSS must implement .sm size')
  assert.match(css, /\.md\s*\{/, 'CSS must implement .md size')
  assert.match(css, /\.lg\s*\{/, 'CSS must implement .lg size')

  // Loading spinner & disabled states
  assert.match(jsx, /loading/, 'Button must handle loading prop')
  assert.match(jsx, /aria-busy/, 'Button must set aria-busy when loading')
  assert.match(css, /\.spinner\s*\{/, 'CSS must style spinner')

  // Tactile spring press feedback
  assert.match(css, /:active:not\(:disabled\)\s*\{\s*transform:\s*scale\(0\.97\)/, 'Button must have active scale(0.97)')
  assert.match(css, /--ease-spring/, 'Button transition must utilize --ease-spring')
})

test('UI Primitives: Card adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Card.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Card.module.css'), 'utf-8')

  // Contract: variant="surface" | "glass" | "sunken"
  assert.match(css, /\.surface\s*\{/, 'CSS must implement .surface variant')
  assert.match(css, /\.glass\s*\{/, 'CSS must implement .glass variant')
  assert.match(css, /\.sunken\s*\{/, 'CSS must implement .sunken variant')

  // Glass specular highlight and backdrop blur
  assert.match(css, /backdrop-filter:\s*blur\(var\(--glass-blur/, 'Glass variant must use --glass-blur')
  assert.match(css, /saturate\(var\(--glass-sat/, 'Glass variant must use --glass-sat')
  assert.match(css, /inset\s+0\s+1px/, 'Glass variant must include specular highlight inset')

  // Contract: hoverable?: boolean
  assert.match(jsx, /hoverable/, 'Card must handle hoverable prop')
  assert.match(css, /\.hoverable:hover\s*\{/, 'CSS must implement hover elevation for hoverable')

  // Contract: padding="sm" | "md" | "lg"
  assert.match(css, /\.pad-sm\s*\{/, 'CSS must support sm padding')
  assert.match(css, /\.pad-md\s*\{/, 'CSS must support md padding')
  assert.match(css, /\.pad-lg\s*\{/, 'CSS must support lg padding')
})

test('UI Primitives: Input adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Input.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Input.module.css'), 'utf-8')

  // Contract: size="sm" | "md", error?: string, prefix?: ReactNode, suffix?: ReactNode
  assert.match(jsx, /prefix/, 'Input must support prefix slot')
  assert.match(jsx, /suffix/, 'Input must support suffix slot')
  assert.match(jsx, /error/, 'Input must handle error prop')
  assert.match(jsx, /aria-invalid/, 'Input must set aria-invalid on error')

  // Focus glow ring & error ring
  assert.match(css, /\.wrapper:focus-within\s*\{[^}]*--accent-glow/, 'Input must have --accent-glow on focus')
  assert.match(css, /\.hasError[^{]*\{[^}]*--danger/, 'Input error state must use --danger')
  assert.match(css, /\.errorMessage\s*\{/, 'Input must style error message text')
})

test('UI Primitives: SegmentedControl adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'SegmentedControl.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'SegmentedControl.module.css'), 'utf-8')

  // Contract: options: Array<{ value: string, label: string }>, value: string, onChange: (val) => void
  assert.match(jsx, /role="radiogroup"/, 'SegmentedControl must declare role="radiogroup"')
  assert.match(jsx, /role="radio"/, 'Segmented options must declare role="radio"')
  assert.match(jsx, /aria-checked=\{isSelected\}/, 'Segmented options must reflect aria-checked')
  assert.match(jsx, /getBoundingClientRect/, 'Segmented thumb position must be measured via getBoundingClientRect')

  // Keyboard navigation
  assert.match(jsx, /ArrowRight/, 'SegmentedControl must support keyboard arrow navigation')
  assert.match(jsx, /ArrowLeft/, 'SegmentedControl must support keyboard arrow navigation')

  // Sliding pill thumb
  assert.match(css, /\.thumb\s*\{/, 'CSS must style the sliding indicator thumb')
  assert.match(css, /--ease-spring/, 'Thumb must transition with --ease-spring')
})

test('UI Primitives: Switch adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Switch.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Switch.module.css'), 'utf-8')

  // Contract: checked: boolean, onChange: (checked: boolean) => void, size?: "sm" | "md"
  assert.match(jsx, /role="switch"/, 'Switch must declare role="switch"')
  assert.match(jsx, /aria-checked=\{checked\}/, 'Switch must declare aria-checked')
  assert.match(css, /\.checked\s*\{[^}]*--accent/, 'Checked switch must adopt --accent')
  assert.match(css, /\.thumb\s*\{/, 'CSS must style circular thumb')
  assert.match(css, /--ease-spring/, 'Thumb must animate with --ease-spring')
})

test('UI Primitives: Badge adheres to PROJECT.md Contract 2', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Badge.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Badge.module.css'), 'utf-8')

  // Contract: variant="neutral" | "accent" | "success" | "warning" | "danger"
  assert.match(css, /\.neutral\s*\{/, 'CSS must support neutral badge')
  assert.match(css, /\.accent\s*\{/, 'CSS must support accent badge')
  assert.match(css, /\.success\s*\{/, 'CSS must support success badge')
  assert.match(css, /\.warning\s*\{/, 'CSS must support warning badge')
  assert.match(css, /\.danger\s*\{/, 'CSS must support danger badge')
  assert.match(jsx, /dot/, 'Badge must support optional dot status indicator')
})

test('UI Primitives: Modal satisfies dialog accessibility and backdrop blur', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Modal.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Modal.module.css'), 'utf-8')

  assert.match(jsx, /createPortal/, 'Modal must render via React createPortal')
  assert.match(jsx, /role="dialog"/, 'Modal must declare role="dialog"')
  assert.match(jsx, /aria-modal="true"/, 'Modal must declare aria-modal="true"')
  assert.match(jsx, /Escape/, 'Modal must handle Escape key')
  assert.match(jsx, /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/, 'Modal must lock body scroll')

  // Frosted glass & backdrop blur
  assert.match(css, /\.overlay\s*\{[^}]*backdrop-filter:\s*blur/, 'Overlay must apply backdrop blur')
  assert.match(css, /\.dialog\s*\{[^}]*backdrop-filter:\s*blur/, 'Dialog card must apply backdrop blur')
})

test('UI Primitives: Tabs supports pill and underline modes', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Tabs.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Tabs.module.css'), 'utf-8')

  assert.match(jsx, /role="tablist"/, 'Tabs must declare role="tablist"')
  assert.match(jsx, /role="tab"/, 'Tabs must declare role="tab"')
  assert.match(jsx, /variant\s*===\s*['"]pill['"]/, 'Tabs must support pill mode')
  assert.match(css, /\.pill\s*\{/, 'CSS must support .pill variant')
  assert.match(css, /\.underline\s*\{/, 'CSS must support .underline variant')
  assert.match(css, /--ease-spring/, 'Pill thumb must transition with --ease-spring')
})

test('UI Primitives: Select adheres to Apple input styling', () => {
  const jsx = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Select.jsx'), 'utf-8')
  const css = fs.readFileSync(path.join(PRIMITIVES_DIR, 'Select.module.css'), 'utf-8')

  assert.match(jsx, /<select/, 'Select must render native select')
  assert.match(jsx, /error/, 'Select must support error prop')
  assert.match(css, /\.wrapper:focus-within\s*\{[^}]*--accent-glow/, 'Select must glow on focus')
  assert.match(css, /\.chevron\s*\{/, 'Select must have custom chevron')
})

test('UI Primitives: index.js re-exports all primitives', () => {
  const indexJs = fs.readFileSync(path.join(PRIMITIVES_DIR, 'index.js'), 'utf-8')
  const expectedExports = [
    'Button',
    'Card',
    'Input',
    'SegmentedControl',
    'Switch',
    'Badge',
    'Modal',
    'Tabs',
    'Select',
    'PageBar',
  ]
  for (const exp of expectedExports) {
    assert.ok(indexJs.includes(exp), `index.js must export ${exp}`)
  }
})
