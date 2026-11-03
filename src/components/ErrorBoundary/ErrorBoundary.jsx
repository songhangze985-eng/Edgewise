import { Component } from 'react'
import styles from './ErrorBoundary.module.css'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  handleRetry = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className={styles.wrap}>
          <h1 className={styles.title}>页面出现问题</h1>
          <p className={styles.desc}>
            {error.message || '未知错误，请刷新后重试。'}
          </p>
          <button type="button" className={styles.btn} onClick={this.handleRetry}>
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
