import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBar from '../../components/ui/PageBar'
import styles from './CreativeStudio.module.css'

const INTERVIEW_STYLES = [
  { id: 'structured', name: '结构化面试' },
  { id: 'behavioral', name: '行为面试' },
  { id: 'pressure', name: '压力面试' },
]

const PRESET_SCENES = [
  { id: 'office', name: '标准会议室', desc: '传统面试环境', emoji: '\u{1F3E2}' },
  { id: 'future', name: '未来感办公室', desc: '科技公司风格', emoji: '\u{1F680}' },
  { id: 'casual', name: '咖啡厅面试', desc: '轻松休闲风格', emoji: '\u2615' },
  { id: 'pressure', name: '高管董事会', desc: '极致高压环境', emoji: '\u{1F454}' },
]

const DEFAULT_EVENTS = [
  { id: 'lag', name: '网络卡顿', desc: '模拟网络延迟，要求重复回答', enabled: false },
  { id: 'phone', name: '考官接电话', desc: '面试官突然接电话离开', enabled: false },
  { id: 'jargon', name: '专业名词刁难', desc: '抛出冷门专业术语考验', enabled: true },
  { id: 'timeout', name: '时间压缩', desc: '突然缩短回答时间', enabled: false },
  { id: 'group', name: '临时加入候选人', desc: '面试中途加入竞争者', enabled: false },
  { id: 'switch', name: '考官更换', desc: '中途换一位更严厉的考官', enabled: false },
]

