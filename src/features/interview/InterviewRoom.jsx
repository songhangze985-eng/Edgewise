import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useSessionStore from '../../stores/sessionStore'
import styles from './InterviewRoom.module.css'

const mockQuestions = [
  '请简单做一下自我介绍。',
  '你认为自己最大的优势是什么？能给我举一个具体的例子吗？',
  '请描述一个你在团队中解决冲突的经历。',
  '你如何看待加班？如果项目紧急需要连续加班，你会如何应对？',
  '你对我们公司有什么了解？为什么选择应聘这个岗位？',
]

const mockMessages = [
  { role: 'system', text: '面试开始，请做好准备。' },
  { role: 'interviewer', text: '你好，欢迎参加今天的面试。在开始之前，请先放松一下。准备好了我们就开始吧。' },
]

export default function InterviewRoom() {
  const navigate = useNavigate()
  const addSession = useSessionStore((s) => s.addSession)
  const [messages, setMessages] = useState(mockMessages)
  const [input, setInput] = useState('')
  const [currentQ, setCurrentQ] = useState(0)
  const [isThinking, setIsThinking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showExit, setShowExit] = useState(false)
  const messagesEndRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const handleSend = () => {
    if (!input.trim() || isThinking) return

    const userMsg = { role: 'user', text: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    // Simulate AI interviewer response
    setTimeout(() => {
      const nextQ = currentQ + 1
      if (nextQ < mockQuestions.length) {
        setMessages((prev) => [
          ...prev,
          { role: 'interviewer', text: `好的，理解了。接下来下一个问题：\n\n${mockQuestions[nextQ]}` },
        ])
        setCurrentQ(nextQ)
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'interviewer', text: '好的，感谢你的回答。今天的面试到此结束，我们会尽快给你反馈。祝你一切顺利！' },
          { role: 'system', text: '面试结束。正在生成复盘报告...' },
        ])
        const score = Math.floor(Math.random() * 15) + 78
        addSession({
          type: 'interview',
          topic: '1v1 模拟面试 · 结构化',
          score,
          durationMinutes: Math.floor(elapsed / 60),
          dimensions: {
            expression: score + Math.floor(Math.random() * 6) - 3,
            logic: score + Math.floor(Math.random() * 6) - 3,
            leadership: score + Math.floor(Math.random() * 8) - 5,
            teamwork: score + Math.floor(Math.random() * 6) - 2,
            adaptability: score + Math.floor(Math.random() * 6) - 3,
          },
        })
      }
      setIsThinking(false)
    }, 2000)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExit = () => {
    clearInterval(timerRef.current)
    navigate('/interview/lobby')
  }

  return (
    <div className={styles.room}>
      {/* Top Bar */}
      <div className={styles.topbar}>
        <div className={styles['topbar-left']}>
          <div className={styles['interviewer-avatar']}>
            <span>AI</span>
          </div>
          <div className={styles['interviewer-info']}>
            <div className={styles['interviewer-name']}>面试官 · 陈明</div>
            <div className={styles['interviewer-role']}>资深HR · 结构化面试</div>
          </div>
          <div className={`${styles['status-dot']} ${isThinking ? styles.thinking : styles.ready}`} />
        </div>
        <div className={styles['topbar-center']}>
          <div className={styles['progress-pills']}>
            {mockQuestions.map((_, i) => (
              <div
                key={i}
                className={`${styles.pill} ${i < currentQ ? styles.done : ''} ${i === currentQ ? styles.current : ''}`}
              />
            ))}
          </div>
          <div className={styles['progress-text']}>
            问题 {Math.min(currentQ + 1, mockQuestions.length)} / {mockQuestions.length}
          </div>
        </div>
        <div className={styles['topbar-right']}>
          <div className={styles.timer}>
            <span className={styles['timer-icon']}>⏱</span>
            <span className={styles['timer-value']}>{formatTime(elapsed)}</span>
          </div>
          <button className={styles['exit-btn']} onClick={() => setShowExit(true)} aria-label="退出面试">
            退出
          </button>
        </div>
      </div>

      {/* Current Question Highlight */}
      <div className={styles['question-banner']}>
        <span className={styles['question-tag']}>Q{currentQ + 1}</span>
        <span className={styles['question-text']}>{mockQuestions[currentQ]}</span>
      </div>

      {/* Messages Area */}
      <div className={styles['messages-area']}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.message} ${styles[`msg-${msg.role}`]}`}>
            {msg.role === 'interviewer' && (
              <div className={styles['msg-avatar']}>AI</div>
            )}
            <div className={styles['msg-bubble']}>
              {msg.text.split('\n').map((line, j) => (
                <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className={`${styles.message} ${styles['msg-interviewer']}`}>
            <div className={styles['msg-avatar']}>AI</div>
            <div className={styles['msg-bubble']}>
              <div className={styles['thinking-dots']}>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={styles['input-area']}>
        <div className={styles['input-hint']}>
          按 Enter 发送 · Shift+Enter 换行
        </div>
        <div className={styles['input-row']}>
          <textarea
            className={styles['input-field']}
            placeholder="输入你的回答..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isThinking}
          />
          <button
            className={styles['send-btn']}
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            aria-label="发送回答"
          >
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      {showExit && (
        <div className={styles['modal-overlay']} onClick={(e) => e.target === e.currentTarget && setShowExit(false)} role="dialog" aria-modal="true" aria-label="退出确认">
          <div className={styles['modal-card']}>
            <div className={styles['modal-title']}>确认退出？</div>
            <div className={styles['modal-desc']}>
              退出后本次面试进度将不会保存。已回答的内容不会生成复盘报告。
            </div>
            <div className={styles['modal-actions']}>
              <button className={styles['modal-cancel']} onClick={() => setShowExit(false)}>
                继续面试
              </button>
              <button className={styles['modal-confirm']} onClick={handleExit}>
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
