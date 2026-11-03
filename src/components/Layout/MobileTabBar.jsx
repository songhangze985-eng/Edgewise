import { NavLink, useLocation } from 'react-router-dom'
import { mobileTabItems, isMobileTabActive } from './navConfig'
import styles from './MobileTabBar.module.css'

export default function MobileTabBar() {
  const { pathname } = useLocation()

  return (
    <nav className={styles.tabbar} aria-label="主导航">
      {mobileTabItems.map((item) => {
        const active = isMobileTabActive(item.id, pathname)
        return (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end}
            className={`${styles.tab} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <img src={item.icon} className={styles.icon} alt="" aria-hidden="true" />
            <span className={styles.label}>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
