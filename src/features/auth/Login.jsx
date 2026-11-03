import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { getErrorMessage } from '../../api/client'
import LazyThreeBackground from '../../components/ThreeBackground/LazyThreeBackground'
import { useIsMobileLayout } from '../../hooks/useMediaQuery'
import styles from './Login.module.css'

const DEMO_EMAIL = 'demo@edgewise.ai'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState('Demo1234!')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isMobileLayout = useIsMobileLayout()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!password.trim() || password.length < 8) {
      setError('请输入至少 8 位密码')
      return
    }
    if (mode === 'register' && !name.trim()) {
      setError('请输入昵称')
      return
    }

    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(email.trim(), password, name.trim())
      } else {
        await login(email.trim(), password)
      }
      const redirect = searchParams.get('redirect')
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        navigate(redirect, { replace: true })
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getErrorMessage(err, mode === 'register' ? '注册失败' : '登录失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      {!isMobileLayout && <LazyThreeBackground mode="active" opacity={0.25} />}

      <div className={`${styles['tech-label']} ${styles['label-tl']}`}>SYS.CORE // ON-LINE</div>
      <div className={`${styles['tech-label']} ${styles['label-bl']}`}>UPLINK_ESTABLISHED_</div>
      <div className={styles['version-tag']}>V03.01</div>

      <div className={styles.grid}>
        <div className={styles['left-col']} />

        <div className={styles['right-col']}>
          <div className={styles.panel}>
            <div className={styles['header-group']}>
              <span className={styles.badge}>EDGEWISE.AUTH</span>
              <h1>{mode === 'login' ? 'Authenticate' : 'Register'}</h1>
              <p className={styles.subtitle}>
                {mode === 'login'
                  ? '安全凭证访问 · 谈锋 AI 面试助手'
                  : '创建账号 · 首个用户自动成为管理员'}
              </p>
            </div>

            <div className={styles['sso-grid']}>
              <button type="button" className={styles['btn-sso']} disabled title="MVP 未开通">
                微信
              </button>
              <button type="button" className={styles['btn-sso']} disabled title="MVP 未开通">
                Google
              </button>
              <button type="button" className={styles['btn-sso']} disabled title="MVP 未开通">
                GitHub
              </button>
            </div>

            <div className={styles.divider}>STANDARD PROTOCOL</div>

            <form className={styles['form-group']} onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div className={styles['input-wrap']}>
                  <label>DISPLAY NAME</label>
                  <input
                    type="text"
                    placeholder="你的昵称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="nickname"
                  />
                </div>
              )}
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
                  placeholder="至少 8 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
              {error && <div className={styles['form-error']}>{error}</div>}
              <button type="submit" className={styles['btn-primary']} disabled={loading}>
                {loading
                  ? 'CONNECTING...'
                  : mode === 'login'
                    ? <>INITIALIZE UPLINK <span className={styles['btn-arrow']}>&rarr;</span></>
                    : <>CREATE ACCOUNT <span className={styles['btn-arrow']}>&rarr;</span></>}
              </button>
            </form>

            <button
              type="button"
              className={styles.divider}
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', width: '100%' }}
              onClick={() => {
                const nextMode = mode === 'login' ? 'register' : 'login'
                setMode(nextMode)
                setError('')
                if (nextMode === 'register' && email === DEMO_EMAIL) {
                  setEmail('')
                  setPassword('')
                }
              }}
            >
              {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
