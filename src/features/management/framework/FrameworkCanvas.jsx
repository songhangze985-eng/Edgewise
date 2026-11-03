import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STAGES } from './framework.data.js'
import styles from './Framework.module.css'

const CELL_W = 152
const CELL_H = 64
const STAGE_GAP = 28
const PAD_X = 48
const PAD_Y = 56
const NODE_W = 132
const NODE_H = 48

const EDGE_STYLES = {
  main: { stroke: 'var(--primary-light)', dash: undefined },
  loop: { stroke: 'var(--purple)', dash: '6 4' },
  data: { stroke: 'var(--success)', dash: '2 4' },
  back: { stroke: 'var(--warning)', dash: '8 4' },
  ref: { stroke: 'var(--chalk-dim)', dash: '4 6' },
}

function layoutNodes(nodes) {
  const stageOrder = STAGES.map((s) => s.id)
  const byStage = {}
  nodes.forEach((n) => {
    if (!byStage[n.stage]) byStage[n.stage] = []
    byStage[n.stage].push(n)
  })

  const stageMeta = {}
  let xCursor = PAD_X
  stageOrder.forEach((stageId) => {
    const list = byStage[stageId] || []
    if (list.length === 0) return
    const maxCol = Math.max(...list.map((n) => n.col))
    const width = (maxCol + 1) * CELL_W
    stageMeta[stageId] = { x: xCursor, width, nodes: list }
    xCursor += width + STAGE_GAP
  })

  const positions = {}
  Object.entries(stageMeta).forEach(([stageId, meta]) => {
    meta.nodes.forEach((n) => {
      positions[n.id] = {
        x: meta.x + n.col * CELL_W + (CELL_W - NODE_W) / 2,
        y: PAD_Y + n.row * CELL_H + (CELL_H - NODE_H) / 2,
        stage: stageId,
      }
    })
  })

  const maxRow = Math.max(0, ...nodes.map((n) => n.row))
  const height = PAD_Y * 2 + (maxRow + 1) * CELL_H + 24
  const width = xCursor + PAD_X

  return { positions, width, height, stageMeta }
}

function edgePath(from, to) {
  const fx = from.x + NODE_W / 2
  const fy = from.y + NODE_H / 2
  const tx = to.x + NODE_W / 2
  const ty = to.y + NODE_H / 2
  const mx = (fx + tx) / 2
  return `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`
}

export default function FrameworkCanvas({
  nodes,
  edges,
  selectedId,
  hoverId,
  onSelectNode,
  onHoverNode,
  fitToken,
  zoomStep,
  zoomTick,
}) {
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })
  const dragRef = useRef(null)

  const { positions, width, height, stageMeta } = useMemo(() => layoutNodes(nodes), [nodes])

  const connected = useMemo(() => {
    const set = new Set()
    const active = hoverId || selectedId
    if (!active) return set
    edges.forEach((e) => {
      if (e.from === active || e.to === active) {
        set.add(e.id)
        set.add(e.from)
        set.add(e.to)
      }
    })
    return set
  }, [edges, hoverId, selectedId])

  const fitToView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    const scale = Math.min((cw - 24) / width, (ch - 24) / height, 1.2)
    const s = Math.max(0.35, scale)
    setTransform({
      scale: s,
      x: (cw - width * s) / 2,
      y: (ch - height * s) / 2,
    })
  }, [width, height])

  useEffect(() => {
    fitToView()
  }, [fitToView, nodes])

  useEffect(() => {
    if (fitToken == null) return
    fitToView()
  }, [fitToken, fitToView])

  useEffect(() => {
    if (!zoomTick) return
    setTransform((t) => {
      const next = Math.min(2.5, Math.max(0.25, t.scale + (zoomStep || 0)))
      return { ...t, scale: next }
    })
  }, [zoomTick, zoomStep])

  const onPointerDown = (e) => {
    if (e.target.closest('[data-node]')) return
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
    containerRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setTransform((t) => ({ ...t, x: dragRef.current.tx + dx, y: dragRef.current.ty + dy }))
  }

  const onPointerUp = (e) => {
    dragRef.current = null
    containerRef.current?.releasePointerCapture(e.pointerId)
  }

  const onWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setTransform((t) => ({
      ...t,
      scale: Math.min(2.5, Math.max(0.25, t.scale + delta)),
    }))
  }

  const stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]))

  return (
    <div
      ref={containerRef}
      className={styles.canvasWrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      <svg
        className={styles.canvasSvg}
        width="100%"
        height="100%"
        aria-label="项目框架图"
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {Object.entries(stageMeta).map(([stageId, meta]) => {
            const stage = stageById[stageId]
            const bandH = height - PAD_Y
            return (
              <g key={stageId}>
                <rect
                  x={meta.x - 12}
                  y={PAD_Y - 36}
                  width={meta.width + 24}
                  height={bandH}
                  rx={12}
                  className={styles.stageBand}
                  style={{ stroke: stage?.color }}
                />
                <text
                  x={meta.x}
                  y={PAD_Y - 14}
                  className={styles.stageLabel}
                  style={{ fill: stage?.color }}
                >
                  {stage?.label}
                </text>
              </g>
            )
          })}

          <defs>
            <marker id="arrow-main" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--primary-light)" />
            </marker>
            <marker id="arrow-data" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--success)" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const from = positions[edge.from]
            const to = positions[edge.to]
            if (!from || !to) return null
            const style = EDGE_STYLES[edge.kind] || EDGE_STYLES.main
            const dimmed = connected.size > 0 && !connected.has(edge.id)
            return (
              <path
                key={edge.id}
                d={edgePath(from, to)}
                fill="none"
                stroke={style.stroke}
                strokeWidth={dimmed ? 1 : 1.8}
                strokeDasharray={style.dash}
                opacity={dimmed ? 0.15 : 0.85}
                markerEnd={edge.kind === 'main' || edge.kind === 'data' ? `url(#arrow-${edge.kind === 'data' ? 'data' : 'main'})` : undefined}
              />
            )
          })}

          {nodes.map((node) => {
            const pos = positions[node.id]
            if (!pos) return null
            const isSelected = selectedId === node.id
            const isHover = hoverId === node.id
            const dimmed = connected.size > 0 && !connected.has(node.id)
            const planned = node.status === 'planned'
            return (
              <g
                key={node.id}
                data-node
                transform={`translate(${pos.x},${pos.y})`}
                className={styles.nodeGroup}
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => onHoverNode(node.id)}
                onMouseLeave={() => onHoverNode(null)}
                onClick={() => onSelectNode(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectNode(node.id)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}${planned ? '，规划中' : ''}`}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  className={
                    planned
                      ? styles.nodePlanned
                      : isSelected || isHover
                        ? styles.nodeActive
                        : styles.nodeExisting
                  }
                />
                <text x={NODE_W / 2} y={NODE_H / 2 - 4} className={styles.nodeLabel}>
                  {node.label.length > 9 ? `${node.label.slice(0, 8)}…` : node.label}
                </text>
                {planned ? (
                  <text x={NODE_W / 2} y={NODE_H / 2 + 12} className={styles.nodeTag}>
                    规划中
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
