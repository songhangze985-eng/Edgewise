import { splitSpeechSentences } from '../../utils/speechSentences'
import styles from './InterviewerCaptions.module.css'

/**
 * Caption strip under interviewer TTS. Highlights the active sentence while speaking;
 * shows full text without highlight when TTS is off.
 */
export default function InterviewerCaptions({
  text,
  activeSentenceIndex = null,
  speaking = false,
  className = '',
}) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  const sentences = splitSpeechSentences(trimmed)
  const highlightIndex = speaking ? activeSentenceIndex : null

  return (
    <div
      className={`${styles.captions} ${className}`.trim()}
      role="region"
      aria-label="题目字幕"
    >
      {sentences.map((sentence, i) => (
        <span
          key={`${i}-${sentence.slice(0, 12)}`}
          className={i === highlightIndex ? styles.active : styles.sentence}
        >
          {sentence}
        </span>
      ))}
    </div>
  )
}
