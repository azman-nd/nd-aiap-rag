import React, { useState, useCallback } from 'react'
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface FileWithStatus {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface SimpleFileUploaderProps {
  onUpload: (file: File, metadata: any) => Promise<void>
  onReject?: (file: File, error: string) => void
  disabled?: boolean
  maxSize?: number
  acceptedTypes?: string[]
  className?: string
  multiple?: boolean
}

export default function SimpleFileUploader({
  onUpload,
  onReject,
  disabled = false,
  maxSize = 200 * 1024 * 1024, // 200MB default
  acceptedTypes = ['.pdf', '.docx', '.txt', '.md'],
  className,
  multiple = true // Enable multiple file uploads by default
}: SimpleFileUploaderProps) {
  console.log('SimpleFileUploader: Component rendered, disabled:', disabled, 'multiple:', multiple)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileWithStatus[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize) {
      return `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`
    }

    // Check file type
    const fileExt = `.${file.name.split('.').pop()?.toLowerCase() || ''}`
    if (!acceptedTypes.includes(fileExt)) {
      return `File type ${fileExt} is not supported. Supported types: ${acceptedTypes.join(', ')}`
    }

    return null
  }

  const handleFileSelect = useCallback((files: File[]) => {
    console.log('SimpleFileUploader: Files selected:', files.length)
    setError(null)

    const newFiles: FileWithStatus[] = []

    for (const file of files) {
      const validationError = validateFile(file)
      if (validationError) {
        console.log('SimpleFileUploader: Validation error for', file.name, ':', validationError)
        onReject?.(file, validationError)
        newFiles.push({
          file,
          status: 'error',
          error: validationError
        })
      } else {
        console.log('SimpleFileUploader: File validated successfully:', file.name)
        newFiles.push({
          file,
          status: 'pending'
        })
      }
    }

    setSelectedFiles(prev => [...prev, ...newFiles])
  }, [maxSize, acceptedTypes, onReject])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    console.log('SimpleFileUploader: File dropped, disabled:', disabled, 'uploading:', uploading)

    if (disabled || uploading) return

    const files = Array.from(e.dataTransfer.files)
    console.log('SimpleFileUploader: Dropped files:', files.length)
    if (files.length > 0) {
      handleFileSelect(multiple ? files : [files[0]])
    }
  }, [disabled, uploading, handleFileSelect, multiple])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(Array.from(files))
    }
    // Reset input so same files can be selected again
    e.target.value = ''
  }, [handleFileSelect])

  const handleUpload = useCallback(async () => {
    const filesToUpload = selectedFiles.filter(f => f.status === 'pending')
    if (filesToUpload.length === 0) {
      console.log('SimpleFileUploader: No files to upload')
      return
    }

    console.log('SimpleFileUploader: Starting upload for', filesToUpload.length, 'files')
    setUploading(true)
    setError(null)

    // Upload files sequentially
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileWithStatus = filesToUpload[i]
      const fileIndex = selectedFiles.findIndex(f => f.file === fileWithStatus.file)

      // Update status to uploading
      setSelectedFiles(prev => {
        const updated = [...prev]
        updated[fileIndex] = { ...updated[fileIndex], status: 'uploading' }
        return updated
      })

      try {
        console.log(`SimpleFileUploader: Uploading file ${i + 1}/${filesToUpload.length}:`, fileWithStatus.file.name)
        await onUpload(fileWithStatus.file, {})
        console.log('SimpleFileUploader: Upload successful for', fileWithStatus.file.name)

        // Update status to success
        setSelectedFiles(prev => {
          const updated = [...prev]
          updated[fileIndex] = { ...updated[fileIndex], status: 'success' }
          return updated
        })
      } catch (err) {
        console.error('SimpleFileUploader: Upload failed for', fileWithStatus.file.name, err)
        const errorMessage = err instanceof Error ? err.message : 'Upload failed'

        // Update status to error
        setSelectedFiles(prev => {
          const updated = [...prev]
          updated[fileIndex] = { ...updated[fileIndex], status: 'error', error: errorMessage }
          return updated
        })
      }
    }

    setUploading(false)
  }, [selectedFiles, onUpload])

  const removeFile = useCallback((fileToRemove: File) => {
    setSelectedFiles(prev => prev.filter(f => f.file !== fileToRemove))
    setError(null)
  }, [])

  const clearAll = useCallback(() => {
    setSelectedFiles([])
    setError(null)
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: FileWithStatus['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />
      case 'uploading':
        return <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />
    }
  }

  const pendingCount = selectedFiles.filter(f => f.status === 'pending').length
  const uploadingCount = selectedFiles.filter(f => f.status === 'uploading').length
  const successCount = selectedFiles.filter(f => f.status === 'success').length

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragActive && !disabled ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer hover:border-primary hover:bg-primary/5"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          console.log('SimpleFileUploader: Drop zone clicked, disabled:', disabled, 'uploading:', uploading)
          if (!disabled && !uploading) {
            document.getElementById('file-input')?.click()
          }
        }}
      >
        <input
          id="file-input"
          type="file"
          className="hidden"
          accept={acceptedTypes.join(',')}
          onChange={handleFileInput}
          disabled={disabled || uploading}
          multiple={multiple}
        />

        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {dragActive
                ? `Drop file${multiple ? 's' : ''} here`
                : `Click to upload or drag and drop${multiple ? ' (multiple files supported)' : ''}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {acceptedTypes.join(', ')} (max {Math.round(maxSize / 1024 / 1024)}MB per file)
            </p>
          </div>
        </div>
      </div>

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
              {successCount > 0 && <span className="text-green-600 ml-2">✓ {successCount} uploaded</span>}
            </p>
            {!uploading && selectedFiles.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={disabled}
              >
                Clear All
              </Button>
            )}
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {selectedFiles.map((fileWithStatus, index) => (
              <div
                key={`${fileWithStatus.file.name}-${index}`}
                className={cn(
                  "flex items-center gap-3 p-3 border rounded-lg",
                  fileWithStatus.status === 'success' && "bg-green-50 border-green-200",
                  fileWithStatus.status === 'error' && "bg-red-50 border-red-200",
                  fileWithStatus.status === 'uploading' && "bg-blue-50 border-blue-200",
                  fileWithStatus.status === 'pending' && "bg-muted/50"
                )}
              >
                {getStatusIcon(fileWithStatus.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{fileWithStatus.file.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(fileWithStatus.file.size)}
                    </p>
                    {fileWithStatus.status === 'uploading' && (
                      <p className="text-xs text-blue-600">Uploading...</p>
                    )}
                    {fileWithStatus.status === 'success' && (
                      <p className="text-xs text-green-600">Uploaded successfully</p>
                    )}
                  </div>
                  {fileWithStatus.error && (
                    <p className="text-xs text-red-600 mt-1">{fileWithStatus.error}</p>
                  )}
                </div>
                {!uploading && fileWithStatus.status !== 'uploading' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(fileWithStatus.file)}
                    disabled={disabled}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 border border-red-200 rounded-lg bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Upload button */}
      {pendingCount > 0 && (
        <Button
          onClick={handleUpload}
          disabled={disabled || uploading}
          className="w-full"
        >
          {uploading
            ? `Uploading ${uploadingCount} of ${pendingCount} file${pendingCount > 1 ? 's' : ''}...`
            : `Upload ${pendingCount} File${pendingCount > 1 ? 's' : ''}`}
        </Button>
      )}
    </div>
  )
}
