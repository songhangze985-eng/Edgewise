import { useState } from 'react'
import { postResearchAdminExport } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import { showToast } from '../../../../stores/toastStore'
import styles from '../ResearchStats.module.css'

export default function ExportDialog({ open, onClose, filters }) {
  const [format, setFormat] = useState('wide_csv')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleExport = async () => {
    if (!window.confirm('确认导出？操作将写入审计日志。')) return
    setLoading(true)
    try {
      const blob = await postResearchAdminExport(format, filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `research-${format}.${format.includes('json') ? 'json' : 'csv'}`
      a.click()
      URL.revokeObjectURL(url)
      showToast('导出已开始下载', 'success')
      onClose()
    } catch (err) {
      showToast(getErrorMessage(err, '导出失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={`hw-panel ${styles.modal}`}>
        <h3>导出研究数据</h3>
        <p className={styles.cardSub}>使用当前筛选条件；宽表仅含 user_hash。</p>
        <label className={styles.filterField}>
          格式
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="wide_csv">宽表 CSV</option>
            <option value="long_csv">长表 CSV（事件流）</option>
            <option value="codebook_json">Codebook JSON</option>
          </select>
        </label>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            取消
          </button>
          <button type="button" className={styles.btnPrimary} disabled={loading} onClick={handleExport}>
            {loading ? '导出中…' : '确认导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
