import { lazy, Suspense, useCallback, useRef } from 'react'
import styles from './CaseRoom.module.css'

const ExcalidrawLazy = lazy(async () => {
  await import('@excalidraw/excalidraw/index.css')
  const mod = await import('@excalidraw/excalidraw')
  return { default: mod.Excalidraw }
})

function WhiteboardFallback() {
  return <div className={styles['board-loading']}>白板加载中…</div>
}

export default function CaseWhiteboard({ snapshot, onSnapshot }) {
  const debounceRef = useRef(null)

  const handleChange = useCallback(
    (elements, appState) => {
      if (!onSnapshot) return
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        onSnapshot({
          elements,
          appState: {
            viewBackgroundColor: appState?.viewBackgroundColor,
            gridSize: appState?.gridSize,
          },
          updated_at: new Date().toISOString(),
        })
      }, 800)
    },
    [onSnapshot],
  )

  const initialData = snapshot?.elements
    ? {
        elements: snapshot.elements,
        appState: snapshot.appState || {},
      }
    : undefined

  return (
    <div className={styles['board-wrap']}>
      <Suspense fallback={<WhiteboardFallback />}>
        <ExcalidrawLazy
          initialData={initialData}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: false,
              saveAsImage: false,
            },
          }}
        />
      </Suspense>
    </div>
  )
}
