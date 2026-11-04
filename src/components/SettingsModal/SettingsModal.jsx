import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
import useSettingsStore from '../../stores/settingsStore'
import ResearchConsentModal from '../ResearchConsentModal/ResearchConsentModal'
import { formatAvgScore, rankFromAvgScore } from '../../utils/userStats'
import useTTS, { listZhVoices } from '../../hooks/useTTS'
import { getArmForcedTtsEnabled, TTS_FORCED_BY_ARM } from '../../config/tts'
import { trackResearchEvent } from '../../research/track'
import { PRESENCE_CONSENT_MODEL_MB } from '../../features/interview/presenceMetrics'
import SnapSlider from '../ui/SnapSlider'
import styles from './SettingsModal.module.css'

const TABS = [
  { id: 'general', icon: '⚙', label: '常规' },
  { id: 'voice', icon: '🔊', label: '语音朗读' },
  { id: 'a11y', icon: '♿', label: '无障碍' },
  { id: 'account', icon: '◎', label: '账户' },
  { id: 'subscription', icon: '◇', label: '订阅' },
  { id: 'preference', icon: '◈', label: '偏好设置' },
  { id: 'data', icon: '▣', label: '数据管理' },
]

export default function SettingsModal({ onClose }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const stats = useSessionStore((s) => s.stats)
  const rank = rankFromAvgScore(stats.avgScore || 0)
  const [activeTab, setActiveTab] = useState('general')
  const [consentWithdraw, setConsentWithdraw] = useState(false)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const aiCopilotEnabled = useSettingsStore((s) => s.aiCopilotEnabled)
  const setAiCopilotEnabled = useSettingsStore((s) => s.setAiCopilotEnabled)
  const soundEffectEnabled = useSettingsStore((s) => s.soundEffectEnabled)
  const setSoundEffectEnabled = useSettingsStore((s) => s.setSoundEffectEnabled)
  const practiceReminderEnabled = useSettingsStore((s) => s.practiceReminderEnabled)
  const setPracticeReminderEnabled = useSettingsStore((s) => s.setPracticeReminderEnabled)
  const emailNotifyEnabled = useSettingsStore((s) => s.emailNotifyEnabled)
  const setEmailNotifyEnabled = useSettingsStore((s) => s.setEmailNotifyEnabled)
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled)
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI)
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled)
  const setTtsRate = useSettingsStore((s) => s.setTtsRate)
  const setTtsVoiceURI = useSettingsStore((s) => s.setTtsVoiceURI)
  const deliveryLiveHintEnabled = useSettingsStore((s) => s.deliveryLiveHintEnabled)
  const setDeliveryLiveHintEnabled = useSettingsStore((s) => s.setDeliveryLiveHintEnabled)
  const presenceAnalysisEnabled = useSettingsStore((s) => s.presenceAnalysisEnabled)
  const setPresenceAnalysisEnabled = useSettingsStore((s) => s.setPresenceAnalysisEnabled)
  const storySidePeekEnabled = useSettingsStore((s) => s.storySidePeekEnabled)
  const setStorySidePeekEnabled = useSettingsStore((s) => s.setStorySidePeekEnabled)
  const captionsEnabled = useSettingsStore((s) => s.captionsEnabled)
  const reduceMotionEnabled = useSettingsStore((s) => s.reduceMotionEnabled)
  const largeFontEnabled = useSettingsStore((s) => s.largeFontEnabled)
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled)
  const setCaptionsEnabled = useSettingsStore((s) => s.setCaptionsEnabled)
  const setReduceMotionEnabled = useSettingsStore((s) => s.setReduceMotionEnabled)
  const setLargeFontEnabled = useSettingsStore((s) => s.setLargeFontEnabled)
  const setKeyboardShortcutsEnabled = useSettingsStore((s) => s.setKeyboardShortcutsEnabled)
  const experimentAssignment = useAuthStore((s) => s.user?.experimentAssignment)
  const armForcedTts = getArmForcedTtsEnabled(experimentAssignment)
  const ttsExperimentLocked = TTS_FORCED_BY_ARM && armForcedTts !== null
  const { speak, supported: ttsSupported } = useTTS()
  const [zhVoices, setZhVoices] = useState(() => listZhVoices())

  useEffect(() => {
    if (!ttsSupported) {
      trackResearchEvent('tts.unsupported')
      return undefined
    }
    const refresh = () => setZhVoices(listZhVoices())
    refresh()
    window.speechSynthesis?.addEventListener('voiceschanged', refresh)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refresh)
  }, [ttsSupported])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleTtsToggle = useCallback(() => {
    if (ttsExperimentLocked) return
    const next = !ttsEnabled
    setTtsEnabled(next)
    trackResearchEvent('tts.toggle', { enabled: next })
  }, [ttsEnabled, setTtsEnabled, ttsExperimentLocked])

  const handleTtsPreview = useCallback(() => {
    speak('你好，这是 Edgewise 语音朗读试听。', {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      pitch: 1,
    })
  }, [speak, ttsRate, ttsVoiceURI])

  return createPortal(
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="设置">
        {/* Left sidebar */}
        <div className={styles.sidebar}>
          <button className={styles['close-btn']} onClick={onClose} aria-label="关闭">
            ✕
          </button>
          <nav className={styles.nav} aria-label="设置分类导航">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`${styles['nav-item']} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles['nav-icon']}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className={styles.content}>
          {/* ===== 常规 ===== */}
          {activeTab === 'general' && (
            <div className={styles.panel}>
              <h2>常规</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>外观</div>
                    <div className={styles['setting-desc']}>切换暗夜模式与赛博像素白色装束（白天效果）</div>
                  </div>
                  <select
                    className={styles['setting-select']}
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    aria-label="外观主题"
                  >
                    <option value="dark">深色（暗夜流光）</option>
                    <option value="light">浅色（赛博白昼）</option>
                    <option value="system">跟随系统</option>
                  </select>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>语音 / 语言</div>
                    <div className={styles['setting-desc']}>界面与语音识别默认语种</div>
                  </div>
                  <select
                    className={styles['setting-select']}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="界面与语音语言"
                  >
                    <option value="zh-CN">中文 (简体)</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>AI Copilot 助手</div>
                    <div className={styles['setting-desc']}>在页面右下角显示全屏边缘灯光引导助手</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${aiCopilotEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setAiCopilotEnabled(!aiCopilotEnabled)}
                    role="switch"
                    aria-checked={aiCopilotEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>音效</div>
                    <div className={styles['setting-desc']}>面试和群面中的提示音</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${soundEffectEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setSoundEffectEnabled(!soundEffectEnabled)}
                    role="switch"
                    aria-checked={soundEffectEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>镜头仪态分析</div>
                    <div className={styles['setting-desc']}>
                      仅在浏览器本地分析摄像头画面（约 2 次/秒），不上传录像；首次启用需下载 MediaPipe 模型（约
                      {PRESENCE_CONSENT_MODEL_MB} MB）。失败或性能不足时自动跳过或降级为简化版。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${presenceAnalysisEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => {
                      const next = !presenceAnalysisEnabled
                      setPresenceAnalysisEnabled(next)
                      if (next) {
                        trackResearchEvent('presence.enabled', { source: 'settings' })
                      }
                    }}
                    role="switch"
                    aria-checked={presenceAnalysisEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>面试间故事侧栏</div>
                    <div className={styles['setting-desc']}>
                      1v1 行为面练习时可展开 STAR 故事库侧栏；单向模式与实验指定任务中不可用
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${storySidePeekEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setStorySidePeekEnabled(!storySidePeekEnabled)}
                    role="switch"
                    aria-checked={storySidePeekEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 语音朗读 ===== */}
          {activeTab === 'voice' && (
            <div className={styles.panel}>
              <h2>语音朗读</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>启用语音朗读</div>
                    <div className={styles['setting-desc']}>
                      {ttsExperimentLocked
                        ? '实验期间统一设置'
                        : '面试与群面中朗读题目与 AI 发言'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${(armForcedTts ?? ttsEnabled) ? styles['toggle-on'] : ''}`}
                    onClick={handleTtsToggle}
                    disabled={ttsExperimentLocked}
                    role="switch"
                    aria-checked={armForcedTts ?? ttsEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>语速</div>
                    <div className={styles['setting-desc']}>{ttsRate.toFixed(2)}×</div>
                  </div>
                  <div className={styles['setting-range']}>
                    <SnapSlider
                      stops={[0.8, 0.9, 1.0, 1.2, 1.4]}
                      value={ttsRate}
                      onChange={setTtsRate}
                      formatStopLabel={(v) => `${v}×`}
                      ariaLabel="语音语速"
                    />
                  </div>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>音色</div>
                    <div className={styles['setting-desc']}>选择中文合成音色</div>
                  </div>
                  <select
                    className={styles['setting-select']}
                    value={ttsVoiceURI || ''}
                    onChange={(e) => setTtsVoiceURI(e.target.value || null)}
                    aria-label="中文语音"
                  >
                    <option value="">自动（推荐中文）</option>
                    {zhVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>语音试听</div>
                    <div className={styles['setting-desc']}>播放示例语音确认音量与语速</div>
                  </div>
                  <button type="button" className={styles['setting-action']} onClick={handleTtsPreview}>
                    试听
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>实时语速提示</div>
                    <div className={styles['setting-desc']}>
                      语音作答时，连续 15 秒偏离 180–260 字/分会在麦克风旁提示（高压/单向模式自动关闭）
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${deliveryLiveHintEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setDeliveryLiveHintEnabled(!deliveryLiveHintEnabled)}
                    role="switch"
                    aria-checked={deliveryLiveHintEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 无障碍 ===== */}
          {activeTab === 'a11y' && (
            <div className={styles.panel}>
              <h2>无障碍</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>显示字幕</div>
                    <div className={styles['setting-desc']}>面试与群面中在语音下方显示题目字幕</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${captionsEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setCaptionsEnabled(!captionsEnabled)}
                    role="switch"
                    aria-checked={captionsEnabled}
                    aria-label="显示字幕"
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>减少动效</div>
                    <div className={styles['setting-desc']}>关闭波形与界面抖动（亦尊重系统「减少动态效果」）</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${reduceMotionEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setReduceMotionEnabled(!reduceMotionEnabled)}
                    role="switch"
                    aria-checked={reduceMotionEnabled}
                    aria-label="减少动效"
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>大号字体</div>
                    <div className={styles['setting-desc']}>全局字号约放大 15%</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${largeFontEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setLargeFontEnabled(!largeFontEnabled)}
                    role="switch"
                    aria-checked={largeFontEnabled}
                    aria-label="大号字体"
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>键盘快捷键</div>
                    <div className={styles['setting-desc']}>Space 开关麦克风 · Ctrl+Enter 发送</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${keyboardShortcutsEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
                    role="switch"
                    aria-checked={keyboardShortcutsEnabled}
                    aria-label="键盘快捷键"
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 账户 ===== */}
          {activeTab === 'account' && (
            <div className={styles.panel}>
              <h2>账户</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>用户名</div>
                  <div className={styles['setting-value']}>{user?.name || '元启用户'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>邮箱</div>
                  <div className={styles['setting-value']}>{user?.email || 'user@edgewise.ai'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>加入时间</div>
                  <div className={styles['setting-value']}>{user?.joinDate || '2026-01-15'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>修改密码</div>
                  <button className={styles['setting-action']}>更改</button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 订阅 ===== */}
          {activeTab === 'subscription' && (
            <div className={styles.panel}>
              <h2>订阅</h2>
              <div className={styles['sub-card']}>
                <div className={styles['sub-tier']}>{user?.tierLabel || '会员'}</div>
                <div className={styles['sub-info']}>
                  <div className={styles['sub-row']}>
                    <span>当前积分</span>
                    <span className={styles['sub-value']}>{stats.credits ?? user?.credits ?? 0}</span>
                  </div>
                  <div className={styles['sub-row']}>
                    <span>练习段位</span>
                    <span className={styles['sub-value']}>{rank.name}</span>
                  </div>
                  <div className={styles['sub-row']}>
                    <span>综合均分</span>
                    <span className={styles['sub-value']}>{formatAvgScore(stats.avgScore || 0)}</span>
                  </div>
                </div>
                <button className={styles['sub-btn']}>管理订阅</button>
              </div>
            </div>
          )}

          {/* ===== 偏好设置 ===== */}
          {activeTab === 'preference' && (
            <div className={styles.panel}>
              <h2>偏好设置</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>每日练习提醒</div>
                    <div className={styles['setting-desc']}>每天 20:00 推送练习提醒</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${practiceReminderEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setPracticeReminderEnabled(!practiceReminderEnabled)}
                    role="switch"
                    aria-checked={practiceReminderEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>邮件通知</div>
                    <div className={styles['setting-desc']}>接收复盘报告和系统通知</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${emailNotifyEnabled ? styles['toggle-on'] : ''}`}
                    onClick={() => setEmailNotifyEnabled(!emailNotifyEnabled)}
                    role="switch"
                    aria-checked={emailNotifyEnabled}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 数据管理 ===== */}
          {activeTab === 'data' && (
            <div className={styles.panel}>
              <h2>数据管理</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>导出练习数据</div>
                    <div className={styles['setting-desc']}>下载所有练习记录和复盘报告</div>
                  </div>
                  <button className={styles['setting-action']}>导出</button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>清除本地缓存</div>
                    <div className={styles['setting-desc']}>清除浏览器中保存的临时数据</div>
                  </div>
                  <button className={styles['setting-action']}>清除</button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>研究数据同意</div>
                    <div className={styles['setting-desc']}>
                      {user?.researchConsent?.accepted ? '已同意参与研究' : '未参与 / 已撤回'}
                    </div>
                  </div>
                  {user?.researchConsent?.accepted ? (
                    <button type="button" className={styles['setting-action']} onClick={() => setConsentWithdraw(true)}>
                      撤回
                    </button>
                  ) : null}
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>退出登录</div>
                    <div className={styles['setting-desc']}>退出后将清除本地登录态</div>
                  </div>
                  <button
                    type="button"
                    className={styles['setting-action']}
                    onClick={() => {
                      useAuthStore.getState().logout().finally(() => {
                        onClose()
                        navigate('/login')
                      })
                    }}
                  >
                    退出
                  </button>
                </div>
                <div className={`${styles['setting-row']} ${styles['setting-danger']}`}>
                  <div>
                    <div className={styles['setting-label']}>删除账户</div>
                    <div className={styles['setting-desc']}>永久删除账户和所有数据，不可恢复</div>
                  </div>
                  <button className={`${styles['setting-action']} ${styles['action-danger']}`}>删除</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {consentWithdraw && (
        <ResearchConsentModal
          mode="withdraw"
          onResolved={() => {
            setConsentWithdraw(false)
            useAuthStore.getState().fetchMe().catch(() => {})
          }}
        />
      )}
    </div>,
    document.body
  )
}
