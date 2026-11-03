import { NavLink } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { mobileMoreLinks } from './navConfig'
import styles from './MobileMoreLinks.module.css'

export default function MobileMoreLinks() {
  const user = useAuthStore((s) => s.user)
  const links = mobileMoreLinks.filter((item) => !item.adminOnly || user?.isAdmin)

  return (
    <section className={styles.section} aria-label="更多功能">
      <h2 className={styles.title}>更多功能</h2>
      <div className={styles.grid}>
        {links.map((item) => (
          <NavLink key={item.to} to={item.to} className={styles.link}>
            <img src={item.icon} className={styles.icon} alt="" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </section>
  )
}
