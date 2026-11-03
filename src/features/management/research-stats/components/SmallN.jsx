export default function SmallN({ value, fallback = '—' }) {
  if (value === '<5') {
    return <span title="人数少于 5">&lt;5</span>
  }
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  return value
}
