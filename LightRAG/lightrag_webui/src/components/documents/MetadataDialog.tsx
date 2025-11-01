import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'

interface MetadataDialogProps {
  isOpen: boolean
  onClose: () => void
  metadata: Record<string, any>
  filename: string
}

const formatMetadataValue = (value: any, key?: string): string => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  // Format timestamp fields
  if (key && (key.includes('time') || key.includes('timestamp') || key.includes('_at'))) {
    try {
      if (typeof value === 'string') {
        // Try to parse as ISO string
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toLocaleString()
        }
      } else if (typeof value === 'number') {
        // Determine if it's seconds or milliseconds based on magnitude
        // Timestamps after year 2000 in seconds are > 946684800
        // Timestamps in milliseconds are much larger (> 946684800000)
        let date: Date
        if (value > 946684800000) {
          // Likely milliseconds
          date = new Date(value)
        } else if (value > 946684800) {
          // Likely seconds
          date = new Date(value * 1000)
        } else {
          // Too small to be a valid timestamp, return as-is
          return String(value)
        }

        if (!isNaN(date.getTime())) {
          return date.toLocaleString()
        }
      }
    } catch (e) {
      // Fall through to default handling
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    return JSON.stringify(value, null, 2)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

const MetadataDialog: React.FC<MetadataDialogProps> = ({
  isOpen,
  onClose,
  metadata,
  filename
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Document Metadata</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{filename}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="border-b border-border pb-3 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground mb-1 capitalize">
                      {key.replace(/_/g, ' ')}
                    </h4>
                    <div className="text-sm text-muted-foreground">
                      {key === 'tags' && Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {value.map((tag: any, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs"
                            >
                              <span className="font-medium">{tag.name}</span>
                              {tag.value && <span>: {tag.value}</span>}
                            </span>
                          ))}
                        </div>
                      ) : key === 'share' && Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {value.map((entry: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-md bg-green-100 dark:bg-green-900 px-2 py-1 text-xs"
                            >
                              {entry}
                            </span>
                          ))}
                        </div>
                      ) : key === 'share_parsed' && Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {value.map((entry: any, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-md bg-green-100 dark:bg-green-900 px-2 py-1 text-xs"
                            >
                              {entry.target_type}: {entry.permission} → {entry.identifier}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs bg-muted p-2 rounded">
                          {formatMetadataValue(value, key)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MetadataDialog
