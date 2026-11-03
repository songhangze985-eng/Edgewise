import { useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import styles from './PromoLanding.module.css'
import heroBg from '../../assets/promo/hero-bg.png'
import iconLgd from '../../assets/icons/feature-lgd.svg'
import iconInterview from '../../assets/icons/feature-interview.svg'
import iconResume from '../../assets/icons/feature-resume.svg'
import iconAnalytics from '../../assets/icons/feature-analytics.svg'

const features = [
  { icon: iconLgd, title: 'LGD 群面模拟', desc: '7 AI + 1 真人圆桌讨论，市面唯一的群面模拟产品', tag: 'EXCLUSIVE' },
  { icon: iconInterview, title: '1v1 模拟面试', desc: '结构化·半结构化·行为面试，高压追问·动态题库', tag: 'CORE' },
  { icon: iconResume, title: '简历 AI 优化', desc: 'STAR 法则重构，JD 精准匹配，一键生成高分简历', tag: 'AI' },
  { icon: iconAnalytics, title: '深度复盘中心', desc: '双轨评估 + 逐字稿批改 + 满分话术重构', tag: 'ANALYTICS' },
]

const lgdRoles = [
  { id: 'YOU', label: '你', role: '真人用户', icon: '👤', isHuman: true },
  { id: 'AI-1', label: 'AI', role: '破冰者', icon: '⬡', isHuman: false },
  { id: 'AI-2', label: 'AI', role: '点子王', icon: '◈', isHuman: false },
  { id: 'AI-3', label: 'AI', role: '杠精', icon: '▲', isHuman: false },
  { id: 'AI-4', label: 'AI', role: '逻辑王', icon: '◇', isHuman: false },
  { id: 'AI-5', label: 'AI', role: '和事佬', icon: '○', isHuman: false },
  { id: 'AI-6', label: 'AI', role: '计时员', icon: '⏱', isHuman: false },
  { id: 'AI-7', label: 'AI', role: '观察者', icon: '◉', isHuman: false },
]

export default function PromoLanding() {
  const heroRef = useRef(null)
  const sectionsRef = useRef([])

  const addSection = useCallback((el) => {
    if (el && !sectionsRef.current.includes(el)) sectionsRef.current.push(el)
  }, [])

  useEffect(() => {
    const vh = window.innerHeight
    let ticking = false

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const sy = window.scrollY

        // Hero: scale up + fade out (like 283_XXX mv__main)
        if (heroRef.current) {
          const scale = 1 + sy * 0.0005
          const opacity = Math.max(0, 1 - sy / (vh * 0.7))
          heroRef.current.style.transform = `scale(${Math.min(scale, 1.4)})`
          heroRef.current.style.opacity = opacity
        }

        // Sections: scale from 0.88→1.0 as they enter viewport
        sectionsRef.current.forEach((sec) => {
          const rect = sec.getBoundingClientRect()
          const enter = (vh - rect.top) / vh // 0 when at bottom edge, 1 when at top
          const t = Math.max(0, Math.min(1, enter * 1.5)) // faster ramp
          const scale = 0.88 + t * 0.12
          const y = (1 - t) * 80
          const op = 0.15 + t * 0.85
          sec.style.transform = `translate3d(0,${y}px,0) scale(${scale})`
          sec.style.opacity = op
        })

        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={styles.page}>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <img src={heroBg} className={styles['hero-bg']} alt="" aria-hidden="true" />
        {/* Side decorations like 283_XXX */}
        <div className={styles['deco-left']} aria-hidden="true">
          <span>2</span><span>0</span><span>2</span><span>6</span>
        </div>
        <div className={styles['deco-right']} aria-hidden="true">
          <div className={styles['pixel-grid']} />
        </div>

        <div className={styles['hero-inner']} ref={heroRef}>
          <div className={styles['hero-rings']} aria-hidden="true">
            <div className={styles.ring} />
            <div className={`${styles.ring} ${styles['ring-2']}`} />
          </div>
          <div className={styles['hero-badge']}>元启智能 · YUANQI INTELLIGENCE</div>
          <h1 className={styles['hero-title']}>EDGEWISE</h1>
          <h2 className={styles['hero-sub']}>谈锋 · AI 面试助手</h2>
          <p className={styles['hero-tagline']}>原初之心，启智于行</p>
          <p className={styles['hero-tagline-en']}>Empowering your career edge</p>
          <Link to="/login" className={styles['hero-cta']}>开始训练 →</Link>
        </div>

        <div className={styles['scroll-hint']}>
          <div className={styles['scroll-bar']} />
          <span>SCROLL</span>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className={styles.section} ref={addSection}>
        <div className={styles['section-deco']} aria-hidden="true">FEAT-01</div>
        <div className={styles['section-head']}>
          <span className={styles['tag-line']}>CORE FEATURES</span>
          <h2>四大核心能力</h2>
        </div>
        <div className={styles['feat-grid']}>
          {features.map((f) => (
            <div key={f.title} className={styles['feat-card']}>
              <div className={styles['feat-top']}>
                <img src={f.icon} className={styles['feat-icon-svg']} alt="" aria-hidden="true" />
                <span className={styles['feat-tag']}>{f.tag}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className={styles['feat-line']} />
            </div>
          ))}
        </div>
      </section>

      {/* Decorative tech band */}
      <div className={styles['tech-band']} aria-hidden="true">
        <span>ALEV-1 &gt;&gt;</span>
        <div className={styles['band-line']} />
        <span>NODE.ACTIVE</span>
        <div className={styles['band-line']} />
        <span>&lt;&lt; SYS.OK</span>
      </div>

      {/* ===== LGD: THE KILLER FEATURE ===== */}
      <section className={`${styles.section} ${styles['lgd-section']}`} ref={addSection}>
        <div className={styles['section-deco']} aria-hidden="true">LGD-01</div>

        {/* Left: text */}
        <div className={styles['lgd-layout']}>
          <div className={styles['lgd-text']}>
            <span className={styles['tag-line']}>THE ONLY ONE · 独家功能</span>
            <h2 className={styles['lgd-title']}>无领导小组讨论<br /><span>LGD 群面模拟</span></h2>
            <div className={styles['accent-bar']} aria-hidden="true" />
            <p className={styles['lgd-desc']}>
              市面唯一能模拟 LGD 群面的产品。
              7 个差异化 AI 智能体与 1 个真人用户，
              进行逻辑自洽的圆桌讨论。
            </p>
            <div className={styles['lgd-flow']}>
              <span>独立阅读</span>
              <span className={styles.arrow}>→</span>
              <span>轮流发言</span>
              <span className={styles.arrow}>→</span>
              <span>自由讨论</span>
              <span className={styles.arrow}>→</span>
              <span>投票总结</span>
            </div>
          </div>

          {/* Right: role cards grid */}
          <div className={styles['lgd-grid']}>
            {lgdRoles.map((r) => (
              <div key={r.id} className={`${styles['role-card']} ${r.isHuman ? styles['role-human'] : ''}`}>
                <div className={styles['role-icon']} aria-hidden="true">{r.icon}</div>
                <div className={styles['role-type']}>{r.role}</div>
                <div className={styles['role-id']}>{r.id}</div>
                {r.isHuman && <div className={styles['role-badge']}>PLAYER</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className={`${styles.section} ${styles['stats-section']}`} ref={addSection}>
        <div className={styles['section-deco']} aria-hidden="true">DATA-01</div>
        <div className={styles['stats-row']}>
          {[
            { v: '1000+', l: '精选题库' },
            { v: '82%', l: '平均提升' },
            { v: '5', l: '评估维度' },
            { v: '7', l: 'AI 角色' },
          ].map((s) => (
            <div key={s.l} className={styles['stat-cell']}>
              <div className={styles['stat-val']}>{s.v}</div>
              <div className={styles['stat-lbl']}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className={`${styles.section} ${styles['cta-section']}`} ref={addSection}>
        <h2 className={styles['cta-title']}>准备好了吗？</h2>
        <Link to="/tasks" className={styles['cta-big']}>按困难选准备任务</Link>
        <Link to="/login" className={styles['hero-cta']} style={{ marginTop: '1rem', display: 'inline-block' }}>
          直接登录体验
        </Link>
        <p className={styles['cta-note']}>任务页说明可检索 · 不承诺录用结果</p>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className={styles.footer}>
        <span>© 2026 元启智能 (Yuanqi Intelligence)</span>
        <span className={styles['footer-brand']}>KLEIN BLUE SYSTEM</span>
      </footer>
    </div>
  )
}