export default function CreativeStudio() {
  const [strictness, setStrictness] = useState(3)
  const [speed, setSpeed] = useState(3)
  const [interviewStyle, setInterviewStyle] = useState('structured')
  const [customPrompt, setCustomPrompt] = useState('')

  const [selectedScene, setSelectedScene] = useState('office')
  const [customSceneDesc, setCustomSceneDesc] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const [events, setEvents] = useState(DEFAULT_EVENTS)

  const handleGenerate = () => {
    if (!customSceneDesc.trim() || generating) return
    setGenerating(true)
    setGenerated(false)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
      setSelectedScene('custom')
    }, 2000)
  }

  const toggleEvent = (eventId) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, enabled: !e.enabled } : e))
    )
  }

  const activeScene = selectedScene === 'custom'
    ? '自定义场景'
    : PRESET_SCENES.find((s) => s.id === selectedScene)?.name || '--'

  const enabledEventCount = events.filter((e) => e.enabled).length

  const lobbyQuery = useMemo(() => {
    const params = new URLSearchParams({
      source: 'studio',
      type: interviewStyle === 'pressure' ? 'semi' : interviewStyle,
      difficulty: strictness >= 4 ? 'hard' : strictness <= 2 ? 'easy' : 'medium',
    })
    if (customPrompt.trim()) params.set('position', customPrompt.trim().slice(0, 40))
    return params.toString()
  }, [interviewStyle, strictness, customPrompt])

  const styleFill = (value) => ({ '--fill': `${((value - 1) / 4) * 100}%` })

  return (
    <div className={styles.page}>
      <PageBar title="沙盒定制工坊" />

      {/* Three-Column Panels */}
      <div className={styles.columns}>
        {/* Section 1: Interviewer Customization */}
        <div className={styles.panel}>
          <div className={styles['panel-title']}>
            考官定制
            <span className={styles['panel-title-id']}>[S-01]</span>
          </div>

          {/* Strictness Slider */}
          <div className={styles['slider-group']}>
            <div className={styles['slider-header']}>
              <span className={styles['slider-label']}>严厉程度</span>
              <span className={styles['slider-value']}>{strictness}</span>
            </div>
            <div className={styles['slider-track']}>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={strictness}
                onChange={(e) => setStrictness(Number(e.target.value))}
                className={styles['slider-input']}
                style={styleFill(strictness)}
              />
            </div>
            <div className={styles['slider-labels']}>
              <span className={styles['slider-end']}>温和</span>
              <span className={styles['slider-end']}>高压</span>
            </div>
          </div>

          {/* Speed Slider */}
          <div className={styles['slider-group']}>
            <div className={styles['slider-header']}>
              <span className={styles['slider-label']}>语速节奏</span>
              <span className={styles['slider-value']}>{speed}</span>
            </div>
            <div className={styles['slider-track']}>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className={styles['slider-input']}
                style={styleFill(speed)}
              />
            </div>
            <div className={styles['slider-labels']}>
              <span className={styles['slider-end']}>慢速</span>
              <span className={styles['slider-end']}>快速</span>
            </div>
          </div>

          {/* Interview Style */}
          <div className={styles['section-label']}>面试风格</div>
          <div className={styles['style-cards']}>
            {INTERVIEW_STYLES.map((s) => (
              <div
                key={s.id}
                className={`${styles['style-card']} ${interviewStyle === s.id ? styles.selected : ''}`}
                onClick={() => setInterviewStyle(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setInterviewStyle(s.id)}
              >
                <div className={styles['style-card-name']}>{s.name}</div>
              </div>
            ))}
          </div>

          {/* Custom Prompt */}
          <div className={styles['section-label']}>自定义人设</div>
          <div className={styles['textarea-group']}>
            <textarea
              className={styles.textarea}
              placeholder="考官人设描述"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
          </div>
        </div>

        {/* Section 2: Scene Customization */}
        <div className={styles.panel}>
          <div className={styles['panel-title']}>
            场景定制
            <span className={styles['panel-title-id']}>[S-02]</span>
          </div>

          {/* Preset Scenes */}
          <div className={styles['section-label']}>预设场景</div>
          <div className={styles['scene-grid']}>
            {PRESET_SCENES.map((scene) => (
              <div
                key={scene.id}
                className={`${styles['scene-card']} ${selectedScene === scene.id ? styles.selected : ''}`}
                onClick={() => { setSelectedScene(scene.id); setGenerated(false) }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedScene(scene.id)}
              >
                <span className={styles['scene-emoji']}>{scene.emoji}</span>
                <div className={styles['scene-name']}>{scene.name}</div>
                <div className={styles['scene-desc']}>{scene.desc}</div>
              </div>
            ))}
          </div>

          {/* AIGC Divider */}
          <div className={styles.divider}>
            <div className={styles['divider-line']} />
            <span className={styles['divider-text']}>or AIGC</span>
            <div className={styles['divider-line']} />
          </div>

          {/* Custom Scene */}
          <div className={styles['ai-generate-row']}>
            <textarea
              className={styles.textarea}
              placeholder="描述你想要的面试场景..."
              value={customSceneDesc}
              onChange={(e) => setCustomSceneDesc(e.target.value)}
            />
            <button
              className={styles['btn-generate']}
              onClick={handleGenerate}
              disabled={generating || !customSceneDesc.trim()}
            >
              {generating ? '生成中...' : 'AI 生成场景'}
            </button>
          </div>
          {generated && (
            <div className={styles['generate-status']}>
              场景已生成
            </div>
          )}
        </div>

        {/* Section 3: Random Events */}
        <div className={styles.panel}>
          <div className={styles['panel-title']}>
            突发事件
            <span className={styles['panel-title-id']}>[S-03]</span>
          </div>

          <div className={styles['event-list']}>
            {events.map((event) => (
              <div key={event.id} className={styles['event-row']}>
                <div className={styles['event-info']}>
                  <div className={styles['event-name']}>{event.name}</div>
                  <div className={styles['event-desc']}>{event.desc}</div>
                </div>
                <div
                  className={`${styles.toggle} ${event.enabled ? styles.on : ''}`}
                  onClick={() => toggleEvent(event.id)}
                  role="switch"
                  aria-checked={event.enabled}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleEvent(event.id)}
                >
                  <div className={styles['toggle-dot']} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary + Start */}
      <div className={styles['summary-bar']}>
        <div className={styles['summary-items']}>
          <div className={styles['summary-item']}>
            <span className={styles['summary-label']}>严厉度</span>
            <span className={styles['summary-value']}>{strictness}/5</span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles['summary-label']}>语速</span>
            <span className={styles['summary-value']}>{speed}/5</span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles['summary-label']}>风格</span>
            <span className={styles['summary-value']}>
              {INTERVIEW_STYLES.find((s) => s.id === interviewStyle)?.name}
            </span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles['summary-label']}>场景</span>
            <span className={styles['summary-value']}>{activeScene}</span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles['summary-label']}>突发事件</span>
            <span className={styles['summary-value']}>{enabledEventCount} 项</span>
          </div>
        </div>
        <Link to={`/interview/lobby?${lobbyQuery}`} className={styles['btn-start']}>
          开始定制面试
          <span className={styles['btn-start-arrow']}>&rarr;</span>
        </Link>
      </div>
    </div>
  )
}
