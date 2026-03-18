import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import ThreeBackground from '../../components/ThreeBackground/ThreeBackground'
import styles from './Login.module.css'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('请输入邮箱'); return }
    if (!password.trim() || password.length < 4) { setError('请输入至少 4 位密码'); return }
    setError('')
    login(email.trim())
    navigate('/')
  }

  const handleSocialLogin = (provider) => {
    login(`${provider}@edgewise.ai`, `${provider} 用户`)
    navigate('/')
  }

  return (
    <div className={styles.page}>
      <ThreeBackground />

      {/* Tech labels */}
      <div className={`${styles['tech-label']} ${styles['label-tl']}`}>SYS.CORE // ON-LINE</div>
      <div className={`${styles['tech-label']} ${styles['label-bl']}`}>UPLINK_ESTABLISHED_</div>
      <div className={styles['version-tag']}>V03.01</div>

      {/* Two-column grid */}
      <div className={styles.grid}>
        {/* Left: empty, shows shader */}
        <div className={styles['left-col']} />

        {/* Right: auth panel */}
        <div className={styles['right-col']}>
          <div className={styles.panel}>
            {/* Header */}
            <div className={styles['header-group']}>
              <span className={styles.badge}>EDGEWISE.AUTH</span>
              <h1>Authenticate</h1>
              <p className={styles.subtitle}>安全凭证访问 · 谈锋 AI 面试助手</p>
            </div>

            {/* SSO buttons */}
            <div className={styles['sso-grid']}>
              <button type="button" className={styles['btn-sso']} onClick={() => handleSocialLogin('微信')} aria-label="微信登录">
                微信
              </button>
              <button type="button" className={styles['btn-sso']} onClick={() => handleSocialLogin('Google')} aria-label="Google 登录">
                Google
              </button>
              <button type="button" className={styles['btn-sso']} onClick={() => handleSocialLogin('GitHub')} aria-label="GitHub 登录">
                GitHub
              </button>
            </div>

            {/* Divider */}
            <div className={styles.divider}>STANDARD PROTOCOL</div>

            {/* Form */}
            <form className={styles['form-group']} onSubmit={handleSubmit}>
              <div className={styles['input-wrap']}>
                <label>IDENTIFIER</label>
                <input
                  type="email"
                  placeholder="user@domain.net"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className={styles['input-wrap']}>
                <label>PASSCODE</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error && <div className={styles['form-error']}>{error}</div>}
              <button type="submit" className={styles['btn-primary']}>
                INITIALIZE UPLINK <span className={styles['btn-arrow']}>&rarr;</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
