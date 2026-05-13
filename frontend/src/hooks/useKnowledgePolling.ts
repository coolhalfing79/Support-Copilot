import { useEffect, useRef } from 'react'
import { useAdminStore } from '../store/adminStore'

export const useKnowledgePolling = () => {
  const { knowledgeSources, loadKnowledgeSources } = useAdminStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Check if any source is in a processing state
    const hasProcessing = knowledgeSources.some(
      (s) => s.status === 'pending' || s.status === 'processing'
    )

    if (hasProcessing) {
      if (!timerRef.current) {
        console.log('🔄 [Admin] Starting knowledge status polling...')
        timerRef.current = setInterval(() => {
          loadKnowledgeSources()
        }, 5000) // Poll every 5 seconds
      }
    } else {
      if (timerRef.current) {
        console.log('✅ [Admin] All sources indexed. Stopping polling.')
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [knowledgeSources, loadKnowledgeSources])
}
