import { shouldShowWeChatSpeechTip } from '../../utils/device'
import styles from './WeChatSpeechTip.module.css'

export default function WeChatSpeechTip() {
  if (!shouldShowWeChatSpeechTip()) return null
  return (
    <p className={styles.tip} role="status">
      请在系统浏览器打开以使用语音；您仍可使用文字作答。
    </p>
  )
}
