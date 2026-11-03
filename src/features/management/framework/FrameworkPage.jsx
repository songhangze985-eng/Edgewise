import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageBar from '../../../components/ui/PageBar'
import FrameworkCanvas from './FrameworkCanvas'
import NodeDetailDrawer from './NodeDetailDrawer'
import { VIEWS, filterGraph, getNodeById } from './framework.data.js'
import styles from './Framework.module.css'

export default function FrameworkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view') || 'overview'
  const viewId = VIEWS.some((v) => v.id === viewParam) ? viewParam : 'overview'
  const nodeParam = searchParams.get('node')

  const [hoverId, setHoverId] = useState(null)
  const [fitToken, setFitToken] = useState(0)
  const [zoomTick, setZoomTick] = useState({ n: 0, delta: 0 })

  const { nodes, edges } = useMemo(() => filterGraph(viewId), [viewId])
  const selectedNode = nodeParam ? getNodeById(nodeParam) : null
  const viewLabel = VIEWS.find((v) => v.id === viewId)?.label || '全景'

  const setView = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('view', id)
    if (next.get('node')) {
      const n = getNodeById(next.get('node'))
      if (!n?.views.includes(id)) next.delete('node')
    }
    setSearchParams(next, { replace: true })
  }

  const selectNode = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams)
      next.set('node', id)
      if (!next.get('view')) next.set('view', viewId)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams, viewId],
  )

  const closeDrawer = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('node')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (nodeParam && !getNodeById(nodeParam)) {
      const next = new URLSearchParams(searchParams)
      next.delete('node')
      setSearchParams(next, { replace: true })
    }
  }, [nodeParam, searchParams, setSearchParams])

  return (
    <div className={styles.page}>
      <nav className={styles.sideNav} aria-label="管理后台">
        <span className={styles.sideSection}>管理后台</span>
        <Link to="/management" className={styles.sideLink}>
          返回总览
        </Link>
        <span className={styles.sideSection}>研究与架构</span>
        <Link to="/management/research" className={styles.sideLink}>
          问卷统计
        </Link>
        <span className={styles.sideLinkActive}>项目框架</span>
        <Link to="/management" className={styles.sideLink}>
          后测盲评
        </Link>
      </nav>

      <div className={styles.main}>
        <PageBar
          title="项目框架"
          context={viewLabel}
          actions={
            <div className={styles.toolbar}>
              <button type="button" className={styles.btnGhost} onClick={() => setFitToken((t) => t + 1)}>
                适应屏幕
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setZoomTick((t) => ({ n: t.n + 1, delta: 0.15 }))}
              >
                放大
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setZoomTick((t) => ({ n: t.n + 1, delta: -0.15 }))}
              >
                缩小
              </button>
              <div className={styles.legend} aria-hidden="true">
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchMain}`} />
                  主流程
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchData}`} />
                  数据流
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchLoop}`} />
                  回流
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendNodeSolid} />
                  已上线
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendNodeDash} />
                  规划中
                </span>
              </div>
            </div>
          }
        />

        <div className={styles.viewBar} role="tablist" aria-label="视图">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={viewId === v.id}
              className={viewId === v.id ? styles.viewBtnActive : styles.viewBtn}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <p className={styles.hint}>
          拖拽平移、滚轮缩放；点击节点查看详情。当前视图 {nodes.length} 个节点、{edges.length} 条连线。
        </p>

        <div className={styles.canvasPanel}>
          <FrameworkCanvas
            nodes={nodes}
            edges={edges}
            selectedId={nodeParam}
            hoverId={hoverId}
            onSelectNode={selectNode}
            onHoverNode={setHoverId}
            fitToken={fitToken}
            zoomStep={zoomTick.n ? zoomTick.delta : 0}
            zoomTick={zoomTick.n}
          />
        </div>
      </div>

      {selectedNode ? <NodeDetailDrawer node={selectedNode} onClose={closeDrawer} /> : null}
    </div>
  )
}
