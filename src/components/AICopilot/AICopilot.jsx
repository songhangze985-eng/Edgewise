import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './AICopilot.module.css'
import copilotIcon from '../../assets/copilot-icon.png'
import copilotIconRunning from '../../assets/copilot-icon-running.png'

const PAGE_INSTRUCTIONS = {
  '/': '当前是 Dashboard 智启工作台，展示用户的练习数据、能力雷达图和快速启动入口。',
  '/lgd/lobby': '当前是 LGD 无领导小组讨论大厅，用户可以创建房间或加入已有房间。',
  '/lgd/room': '当前是 LGD 群面房间，7 个 AI 角色 + 1 个真人圆桌讨论。',
  '/resume': '当前是简历 AI 优化页面，上传简历获取 AI 解析和优化建议。',
}

const PAGE_SUGGESTIONS = {
  '/': ['帮我找到 LGD 群面入口', '点击简历优化', '介绍一下这个平台'],
  '/lgd/lobby': ['帮我创建一个新房间', '进入第一个房间', '这个页面有什么功能'],
  '/lgd/room': ['帮我点击抢麦按钮', '滚动到聊天底部', '介绍讨论规则'],
  '/resume': ['帮我找到上传简历的区域', '点击分析匹配度按钮', '怎么上传简历'],
}

function getPageKey(pathname) {
  if (pathname.startsWith('/lgd/room')) return '/lgd/room'
  return pathname
}

function getPageInstructions(url) {
  try {
    const path = new URL(url).pathname
    return PAGE_INSTRUCTIONS[getPageKey(path)] || ''
  } catch {
    return ''
  }
}

const AGENT_CONFIG = {
  model: 'qwen3.5-plus',
  baseURL: 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
  apiKey: 'NA',
  language: 'zh-CN',
  instructions: {
    system: '你是谈锋 Edgewise 的智能引导助手，帮助用户快速上手 AI 面试训练平台。平台核心功能：1) LGD 无领导小组讨论 2) 简历 AI 优化 3) Dashboard 数据总览。用简洁中文回答，执行操作时给出反馈。',
    getPageInstructions,
  },
}

export default function AICopilot() {
  const agentRef = useRef(null)
  const PageAgentRef = useRef(null)
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [messages, setMessages] = useState([])
  const [agentReady, setAgentReady] = useState(false)
  const messagesEndRef = useRef(null)

  const pageKey = getPageKey(location.pathname)
  const suggestions = PAGE_SUGGESTIONS[pageKey] || PAGE_SUGGESTIONS['/']

  // Always create a fresh PageAgent instance before each task
  // page-agent auto-disposes after execute() completes
  const ensureAgent = useCallback(async () => {
    if (!PageAgentRef.current) {
      const mod = await import('page-agent')
      PageAgentRef.current = mod.PageAgent
    }

    const agent = new PageAgentRef.current(AGENT_CONFIG)
    agentRef.current = agent
    window.pageAgent = agent
    setAgentReady(true)
    return agent
  }, [])

  // Load page-agent on mount
  useEffect(() => {
    let unmounted = false

    ensureAgent().then(() => {
      if (!unmounted) setAgentReady(true)
    }).catch((err) => {
      console.warn('[AICopilot] Failed to load page-agent:', err)
    })

    return () => {
      unmounted = true
    }
  }, [ensureAgent])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addMessage = useCallback((role, content) => {
    setMessages((prev) => [...prev, { role, content, id: Date.now() + Math.random() }])
  }, [])

  const handleSubmit = useCallback(async (task) => {
    if (!task.trim() || status === 'running') return

    const taskText = task.trim()
    setInput('')
    addMessage('user', taskText)
    setStatus('running')

    try {
      addMessage('agent', '🤖 正在分析页面并执行任务...')
      const agent = await ensureAgent()
      await agent.execute(taskText)
      setMessages((prev) => {
        const updated = [...prev]
        const lastAgent = updated.findLastIndex((m) => m.role === 'agent')
        if (lastAgent >= 0) {
          updated[lastAgent] = { ...updated[lastAgent], content: `✅ 任务完成：${taskText}` }
        }
        return updated
      })
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev]
        const lastAgent = updated.findLastIndex((m) => m.role === 'agent')
        if (lastAgent >= 0) {
          updated[lastAgent] = { ...updated[lastAgent], content: `❌ 执行出错：${err.message || '未知错误'}` }
        }
        return updated
      })
    } finally {
      setStatus('idle')
    }
  }, [status, addMessage, ensureAgent])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(input)
    }
  }, [input, handleSubmit])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
    }, 250)
  }, [])

  const handleToggle = useCallback(() => {
    if (isOpen) handleClose()
    else setIsOpen(true)
  }, [isOpen, handleClose])

  return (
    <>
      {/* Toggle Button */}
      <button
        className={`${styles['toggle-btn']} ${!isOpen ? styles.pulse : ''}`}
        onClick={handleToggle}
        data-page-agent-ignore="true"
      >
        <div className={styles['toggle-well']}>
          <div className={styles['toggle-cap']}>
            <img
              className={styles['toggle-icon']}
              src={status === 'running' ? copilotIconRunning : copilotIcon}
              alt="AI Copilot"
            />
          </div>
        </div>
      </button>

      {/* Panel */}
      {(isOpen || isClosing) && (
        <div className={`${styles.panel} ${isClosing ? styles['panel-closing'] : ''}`} data-page-agent-ignore="true">
          {/* Header */}
          <div className={styles['panel-header']}>
            <div className={styles['header-left']}>
              <img className={styles['header-icon']} src={copilotIcon} alt="" />
              <span className={styles['header-title']}>PageAgent 智能引导</span>
              <span className={`${styles['status-dot']} ${agentReady ? styles.ready : ''}`} />
            </div>
            <button className={styles['close-btn']} onClick={handleClose}>✕</button>
          </div>

          {/* Description */}
          <div className={styles['panel-desc']}>
            用自然语言操控页面 — 告诉 AI 你想做什么，它会自动定位元素并执行操作
          </div>

          {/* Quick Suggestions */}
          <div className={styles['suggestions-bar']}>
            {suggestions.map((s) => (
              <button
                key={s}
                className={styles['suggestion-chip']}
                onClick={() => handleSubmit(s)}
                disabled={status === 'running'}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className={styles['messages-area']}>
            {messages.length === 0 && (
              <div className={styles['empty-hint']}>
                <span>💡</span>
                <span>试试点击上方快捷指令，或输入自定义任务</span>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${styles[`message-${msg.role}`]}`}
              >
                <div className={styles['message-bubble']}>{msg.content}</div>
              </div>
            ))}
            {status === 'running' && (
              <div className={styles['running-indicator']}>
                <div className={styles['running-dots']}>
                  <span /><span /><span />
                </div>
                <span>AI 正在操控页面...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={styles['input-area']}>
            <input
              className={styles['input-field']}
              type="text"
              placeholder="输入指令，如「帮我点击简历优化」"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={status === 'running'}
            />
            <button
              className={styles['send-btn']}
              onClick={() => handleSubmit(input)}
              disabled={!input.trim() || status === 'running'}
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </>
  )
}
