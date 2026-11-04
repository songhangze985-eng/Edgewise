import DOMPurify from 'dompurify'

/**
 * Fallback sanitizer for environments without a DOM (Node.js / SSR)
 */
function sanitizeFallback(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/(?:href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, '')
}

/**
 * Sanitize HTML/SVG strings before injecting into the DOM via dangerouslySetInnerHTML.
 * Defends against Cross-Site Scripting (XSS) even if data sources accept user-supplied content.
 *
 * @param {string} dirtyHtml
 * @param {object} [options]
 * @returns {string} Clean, safe HTML string
 */
export function sanitizeHtml(dirtyHtml, options = {}) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return ''

  if (typeof window !== 'undefined') {
    const purifier = typeof DOMPurify.sanitize === 'function' ? DOMPurify : (typeof DOMPurify === 'function' ? DOMPurify(window) : null)
    if (purifier && typeof purifier.sanitize === 'function') {
      return purifier.sanitize(dirtyHtml, {
        USE_PROFILES: { html: true, svg: true },
        ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'g', 'defs', 'clipPath'],
        ADD_ATTR: ['d', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height'],
        ...options
      })
    }
  }

  return sanitizeFallback(dirtyHtml)
}

export default sanitizeHtml
