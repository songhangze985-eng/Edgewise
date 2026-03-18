import { useCallback, useRef, useState, useEffect } from 'react'
import useResumeStore from '../../stores/resumeStore'
import styles from './Resume.module.css'

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const ACCEPTED_EXT = ['.pdf', '.docx']

const MAX_FILE_SIZE = 10 * 1024 * 1024

function getCategoryClass(category) {
  const map = {
    '工作经历': 'category-experience',
    '技能描述': 'category-skills',
    '项目经验': 'category-projects',
    '教育背景': 'category-education',
    '个人总结': 'category-summary',
  }
  return map[category] || 'category-experience'
}

function validateFile(file) {
  if (!file) return 'No file selected'
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  const typeValid = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.includes(ext)
  if (!typeValid) return '仅支持 PDF / DOCX 格式'
  if (file.size > MAX_FILE_SIZE) return '文件不能超过 10MB'
  return null
}

/* =====================================================
   Upload Zone
   ===================================================== */
function UploadZone() {
  const { file, fileName, fileSize, status, setFile, startParsing, setParsedData } = useResumeStore()
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback((selectedFile) => {
    const err = validateFile(selectedFile)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setFile(selectedFile)

    // Simulate upload progress
    let progress = 0
    const uploadInterval = setInterval(() => {
      progress += Math.random() * 25 + 10
      if (progress >= 100) {
        progress = 100
        clearInterval(uploadInterval)
        setUploadProgress(100)
        // Start parsing after upload completes
        startParsing()
        setTimeout(() => {
          setParsedData(null)
        }, 2000)
      }
      setUploadProgress(Math.min(100, Math.round(progress)))
    }, 200)
  }, [setFile, startParsing, setParsedData])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const droppedFile = e.dataTransfer.files[0]
    handleFile(droppedFile)
  }, [handleFile])

  const handleClick = useCallback(() => {
    if (status === 'idle') {
      inputRef.current?.click()
    }
  }, [status])

  const handleInputChange = useCallback((e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) handleFile(selectedFile)
  }, [handleFile])

  const isUploading = status === 'uploading'
  const isParsing = status === 'parsing'
  const hasFile = file !== null && !isUploading

  const zoneClasses = [
    styles['upload-zone'],
    dragActive ? styles['upload-zone-active'] : '',
    hasFile && !isParsing ? styles['upload-zone-uploaded'] : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={styles['panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>上传简历</span>
        <span className={styles['panel-id']}>[UP-01]</span>
      </div>
      <div
        className={zoneClasses}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          className={styles['file-input']}
          accept=".pdf,.docx"
          onChange={handleInputChange}
        />

        {!file && !isUploading && (
          <>
            <span className={styles['upload-icon']}>&#9671;</span>
            <div className={styles['upload-text']}>拖拽文件至此 或 点击上传</div>
            <div className={styles['upload-hint']}>支持 PDF / DOCX &middot; 最大 10MB</div>
          </>
        )}

        {isUploading && (
          <>
            <span className={styles['upload-icon']}>&#9671;</span>
            <div className={styles['upload-text']}>正在上传...</div>
            <div className={styles['upload-progress']}>
              <div className={styles['progress-bar-bg']}>
                <div
                  className={styles['progress-bar-fill']}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className={styles['progress-label']}>{uploadProgress}%</div>
            </div>
          </>
        )}

        {hasFile && !isParsing && (
          <div className={styles['uploaded-info']}>
            <span className={styles['file-icon']}>&#128196;</span>
            <div className={styles['file-details']}>
              <div className={styles['file-name']}>{fileName}</div>
              <div className={styles['file-size']}>{fileSize}</div>
              <div className={styles['file-status']}>
                <span className={styles['check-icon']}>&#10003;</span>
                已上传
              </div>
            </div>
          </div>
        )}

        {isParsing && (
          <div className={styles['parsing-animation']}>
            <div className={styles['parsing-spinner']} />
            <div className={styles['parsing-text']}>AI 正在解析简历...</div>
          </div>
        )}
      </div>
      {error && (
        <div style={{ color: 'var(--danger)', fontSize: '0.7rem', marginTop: 'var(--sp-sm)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

/* =====================================================
   JD Match Panel
   ===================================================== */
function JdMatchPanel() {
  const { jdText, setJdText, jdMatchScore, jdKeywords, analyzeJdMatch, status } = useResumeStore()
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    if (jdMatchScore === null) {
      setAnimatedScore(0)
      return
    }
    let current = 0
    const step = jdMatchScore / 30
    const interval = setInterval(() => {
      current += step
      if (current >= jdMatchScore) {
        current = jdMatchScore
        clearInterval(interval)
      }
      setAnimatedScore(Math.round(current))
    }, 20)
    return () => clearInterval(interval)
  }, [jdMatchScore])

  const handleAnalyze = useCallback(() => {
    analyzeJdMatch()
  }, [analyzeJdMatch])

  const isParsed = status === 'parsed' || status === 'optimizing' || status === 'optimized'

  return (
    <div className={styles['panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>JD 岗位匹配</span>
        <span className={styles['panel-id']}>[JD-01]</span>
      </div>
      <textarea
        className={styles['jd-textarea']}
        placeholder="粘贴目标岗位的 Job Description，AI 将分析匹配度..."
        value={jdText}
        onChange={(e) => setJdText(e.target.value)}
      />
      <button
        className={styles['jd-analyze-btn']}
        onClick={handleAnalyze}
        disabled={!jdText.trim() || !isParsed}
      >
        分析匹配度
      </button>

      {jdMatchScore !== null && (
        <div className={styles['jd-results']}>
          <div className={styles['match-score-row']}>
            <span className={styles['match-label']}>匹配度</span>
            <div className={styles['match-bar-bg']}>
              <div
                className={styles['match-bar-fill']}
                style={{ width: `${animatedScore}%` }}
              />
            </div>
            <span className={styles['match-score-value']}>{animatedScore}%</span>
          </div>

          <div className={styles['keywords-label']}>匹配关键词</div>
          <div className={styles['keywords-list']}>
            {jdKeywords.map((kw, i) => (
              <span
                key={kw}
                className={styles['keyword-tag']}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* =====================================================
   Parsed Data Section
   ===================================================== */
function ParsedDataSection() {
  const { parsedData, status } = useResumeStore()
  const isParsing = status === 'parsing'
  const hasParsed = parsedData !== null

  if (!isParsing && !hasParsed) return null

  return (
    <div className={`${styles['panel']} ${styles['parsed-section']}`}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>AI 解析结果</span>
        <span className={styles['panel-id']}>[PARSE-01]</span>
      </div>

      {isParsing && (
        <div className={styles['parsing-animation']}>
          <div className={styles['parsing-spinner']} />
          <div className={styles['parsing-text']}>AI 正在解析简历内容...</div>
        </div>
      )}

      {hasParsed && (
        <>
          {/* Basic Info */}
          <div className={styles['parsed-basic']}>
            <div className={styles['parsed-field']}>
              <span className={styles['parsed-label']}>姓名</span>
              <span className={styles['parsed-value']}>{parsedData.name}</span>
            </div>
            <div className={styles['parsed-field']}>
              <span className={styles['parsed-label']}>邮箱</span>
              <span className={styles['parsed-value']}>{parsedData.email}</span>
            </div>
            <div className={styles['parsed-field']}>
              <span className={styles['parsed-label']}>电话</span>
              <span className={styles['parsed-value']}>{parsedData.phone}</span>
            </div>
          </div>

          {/* Education */}
          <div className={styles['parsed-education']}>
            <div className={styles['section-label']}>教育背景</div>
            <div className={styles['education-text']}>{parsedData.education}</div>
          </div>

          {/* Experience */}
          <div className={styles['section-label']}>工作经历</div>
          <div className={styles['experience-list']}>
            {parsedData.experience.map((exp, i) => (
              <div key={i} className={styles['experience-card']}>
                <div className={styles['exp-header']}>
                  <span className={styles['exp-company']}>{exp.company}</span>
                  <span className={styles['exp-period']}>{exp.period}</span>
                </div>
                <div className={styles['exp-role']}>{exp.role}</div>
                <div className={styles['exp-desc']}>{exp.desc}</div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className={styles['section-label']} style={{ marginTop: 'var(--sp-lg)' }}>技能标签</div>
          <div className={styles['skills-list']}>
            {parsedData.skills.map((skill) => (
              <span key={skill} className={styles['skill-tag']}>{skill}</span>
            ))}
          </div>

          {/* Projects */}
          <div className={styles['section-label']}>项目经验</div>
          <div className={styles['projects-list']}>
            {parsedData.projects.map((proj, i) => (
              <div key={i} className={styles['project-card']}>
                <div className={styles['project-name']}>{proj.name}</div>
                <div className={styles['project-desc']}>{proj.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* =====================================================
   AI Suggestions
   ===================================================== */
function SuggestionsSection() {
  const { suggestions, applySuggestion, status } = useResumeStore()

  const hasSuggestions = suggestions.length > 0
  const showSection = status === 'parsed' || status === 'optimizing' || status === 'optimized'

  if (!showSection || !hasSuggestions) return null

  return (
    <div className={styles['panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>AI 优化建议</span>
        <span className={styles['panel-id']}>[OPT-01]</span>
      </div>
      <div className={styles['suggestions-list']}>
        {suggestions.map((s, i) => (
          <div key={s.id} className={styles['suggestion-item']}>
            <div className={styles['suggestion-content']}>
              <div className={styles['suggestion-top']}>
                <span className={styles['suggestion-index']}>[{i + 1}]</span>
                <span className={`${styles['suggestion-category']} ${styles[getCategoryClass(s.category)]}`}>
                  {s.category}
                </span>
                <span className={styles['suggestion-divider']} />
              </div>
              <div className={styles['suggestion-text']}>{s.text}</div>
            </div>
            <div className={styles['suggestion-impact']}>
              竞争力 +{s.impact}
            </div>
            <button
              className={`${styles['apply-btn']} ${s.applied ? styles['apply-btn-active'] : ''}`}
              onClick={() => applySuggestion(s.id)}
            >
              {s.applied ? '已应用' : '应用'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* =====================================================
   Streaming Output
   ===================================================== */
function StreamingOutput() {
  const { status, optimizedText, startOptimizing, appendOptimizedChar, setOptimizedText } = useResumeStore()
  const streamRef = useRef(null)
  const isStreamingRef = useRef(false)

  const showSection = status === 'parsed' || status === 'optimizing' || status === 'optimized'

  const handleStartOptimize = useCallback(() => {
    if (isStreamingRef.current) return
    isStreamingRef.current = true
    startOptimizing()

    const fullText = useResumeStore.getState().getMockOptimizedText()
    let index = 0

    const streamInterval = setInterval(() => {
      if (index >= fullText.length) {
        clearInterval(streamInterval)
        setOptimizedText(fullText)
        isStreamingRef.current = false
        // Add to history
        const { fileName } = useResumeStore.getState()
        if (fileName) {
          useResumeStore.setState((state) => ({
            history: [
              { file: fileName, status: 'optimized', date: new Date().toLocaleDateString('zh-CN') },
              ...state.history,
            ],
          }))
        }
        return
      }
      appendOptimizedChar(fullText[index])
      index++
    }, 30)
  }, [startOptimizing, appendOptimizedChar, setOptimizedText])

  // Auto-scroll streaming output
  useEffect(() => {
    if (streamRef.current && status === 'optimizing') {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [optimizedText, status])

  if (!showSection) return null

  const isOptimizing = status === 'optimizing'
  const isOptimized = status === 'optimized'
  const canStart = status === 'parsed'

  return (
    <div className={`${styles['panel']} ${styles['streaming-section']}`}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>AI 优化后的简历</span>
        <span className={styles['panel-id']}>[STREAM-01]</span>
      </div>

      <div className={styles['optimize-controls']}>
        <button
          className={styles['hardware-btn']}
          onClick={handleStartOptimize}
          disabled={!canStart}
        >
          <div className={styles['btn-well']}>
            <div className={styles['btn-cap']}>
              {isOptimizing ? '优化中...' : isOptimized ? '已完成' : '开始优化'}
            </div>
          </div>
        </button>
        <div className={styles['optimize-status']}>
          <span className={`${styles['status-dot']} ${isOptimizing ? styles['status-dot-active'] : ''}`} />
          {isOptimizing && 'AI 正在生成优化内容...'}
          {isOptimized && '优化完成'}
          {canStart && '准备就绪，点击开始'}
        </div>
      </div>

      <div className={styles['streaming-output']} ref={streamRef}>
        {optimizedText ? (
          <div className={styles['streaming-text']}>
            {optimizedText}
            {isOptimizing && <span className={styles['streaming-cursor']} />}
          </div>
        ) : (
          <div className={styles['streaming-placeholder']}>
            点击「开始优化」按钮，AI 将生成优化后的简历内容
          </div>
        )}
      </div>
    </div>
  )
}

/* =====================================================
   History Section
   ===================================================== */
function HistorySection() {
  const { history } = useResumeStore()

  return (
    <div className={`${styles['panel']} ${styles['history-section']}`}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>优化历史记录</span>
        <span className={styles['panel-id']}>[HIS-01]</span>
      </div>
      <div className={styles['history-list']}>
        {history.map((h, i) => (
          <div key={i} className={styles['history-item']}>
            <span className={styles['history-file']}>{h.file}</span>
            <span className={styles['history-status']}>{h.status === 'optimized' ? '已优化' : h.status}</span>
            <span className={styles['history-date']}>{h.date}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* =====================================================
   Main Resume Page
   ===================================================== */
export default function Resume() {
  return (
    <div className={styles['resume-page']}>
      <div className={styles['page-header']}>
        <h1>简历优化</h1>
        <div className={styles['header-sub']}>Resume AI Optimization &middot; Upload &amp; Enhance</div>
      </div>

      {/* Row 1: Upload + JD Match */}
      <div className={styles['top-grid']}>
        <UploadZone />
        <JdMatchPanel />
      </div>

      {/* Row 2: Parsed Data (full width) */}
      <ParsedDataSection />

      {/* Row 3: AI Suggestions (full width) */}
      <SuggestionsSection />

      {/* Row 4: Streaming Output (full width) */}
      <StreamingOutput />

      {/* Row 5: History (full width) */}
      <HistorySection />
    </div>
  )
}
