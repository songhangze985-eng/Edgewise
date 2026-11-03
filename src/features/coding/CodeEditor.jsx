import { lazy, Suspense, useMemo } from 'react'
import styles from './CodingRoom.module.css'

const Monaco = lazy(() => import('@monaco-editor/react'))

export default function CodeEditor({ language, value, onChange, height = '420px' }) {
  const monacoLang = useMemo(() => {
    const l = (language || 'javascript').toLowerCase()
    return l === 'python' || l === 'py' ? 'python' : 'javascript'
  }, [language])

  return (
    <div className={styles['editor-wrap']}>
      <Suspense
        fallback={(
          <textarea
            className={styles['editor-fallback']}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            spellCheck={false}
            aria-label="代码编辑器加载中"
          />
        )}
      >
        <Monaco
          height={height}
          language={monacoLang}
          theme="vs-dark"
          value={value}
          onChange={(v) => onChange?.(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </Suspense>
    </div>
  )
}
