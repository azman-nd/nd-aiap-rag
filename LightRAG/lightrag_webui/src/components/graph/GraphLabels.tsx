import { useCallback, useEffect } from 'react'
import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { useSettingsStore } from '@/stores/settings'
import { useGraphStore } from '@/stores/graph'
import { labelListLimit } from '@/lib/constants'
import MiniSearch from 'minisearch'
import { useTranslation } from 'react-i18next'

const GraphLabels = () => {
  const { t } = useTranslation()
  const label = useSettingsStore.use.queryLabel()
  const allDatabaseLabels = useGraphStore.use.allDatabaseLabels()
  const labelsFetchAttempted = useGraphStore.use.labelsFetchAttempted()

  // Remove initial label fetch effect as it's now handled by fetchGraph based on lastSuccessfulQueryLabel

  const getSearchEngine = useCallback(() => {
    // Create search engine
    const searchEngine = new MiniSearch({
      idField: 'id',
      fields: ['value'],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: {
          label: 2
        }
      }
    })

    // Add documents
    const documents = allDatabaseLabels.map((str, index) => ({ id: index, value: str }))
    searchEngine.addAll(documents)

    return {
      labels: allDatabaseLabels,
      searchEngine
    }
  }, [allDatabaseLabels])

  const fetchData = useCallback(
    async (query?: string): Promise<string[]> => {
      const { labels, searchEngine } = getSearchEngine()

      let result: string[] = labels
      if (query) {
        // Search labels using MiniSearch
        result = searchEngine.search(query).map((r: { id: number }) => labels[r.id])

        // Add middle-content matching if results are few
        // This enables matching content in the middle of text, not just from the beginning
        if (result.length < 15) {
          // Get already matched labels to avoid duplicates
          const matchedLabels = new Set(result)

          // Perform middle-content matching on all labels
          const middleMatchResults = labels.filter(label => {
            // Skip already matched labels
            if (matchedLabels.has(label)) return false

            // Match if label contains query string but doesn't start with it
            return label &&
                   typeof label === 'string' &&
                   !label.toLowerCase().startsWith(query.toLowerCase()) &&
                   label.toLowerCase().includes(query.toLowerCase())
          })

          // Merge results
          result = [...result, ...middleMatchResults]
        }
      }

      return result.length <= labelListLimit
        ? result
        : [...result.slice(0, labelListLimit), '...']
    },
    [getSearchEngine]
  )

  // Validate label
  useEffect(() => {

    if (labelsFetchAttempted) {
      if (allDatabaseLabels.length > 1) {
        if (label && label !== '*' && !allDatabaseLabels.includes(label)) {
          console.log(`Label "${label}" not in available labels, setting to "*"`);
          useSettingsStore.getState().setQueryLabel('*');
        } else {
          console.log(`Label "${label}" is valid`);
        }
      } else if (label && allDatabaseLabels.length <= 1 && label && label !== '*') {
        console.log('Available labels list is empty, setting label to empty');
        useSettingsStore.getState().setQueryLabel('');
      }
      useGraphStore.getState().setLabelsFetchAttempted(false)
    }

  }, [allDatabaseLabels, label, labelsFetchAttempted]);

  return (
    <div className="flex items-center">
      <AsyncSelect<string>
        className="min-w-[300px]"
        triggerClassName="max-h-8"
        searchInputClassName="max-h-8"
        triggerTooltip={t('graphPanel.graphLabels.selectTooltip')}
        fetcher={fetchData}
        renderOption={(item) => <div style={{ whiteSpace: 'pre' }}>{item}</div>}
        getOptionValue={(item) => item}
        getDisplayValue={(item) => <div style={{ whiteSpace: 'pre' }}>{item}</div>}
        notFound={<div className="py-6 text-center text-sm">No labels found</div>}
        label={t('graphPanel.graphLabels.label')}
        placeholder={t('graphPanel.graphLabels.placeholder')}
        value={label !== null ? label : '*'}
        onChange={(newLabel) => {
          const currentLabel = useSettingsStore.getState().queryLabel;

          // select the last item means query all
          if (newLabel === '...') {
            newLabel = '*';
          }

          // Handle reselecting the same label
          if (newLabel === currentLabel && newLabel !== '*') {
            newLabel = '*';
          }

          // Reset graphDataFetchAttempted flag to ensure data fetch is triggered
          useGraphStore.getState().setGraphDataFetchAttempted(false);

          // Update the label to trigger data loading
          useSettingsStore.getState().setQueryLabel(newLabel);
        }}
        clearable={false}  // Prevent clearing value on reselect
      />
    </div>
  )
}

export default GraphLabels
