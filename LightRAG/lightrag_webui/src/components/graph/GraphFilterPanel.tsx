import React, { useState, useEffect } from 'react'
import { Filter, X, Plus, Search } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Label from '@/components/ui/Label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog'
import { useSettingsStore } from '@/stores/settings'
import { MetadataTag, getDocumentsList, getProjectsList } from '@/api/lightrag'

interface GraphFilterPanelProps {
  className?: string
  disabled?: boolean
}

const GraphFilterPanel: React.FC<GraphFilterPanelProps> = ({ className = '', disabled = false }) => {
  // Document filters
  const [projectId, setProjectId] = useState('')
  const [selectedFilename, setSelectedFilename] = useState('')
  const [isPublicFilter, setIsPublicFilter] = useState<boolean | null>(null)
  const [tags, setTags] = useState<MetadataTag[]>([])
  const [tagDraft, setTagDraft] = useState<MetadataTag>({ name: '', value: '' })

  // UI state
  const [isExpanded, setIsExpanded] = useState(false)
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [availableProjects, setAvailableProjects] = useState<string[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)

  // Store integration
  const graphFilePathFilter = useSettingsStore.use.graphFilePathFilter()
  const setGraphFilePathFilter = useSettingsStore.use.setGraphFilePathFilter()
  const graphMetadataFilters = useSettingsStore.use.graphMetadataFilters()
  const updateGraphMetadataFilters = useSettingsStore.use.updateGraphMetadataFilters()

  // Fetch available projects and files when panel opens
  useEffect(() => {
    if (isExpanded) {
      fetchAvailableProjects()
      fetchAvailableFiles()
    }
  }, [isExpanded])

  const fetchAvailableProjects = async () => {
    setIsLoadingProjects(true)
    try {
      const projects = await getProjectsList({
        tags: tags.length > 0 ? tags : undefined
      })
      setAvailableProjects(projects)
    } catch (error) {
      console.error('Error fetching projects list:', error)
      setAvailableProjects([])
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const fetchAvailableFiles = async () => {
    setIsLoadingFiles(true)
    try {
      console.log('Fetching documents list with filters:', { project_id: projectId || undefined, tags: tags.length > 0 ? tags : undefined })
      const files = await getDocumentsList({
        project_id: projectId || undefined,
        tags: tags.length > 0 ? tags : undefined
      })
      console.log('Received files from API:', files)
      setAvailableFiles(files)
    } catch (error) {
      console.error('Error fetching document list:', error)
      setAvailableFiles([])
    } finally {
      setIsLoadingFiles(false)
    }
  }

  // Initialize from store
  useEffect(() => {
    setProjectId(graphMetadataFilters.project_id || '')
    setTags(graphMetadataFilters.tags || [])
    setSelectedFilename(graphFilePathFilter || '')
  }, [graphMetadataFilters, graphFilePathFilter])

  const addTag = () => {
    const name = tagDraft.name.trim()
    if (!name) return
    const value = tagDraft.value?.trim() || ''
    const exists = tags.some(
      (tag) => tag.name === name && (tag.value || '') === value
    )
    if (!exists) {
      setTags((prev) => [...prev, { name, value }])
    }
    setTagDraft({ name: '', value: '' })
  }

  const removeTag = (candidate: MetadataTag) => {
    setTags((prev) =>
      prev.filter(
        (tag) =>
          !(
            tag.name === candidate.name &&
            (tag.value || '') === (candidate.value || '')
          )
      )
    )
  }

  const applyFilters = () => {
    // Apply document-level filters
    const trimmedProjectId = projectId.trim()
    console.log('[GraphFilterPanel] Applying filters:', {
      project_id: trimmedProjectId || '(empty)',
      filename: selectedFilename || '(none)',
      tags: tags.length > 0 ? tags : '(none)'
    })

    setGraphFilePathFilter(selectedFilename || null)
    updateGraphMetadataFilters({
      project_id: trimmedProjectId,  // Pass empty string, not undefined
      tags
    })
    // Refetch available files if needed
    fetchAvailableFiles()
  }

  const clearAllFilters = () => {
    // Clear local state
    setProjectId('')
    setSelectedFilename('')
    setIsPublicFilter(null)
    setTags([])
    setTagDraft({ name: '', value: '' })

    // Clear store state - must pass empty string, not undefined
    // because updateGraphMetadataFilters only updates when value !== undefined
    setGraphFilePathFilter(null)
    updateGraphMetadataFilters({
      project_id: '',  // Empty string, not undefined
      owner: '',       // Empty string, not undefined
      tags: []
    })

    // Close the panel
    setIsExpanded(false)
  }

  const activeFilterCount =
    (graphMetadataFilters.project_id && graphMetadataFilters.project_id.trim() ? 1 : 0) +
    (graphFilePathFilter ? 1 : 0) +
    (isPublicFilter !== null ? 1 : 0) +
    (graphMetadataFilters.tags?.length || 0)

  return (
    <div className={className}>
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(true)}
          disabled={disabled}
          className={`h-[52px] w-full px-3 gap-1.5 border-2 ${
            activeFilterCount > 0
              ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300'
              : ''
          }`}
        >
          <Filter className="h-4 w-4" />
          <span className="text-xs font-medium">Doc Filter</span>
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-900">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Document Filters
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[600px] overflow-y-auto px-1">
            {/* Document Filters */}
            <div className="space-y-3">
              {/* Project ID */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Project ID</Label>
                <Select
                  value={projectId || '__ALL__'}
                  onValueChange={(value) => setProjectId(value === '__ALL__' ? '' : value)}
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {isLoadingProjects ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        Loading...
                      </div>
                    ) : availableProjects.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No projects found
                      </div>
                    ) : (
                      <>
                        <SelectItem value="__ALL__">All projects</SelectItem>
                        {availableProjects.map((project) => (
                          <SelectItem key={project} value={project}>
                            {project}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Filename */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Filename</Label>
                <Select
                  value={selectedFilename || '__ALL__'}
                  onValueChange={(value) => setSelectedFilename(value === '__ALL__' ? '' : value)}
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="All files" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {isLoadingFiles ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        Loading...
                      </div>
                    ) : availableFiles.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No files found
                      </div>
                    ) : (
                      <>
                        <SelectItem value="__ALL__">All files</SelectItem>
                        {availableFiles.map((file) => (
                          <SelectItem key={file} value={file}>
                            {file}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Is Public */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Visibility</Label>
                <Select
                  value={isPublicFilter === null ? 'all' : isPublicFilter ? 'public' : 'private'}
                  onValueChange={(value) =>
                    setIsPublicFilter(value === 'all' ? null : value === 'public')
                  }
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All documents</SelectItem>
                    <SelectItem value="public">Public only</SelectItem>
                    <SelectItem value="private">Private only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tags</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="name"
                    value={tagDraft.name}
                    onChange={(e) => setTagDraft((prev) => ({ ...prev, name: e.target.value }))}
                    className="text-xs h-8 flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={tagDraft.value || ''}
                    onChange={(e) => setTagDraft((prev) => ({ ...prev, value: e.target.value }))}
                    className="text-xs h-8 flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addTag}
                    className="h-8 px-2"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs"
                      >
                        <span className="font-medium">{tag.name}</span>
                        {tag.value && <span>: {tag.value}</span>}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="w-full sm:w-auto text-destructive hover:text-destructive"
              >
                <X className="h-3 w-3 mr-1" />
                Clear All Filters
              </Button>
            )}
            <Button
              size="sm"
              onClick={applyFilters}
              className="w-full sm:w-auto"
            >
              <Search className="h-3 w-3 mr-1" />
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default GraphFilterPanel
