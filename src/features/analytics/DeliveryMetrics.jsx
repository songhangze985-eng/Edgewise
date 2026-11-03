import { formatMetric, isEnglishMetricsLang } from '../interview/speechMetrics'
import { normalizeInterviewLang } from '../../utils/interviewLang'
import styles from './DeliveryMetrics.module.css'

const STAR_LABELS = { S: '情境', T: '任务', A: '行动', R: '结果' }

function StarRow({ star }) {
  if (!star) return null
  return (
    <div className={styles['star-row']}>
      {Object.entries(STAR_LABELS).map(([key, label]) => (
        <span
          key={key}
          className={`${styles['star-chip']} ${star[key] ? styles.on : styles.off}`}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function MetricCell({ label, value, hint }) {
  return (
    <div className={styles['metric-cell']}>
      <div className={styles['metric-label']}>{label}</div>
      <div className={styles['metric-value']}>{value}</div>
      {hint ? <div className={styles['metric-hint']}>{hint}</div> : null}
    </div>
  )
}

function QuestionDeliveryBlock({ roundName, title, delivery, answerPreview, englishMetrics }) {
  const d = delivery || {}
  const textOnly = d.text_only
  const rateLabel = englishMetrics || d.metrics_lang === 'en-US' ? '语速 (词/分)' : '语速 (字/分)'
  const rateValue = englishMetrics || d.metrics_lang === 'en-US'
    ? formatMetric(d.wpm ?? d.cpm)
    : formatMetric(d.cpm)
  const fillerLabel = englishMetrics || d.metrics_lang === 'en-US' ? '填充词 / 百词' : '填充词 / 百字'
  const iWeLabel = englishMetrics || d.metrics_lang === 'en-US' ? 'I / (I+we)' : '我 / (我+我们)'

  return (
    <div className={styles['q-block']}>
      <div className={styles['q-title']}>
        {roundName ? `${roundName} · ` : ''}
        {title || '题目'}
      </div>
      {answerPreview ? (
        <p className={styles['q-answer']}>{answerPreview}</p>
      ) : null}
      <div className={styles['metric-grid']}>
        <MetricCell label={rateLabel} value={rateValue} hint={textOnly ? '纯文字作答，无语音时长' : null} />
        <MetricCell label="思考时长" value={d.think_ms != null ? `${d.think_ms} ms` : '—'} />
        <MetricCell label="长停顿 (>3s)" value={formatMetric(d.long_pauses)} />
        <MetricCell label={fillerLabel} value={formatMetric(d.filler_per_100)} />
        <MetricCell
          label={iWeLabel}
          value={d.i_we_ratio != null ? `${Math.round(d.i_we_ratio * 100)}%` : '—'}
        />
      </div>
      <StarRow star={d.star} />
    </div>
  )
}

export default function DeliveryMetrics({ rounds, summary, interviewLang }) {
  const englishMetrics = isEnglishMetricsLang(normalizeInterviewLang(interviewLang))
  const items = []
  for (const rnd of rounds || []) {
    for (const q of rnd.questions || []) {
      if (q.delivery) {
        items.push({
          key: `${rnd.name}-${q.id}`,
          roundName: rnd.name,
          title: q.title,
          delivery: q.delivery,
          answer: q.answer,
        })
      }
      for (const [idx, fu] of (q.followups || []).entries()) {
        if (fu.delivery) {
          items.push({
            key: `${rnd.name}-${q.id}-fu-${idx}`,
            roundName: rnd.name,
            title: `追问 · ${q.title}`,
            delivery: fu.delivery,
            answer: fu.answer,
          })
        }
      }
    }
  }

  if (!items.length && !summary) {
    return (
      <div className={styles.panel}>
        <p className={styles.empty}>本场暂无表达指标（需语音作答或提交有效回答后生成）。</p>
      </div>
    )
  }

  const summaryRateLabel = englishMetrics || summary?.avg_wpm != null ? '词/分' : '字/分'
  const summaryRate = englishMetrics || summary?.avg_wpm != null
    ? formatMetric(summary?.avg_wpm ?? summary?.avg_cpm)
    : formatMetric(summary?.avg_cpm)
  const summaryFillerLabel = englishMetrics ? '百词' : '百字'

  return (
    <div className={styles.panel}>
      {summary && (summary.avg_cpm != null || summary.avg_filler_per_100 != null || summary.avg_wpm != null) && (
        <div className={styles.summary}>
          <span>
            场均语速 {summaryRate} {summaryRateLabel}
          </span>
          <span>
            场均填充词 {formatMetric(summary.avg_filler_per_100)} / {summaryFillerLabel}
          </span>
          {summary.voice_samples != null && (
            <span className={styles['summary-meta']}>语音样本 {summary.voice_samples} 段</span>
          )}
        </div>
      )}
      {items.map((item) => (
        <QuestionDeliveryBlock
          key={item.key}
          roundName={item.roundName}
          title={item.title}
          delivery={item.delivery}
          answerPreview={item.answer ? String(item.answer).slice(0, 120) : null}
          englishMetrics={englishMetrics}
        />
      ))}
    </div>
  )
}
