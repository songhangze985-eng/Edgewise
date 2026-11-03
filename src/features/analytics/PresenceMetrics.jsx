import {
  formatPresenceRatio,
} from '../interview/presenceMetrics'
import styles from './DeliveryMetrics.module.css'

function MetricCell({ label, value, hint }) {
  return (
    <div className={styles['metric-cell']}>
      <div className={styles['metric-label']}>{label}</div>
      <div className={styles['metric-value']}>{value}</div>
      {hint ? <div className={styles['metric-hint']}>{hint}</div> : null}
    </div>
  )
}

function QuestionPresenceBlock({ roundName, title, presence }) {
  const p = presence || {}
  const simplified = p.engine === 'heuristic_simplified'
  return (
    <div className={styles['q-block']}>
      <div className={styles['q-title']}>
        {roundName ? `${roundName} · ` : ''}
        {title || '题目'}
        {simplified ? (
          <span className={styles['summary-meta']}> · 简化版（Canvas 采样）</span>
        ) : null}
      </div>
      <div className={styles['metric-grid']}>
        <MetricCell label="面部在框" value={formatPresenceRatio(p.face_in_frame_ratio)} />
        <MetricCell label="画面居中" value={formatPresenceRatio(p.centered_ratio)} />
        <MetricCell
          label="头部朝向稳定"
          value={formatPresenceRatio(p.head_yaw_ok_ratio)}
          hint={p.head_yaw_ok_ratio == null ? '简化版未估算侧头角度' : null}
        />
        <MetricCell
          label="平视角度"
          value={formatPresenceRatio(p.head_pitch_ok_ratio)}
          hint={p.head_pitch_ok_ratio == null ? '简化版未估算俯仰角' : null}
        />
        <MetricCell
          label="视线朝前"
          value={formatPresenceRatio(p.gaze_forward_ratio)}
          hint={p.gaze_forward_ratio == null ? '简化版未估算视线' : null}
        />
        <MetricCell label="光线适中" value={formatPresenceRatio(p.brightness_ok_ratio)} />
      </div>
      {Array.isArray(p.tips) && p.tips.length > 0 && (
        <ul className={styles['metric-hint']} style={{ marginTop: '0.5rem', paddingLeft: '1.1rem' }}>
          {p.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PresenceMetrics({ rounds, summary }) {
  const items = []
  for (const rnd of rounds || []) {
    for (const q of rnd.questions || []) {
      if (q.presence?.sample_count) {
        items.push({
          key: `${rnd.name}-${q.id}`,
          roundName: rnd.name,
          title: q.title,
          presence: q.presence,
        })
      }
    }
  }

  if (!items.length && !summary) {
    return (
      <p className={styles.empty}>本场未开启镜头仪态分析，或样本不足。</p>
    )
  }

  return (
    <div className={styles.panel}>
      {summary && (
        <div className={styles.summary}>
          <span>平均在框 {formatPresenceRatio(summary.avg_face_in_frame_ratio)}</span>
          <span>平均居中 {formatPresenceRatio(summary.avg_centered_ratio)}</span>
          {summary.engines?.includes('heuristic_simplified') && (
            <span className={styles['summary-meta']}>含简化版采样</span>
          )}
        </div>
      )}
      {Array.isArray(summary?.tips) && summary.tips.length > 0 && (
        <ul className={styles['metric-hint']} style={{ marginBottom: '0.75rem', paddingLeft: '1.1rem' }}>
          {summary.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
      {items.map((item) => (
        <QuestionPresenceBlock
          key={item.key}
          roundName={item.roundName}
          title={item.title}
          presence={item.presence}
        />
      ))}
    </div>
  )
}
