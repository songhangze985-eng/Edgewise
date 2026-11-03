import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import useResearchStore from '../../stores/researchStore'

export default function InviteLanding() {
  const { code } = useParams()
  const captureReferral = useResearchStore((s) => s.captureReferral)
  const captureFromUrl = useResearchStore((s) => s.captureFromUrl)

  useEffect(() => {
    captureFromUrl()
    if (code) captureReferral(code)
  }, [code, captureReferral, captureFromUrl])

  return <Navigate to="/login" replace />
}
