import { useCallback, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useResumeStore from '../../stores/resumeStore'
import { trackResearchEvent } from '../../research/track'
import PageBar from '../../components/ui/PageBar'
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
  const { file, fileName, fileSize, status, uploadAndParse, error: storeError } = useResumeStore()
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback(async (selectedFile) => {
    const err = validateFile(selectedFile)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setUploadProgress(30)
    try {
      setUploadProgress(70)
      await uploadAndParse(selectedFile)
      setUploadProgress(100)
    } catch (uploadErr) {
      setError(uploadErr?.message || '上传失败')
      setUploadProgress(0)
    }
  }, [uploadAndParse])

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
      {(error || storeError) && (
        <div style={{ color: 'var(--danger)', fontSize: '0.7rem', marginTop: 'var(--sp-sm)' }}>
          {error || storeError}
        </div>
      )}
    </div>
  )
}

/* =====================================================
   JD Match Panel
   ===================================================== */
function JdKeywordEditor({ keywords, onChange }) {
  const [draft, setDraft] = useState('')

  const remove = (kw) => onChange(keywords.filter((k) => k !== kw))
  const add = () => {
    const token = draft.trim()
    if (!token || keywords.includes(token)) return
    onChange([...keywords, token])
    setDraft('')
  }

  return (
    <div className={styles['jd-keyword-editor']}>
      <div className={styles['keywords-list']}>
        {keywords.map((kw) => (
          <span key={kw} className={styles['keyword-tag-editable']}>
            {kw}
            <button type="button" className={styles['kw-remove']} onClick={() => remove(kw)} aria-label={`移除 ${kw}`}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className={styles['kw-add-row']}>
        <input
          type="text"
          className={styles['kw-add-input']}
          placeholder="手动补充关键词"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button type="button" className={styles['kw-add-btn']} onClick={add}>
          添加
        </button>
      </div>
    </div>
  )
}

function JdMatchPanel() {
  const navigate = useNavigate()
  const {
    jdText,
    setJdText,
    jdKeywords,
    setJdKeywords,
    jdMatch,
    analyzeJdMatch,
    status,
    resumeId,
    savedJobs,
    selectedJobId,
    fetchSavedJobs,
    loadJobIntoEditor,
    saveJdFromPaste,
  } = useResumeStore()
  const [analyzeError, setAnalyzeError] = useState('')
  const [shortWarn, setShortWarn] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSavedJobs()
  }, [fetchSavedJobs])

  useEffect(() => {
    setShortWarn(jdText.trim().length > 0 && jdText.trim().length < 50)
  }, [jdText])

  const handleSelectJob = (job) => {
    loadJobIntoEditor(job)
    setAnalyzeError('')
  }

  const handleSaveJd = async () => {
    if (!jdText.trim()) return
    setSaving(true)
    setAnalyzeError('')
    try {
      const job = await saveJdFromPaste({
        rawText: jdText.trim(),
        keywords: jdKeywords,
      })
      trackResearchEvent('jd.saved', { job_id: job.id, keyword_count: (job.keywords || []).length })
      if (job.needs_manual_keywords) {
        setAnalyzeError('未能自动提取关键词，请手动添加后保存。')
      }
    } catch (err) {
      setAnalyzeError(err?.message || '保存 JD 失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAnalyze = useCallback(async () => {
    setAnalyzeError('')
    try {
      const match = await analyzeJdMatch()
      if (match) {
        trackResearchEvent('jd.match_viewed', {
          job_id: match.job_id,
          resume_id: match.resume_id,
          coverage: match.coverage,
        })
      }
    } catch (err) {
      setAnalyzeError(err?.message || '匹配分析失败')
    }
  }, [analyzeJdMatch])

  const isParsed = status === 'parsed' || status === 'optimizing' || status === 'optimized'

  const lobbyHref = selectedJobId
    ? `/interview/lobby?resume=${encodeURIComponent(resumeId || '')}&job=${encodeURIComponent(selectedJobId)}`
    : `/interview/lobby?resume=${encodeURIComponent(resumeId || '')}`

  return (
    <div className={styles['panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>JD 岗位匹配</span>
        <span className={styles['panel-id']}>[JD-01]</span>
      </div>

      {savedJobs.length > 0 && (
        <div className={styles['jd-saved-row']}>
          <span className={styles['keywords-label']}>已保存 JD</span>
          <select
            className={styles['jd-select']}
            value={selectedJobId || ''}
            onChange={(e) => {
              const job = savedJobs.find((j) => j.id === e.target.value)
              if (job) handleSelectJob(job)
            }}
          >
            <option value="">选择已保存 JD…</option>
            {savedJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {(j.title || j.raw_text.slice(0, 24)).trim()}
              </option>
            ))}
          </select>
        </div>
      )}

      <textarea
        className={styles['jd-textarea']}
        placeholder="粘贴目标岗位的 Job Description，将提取技能关键词并与简历对照…"
        value={jdText}
        onChange={(e) => setJdText(e.target.value)}
      />
      {shortWarn && (
        <p className={styles['jd-inline-warn']}>JD 文本较短（不足 50 字），匹配结果可能不完整，建议补充职责与技能要求。</p>
      )}

      <div className={styles['keywords-label']}>JD 关键词（可编辑）</div>
      <JdKeywordEditor keywords={jdKeywords} onChange={setJdKeywords} />

      <div className={styles['jd-action-row']}>
        <button
          type="button"
          className={styles['jd-analyze-btn']}
          onClick={handleSaveJd}
          disabled={!jdText.trim() || saving}
        >
          {saving ? '保存中…' : '保存 JD'}
        </button>
        <button
          type="button"
          className={styles['jd-analyze-btn']}
          onClick={handleAnalyze}
          disabled={(!jdText.trim() && !selectedJobId) || !isParsed}
        >
          分析关键词覆盖
        </button>
      </div>

      {analyzeError && <p className={styles['jd-inline-warn']}>{analyzeError}</p>}

      {jdMatch && (
        <div className={styles['jd-results']}>
          <div className={styles['match-score-row']}>
            <span className={styles['match-label']}>JD 关键词覆盖率</span>
            <div className={styles['match-bar-bg']}>
              <div className={styles['match-bar-fill']} style={{ width: `${jdMatch.coverage}%` }} />
            </div>
            <span className={styles['match-score-value']}>{jdMatch.coverage}%</span>
          </div>

          <div className={styles['jd-match-columns']}>
            <div className={styles['jd-match-col']}>
              <div className={styles['keywords-label']}>双方重合</div>
              <div className={styles['keywords-list']}>
                {(jdMatch.overlap || []).map((kw) => (
                  <span key={kw} className={`${styles['keyword-tag']} ${styles['kw-overlap']}`}>{kw}</span>
                ))}
                {(jdMatch.overlap || []).length === 0 && <span className={styles['jd-empty-col']}>—</span>}
              </div>
            </div>
            <div className={styles['jd-match-col']}>
              <div className={styles['keywords-label']}>仅 JD</div>
              <div className={styles['keywords-list']}>
                {(jdMatch.jd_only || []).map((kw) => (
                  <span key={kw} className={`${styles['keyword-tag']} ${styles['kw-jd-only']}`}>{kw}</span>
                ))}
                {(jdMatch.jd_only || []).length === 0 && <span className={styles['jd-empty-col']}>—</span>}
              </div>
            </div>
            <div className={styles['jd-match-col']}>
              <div className={styles['keywords-label']}>仅简历</div>
              <div className={styles['keywords-list']}>
                {(jdMatch.resume_only || []).map((kw) => (
                  <span key={kw} className={`${styles['keyword-tag']} ${styles['kw-resume-only']}`}>{kw}</span>
                ))}
                {(jdMatch.resume_only || []).length === 0 && <span className={styles['jd-empty-col']}>—</span>}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles['jd-analyze-btn']}
            style={{ marginTop: 'var(--sp-md)' }}
            disabled={!resumeId}
            onClick={() => navigate(lobbyHref)}
          >
            按 JD 定制开始面试
          </button>
        </div>
      )}
    </div>
  )
}

function TargetJobsTab({ onEdit }) {
  const { savedJobs, fetchSavedJobs, loadJobIntoEditor, deleteSavedJob } = useResumeStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSavedJobs().finally(() => setLoading(false))
  }, [fetchSavedJobs])

  return (
    <div className={styles['panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>目标岗位 JD</span>
        <span className={styles['panel-id']}>[JD-LIB]</span>
      </div>
      {loading && <p className={styles['education-text']}>加载中…</p>}
      {!loading && savedJobs.length === 0 && (
        <p className={styles['education-text']}>暂无保存的 JD，可在「简历优化」页粘贴并保存。</p>
      )}
      <div className={styles['target-jobs-list']}>
        {savedJobs.map((job) => (
          <div key={job.id} className={styles['target-job-card']}>
            <div className={styles['target-job-title']}>{job.title || '未命名岗位'}</div>
            <div className={styles['target-job-snippet']}>{(job.raw_text || '').slice(0, 120)}…</div>
            <div className={styles['keywords-list']}>
              {(job.keywords || []).slice(0, 6).map((kw) => (
                <span key={kw} className={styles['keyword-tag']}>{kw}</span>
              ))}
            </div>
            <div className={styles['target-job-actions']}>
              <button
                type="button"
                className={styles['history-use-btn']}
                onClick={() => {
                  loadJobIntoEditor(job)
                  onEdit?.()
                }}
              >
                载入编辑
              </button>
              <button type="button" className={styles['history-use-btn']} onClick={() => deleteSavedJob(job.id)}>
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
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
            {(parsedData.experience || []).map((exp, i) => (
              <div key={i} className={styles['experience-card']}>
                <div className={styles['exp-header']}>
                  <span className={styles['exp-company']}>{exp.company}</span>
                  <span className={styles['exp-period']}>{exp.period}</span>
                </div>
                <div className={styles['exp-role']}>{exp.role}</div>
                <div className={styles['exp-desc']}>{exp.desc}</div>
              </div>
            ))}
            {(parsedData.experience || []).length === 0 && (
              <div className={styles['education-text']}>未解析到工作经历（启发式解析）</div>
            )}
          </div>

          {/* Skills */}
          <div className={styles['section-label']} style={{ marginTop: 'var(--sp-lg)' }}>技能标签</div>
          <div className={styles['skills-list']}>
            {(parsedData.skills || []).map((skill) => (
              <span key={skill} className={styles['skill-tag']}>{skill}</span>
            ))}
            {(parsedData.skills || []).length === 0 && (
              <div className={styles['education-text']}>未匹配到预置技能关键词</div>
            )}
          </div>

          {/* Projects */}
          <div className={styles['section-label']}>项目经验</div>
          <div className={styles['projects-list']}>
            {(parsedData.projects || []).map((proj, i) => (
              <div key={i} className={styles['project-card']}>
                <div className={styles['project-name']}>{proj.name}</div>
                <div className={styles['project-desc']}>{proj.desc}</div>
              </div>
            ))}
            {(parsedData.projects || []).length === 0 && (
              <div className={styles['education-text']}>未解析到项目经验</div>
            )}
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
    const fullText = useResumeStore.getState().optimizedText || ''
    if (!fullText) {
      useResumeStore.getState().finishOptimizeFromServerText()
      return
    }
    isStreamingRef.current = true
    useResumeStore.setState({ optimizedText: '', status: 'optimizing' })
    startOptimizing()

    let index = 0

    const streamInterval = setInterval(() => {
      if (index >= fullText.length) {
        clearInterval(streamInterval)
        setOptimizedText(fullText)
        isStreamingRef.current = false
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
  const { history, resumeId, fileName, setActiveResumeFromHistory } = useResumeStore()

  return (
    <div className={`${styles['panel']} ${styles['history-section']}`}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>优化历史记录</span>
        <span className={styles['panel-id']}>[HIS-01]</span>
      </div>
      <div className={styles['history-list']}>
        {history.length === 0 && (
          <p className={styles['education-text']}>暂无历史简历，上传后将在此管理默认版本。</p>
        )}
        {history.map((h, i) => {
          const isDefault = h.file === fileName || (i === 0 && !fileName)
          return (
            <div key={`${h.file}-${i}`} className={styles['history-item']}>
              <span className={styles['history-file']}>{h.file}</span>
              {isDefault && resumeId && (
                <span className={styles['history-default']}>默认</span>
              )}
              <span className={styles['history-status']}>{h.status === 'optimized' ? '已优化' : h.status}</span>
              <span className={styles['history-date']}>{h.date}</span>
              {!isDefault && (
                <button
                  type="button"
                  className={styles['history-use-btn']}
                  onClick={() => setActiveResumeFromHistory?.(h)}
                >
                  设为默认
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* =====================================================
   Main Resume Page
   ===================================================== */
export default function Resume() {
  const [tab, setTab] = useState('optimize')

  return (
    <div className={styles['resume-page']}>
      <PageBar title="简历优化" />

      <div className={styles['resume-tabs']}>
        <button
          type="button"
          className={`${styles['resume-tab']} ${tab === 'optimize' ? styles['resume-tab-active'] : ''}`}
          onClick={() => setTab('optimize')}
        >
          简历优化
        </button>
        <button
          type="button"
          className={`${styles['resume-tab']} ${tab === 'jobs' ? styles['resume-tab-active'] : ''}`}
          onClick={() => setTab('jobs')}
        >
          目标岗位
        </button>
      </div>

      {tab === 'jobs' ? (
        <TargetJobsTab onEdit={() => setTab('optimize')} />
      ) : (
        <>
          <div className={styles['top-grid']}>
            <UploadZone />
            <JdMatchPanel />
          </div>
          <ParsedDataSection />
          <SuggestionsSection />
          <StreamingOutput />
          <HistorySection />
        </>
      )}
    </div>
  )
}
