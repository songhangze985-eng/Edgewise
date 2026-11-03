import { createPortal } from 'react-dom'
import styles from './KeyboardShortcutsHelp.module.css'

const ROWS = [
  { keys: 'Space', desc: '开关麦克风（语音输入）' },
  { keys: 'Shift + Space', desc: '在输入框中输入空格' },
  { keys: 'Ctrl + Enter', desc: '发送回答 / 发言' },
  { keys: 'Tab', desc: '在按钮与输入框间切换焦点' },
]

export default function KeyboardShortcutsHelp({ open, onClose }) {
  if (!open) return null

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="键盘快捷键说明">
        <div className={styles.head}>
          <h2 className={styles.title}>键盘快捷键</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <p className={styles.note}>可在设置 → 无障碍中关闭快捷键，避免与系统或输入法冲突。</p>
        <ul className={styles.list}>
          {ROWS.map((row) => (
            <li key={row.keys} className={styles.row}>
              <kbd className={styles.kbd}>{row.keys}</kbd>
              <span>{row.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
