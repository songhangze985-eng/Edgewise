import { useEffect, useState } from 'react'
import styles from './OfflineNotice.module.css'

export default function OfflineNotice() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false)

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className={styles.overlay} role="alertdialog" aria-labelledby="offline-title">
      <div className={styles.card}>
        <h2 id="offline-title" className={styles.title}>
          需要联网才能练习
        </h2>
        <p className={styles.desc}>
          当前处于离线状态。请连接网络后再开始模拟面试或提交作答；浏览已打开页面不受影响。
        </p>
      </div>
    </div>
  )
}
