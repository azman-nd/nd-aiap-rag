import React, { useState, useEffect } from 'react'
import { Search, X, FileText } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { useSettingsStore } from '@/stores/settings'

interface FilePathFilterProps {
  className?: string
}

const FilePathFilter: React.FC<FilePathFilterProps> = ({ className = '' }) => {
  const [filePath, setFilePath] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  
  const setGraphFilePathFilter = useSettingsStore.use.setGraphFilePathFilter()
  const graphFilePathFilter = useSettingsStore.use.graphFilePathFilter()

  // Initialize the filter value from store
  useEffect(() => {
    setFilePath(graphFilePathFilter || '')
  }, [graphFilePathFilter])

  const handleFilePathChange = (value: string) => {
    setFilePath(value)
  }

  const handleApplyFilter = () => {
    setGraphFilePathFilter(filePath.trim() || null)
    setIsExpanded(false)
  }

  const handleClearFilter = () => {
    setFilePath('')
    setGraphFilePathFilter(null)
    setIsExpanded(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleApplyFilter()
    } else if (e.key === 'Escape') {
      setIsExpanded(false)
    }
  }

  const hasActiveFilter = graphFilePathFilter && graphFilePathFilter.length > 0

  return (
    <div className={`relative ${className}`}>
      {/* Filter Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`h-8 px-2 ${
                hasActiveFilter 
                  ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300' 
                  : ''
              }`}
            >
              <FileText className="h-4 w-4" />
              {hasActiveFilter && (
                <span className="ml-1 text-xs truncate max-w-20">
                  {graphFilePathFilter}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasActiveFilter ? `Filtered by: ${graphFilePathFilter}` : 'Filter by file path'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Expanded Filter Panel */}
      {isExpanded && (
        <div className="absolute top-10 left-0 z-50 w-80 bg-background border border-border rounded-lg shadow-lg p-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Filter by File Path</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <Input
                placeholder="Enter file path (e.g., document.pdf)"
                value={filePath}
                onChange={(e) => handleFilePathChange(e.target.value)}
                onKeyDown={handleKeyPress}
                className="text-sm"
                autoFocus
              />
              
              <div className="text-xs text-muted-foreground">
                Supports partial matching. Leave empty to show all files.
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleApplyFilter}
                className="flex-1"
              >
                <Search className="h-3 w-3 mr-1" />
                Apply Filter
              </Button>
              
              {hasActiveFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilter}
                  className="flex-1"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FilePathFilter
