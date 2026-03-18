import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ThreeBackground from '../ThreeBackground/ThreeBackground'
import AICopilot from '../AICopilot/AICopilot'
import styles from './Layout.module.css'

export default function Layout() {
  return (
    <div className={styles.layout}>
      <ThreeBackground />
      <Sidebar />
      <main className={styles['main-content']}>
        <div className={styles['content-area']}>
          <Outlet />
        </div>
      </main>
      <AICopilot />
    </div>
  )
}
