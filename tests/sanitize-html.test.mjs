import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHtml } from '../src/utils/sanitizeHtml.js'

describe('HTML Sanitization (XSS Defense)', () => {
  it('strips malicious <script> tags and onload handlers', () => {
    const malicious = '<p>Hello</p><script>alert("xss")</script><img src="x" onerror="alert(1)" />'
    const clean = sanitizeHtml(malicious)
    assert.doesNotMatch(clean, /<script/i)
    assert.doesNotMatch(clean, /onerror/i)
    assert.match(clean, /<p>Hello<\/p>/)
  })

  it('preserves legitimate SVG structure and attributes for figural assessment', () => {
    const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red" stroke="black" /></svg>'
    const clean = sanitizeHtml(svg)
    assert.match(clean, /<svg/i)
    assert.match(clean, /<circle/i)
    assert.match(clean, /cx="50"/)
  })

  it('handles empty, null, or non-string inputs safely', () => {
    assert.equal(sanitizeHtml(''), '')
    assert.equal(sanitizeHtml(null), '')
    assert.equal(sanitizeHtml(undefined), '')
    assert.equal(sanitizeHtml(123), '')
  })
})
