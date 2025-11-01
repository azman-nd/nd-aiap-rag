import { RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { controlButtonVariant } from '@/lib/constants'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useGraphStore } from '@/stores/graph'

const RefreshButton = () => {
  const { t } = useTranslation()

  const handleRefresh = () => {
    // Reset fetch status flags
    useGraphStore.getState().setLabelsFetchAttempted(false)
    useGraphStore.getState().setGraphDataFetchAttempted(false)

    // Clear last successful query label to ensure labels are fetched
    useGraphStore.getState().setLastSuccessfulQueryLabel('')

    // Get current label
    const currentLabel = useSettingsStore.getState().queryLabel

    // If current label is empty, use default label '*'
    if (!currentLabel) {
      useSettingsStore.getState().setQueryLabel('*')
    } else {
      // Trigger data reload
      useSettingsStore.getState().setQueryLabel('')
      setTimeout(() => {
        useSettingsStore.getState().setQueryLabel(currentLabel)
      }, 0)
    }
  }

  return (
    <Button
      size="icon"
      variant={controlButtonVariant}
      onClick={handleRefresh}
      tooltip={t('graphPanel.graphLabels.refreshTooltip', 'Refresh graph')}
      className="h-[52px] w-[52px] border-2"
    >
      <RefreshCw className="h-5 w-5" />
    </Button>
  )
}

export default RefreshButton
