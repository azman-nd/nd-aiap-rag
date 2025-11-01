import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/Dialog'
import UploadMetadataForm, { UploadMetadata } from './UploadMetadataForm'
import SimpleFileUploader from './SimpleFileUploader'
import { toast } from 'sonner'
import { uploadDocument } from '@/api/lightrag'
import { useScheme } from '@/contexts/SchemeContext'

interface SimpleUploadDialogProps {
  onDocumentsUploaded?: () => Promise<void>
}

export default function SimpleUploadDialog({ onDocumentsUploaded }: SimpleUploadDialogProps) {
  console.log('SimpleUploadDialog: Component loaded and rendered!')
  const { t } = useTranslation()
  const { selectedScheme } = useScheme()
  console.log('SimpleUploadDialog: selectedScheme:', selectedScheme)
  const [open, setOpen] = useState(false)
  const [metadata, setMetadata] = useState<UploadMetadata>({
    project_id: '',
    owner: '',
    is_public: true,
    tags: [],
    share: []
  })

  const handleMetadataChange = useCallback((newMetadata: UploadMetadata) => {
    console.log('SimpleUploadDialog: Metadata changed to:', newMetadata)
    setMetadata(newMetadata)
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    if (!selectedScheme) {
      toast.error(t('schemeManager.upload.noSchemeSelected'))
      throw new Error('No scheme selected')
    }

    console.log('SimpleUploadDialog: Uploading file with metadata:', metadata)
    console.log('SimpleUploadDialog: File:', file.name)

    try {
      const result = await uploadDocument(file, selectedScheme.id, undefined, metadata)

      if (result.status === 'success') {
        toast.success(t('documentPanel.uploadDocuments.batch.success'))

        // Refresh document list
        if (onDocumentsUploaded) {
          await onDocumentsUploaded()
        }

        // Close dialog and reset form
        setOpen(false)
        setMetadata({
          project_id: '',
          owner: '',
          is_public: true,
          tags: [],
          share: []
        })
      } else if (result.status === 'duplicated') {
        toast.error(t('documentPanel.uploadDocuments.fileUploader.duplicateFile'))
      } else {
        toast.error(result.message || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast.error(errorMessage)
      throw error // Re-throw so SimpleFileUploader can handle it
    }
  }, [selectedScheme, metadata, t, onDocumentsUploaded])

  const handleDialogClose = useCallback((isOpen: boolean) => {
    console.log('SimpleUploadDialog: Dialog open state changing to:', isOpen)
    if (!isOpen) {
      // Reset form when dialog closes
      setMetadata({
        project_id: '',
        owner: '',
        is_public: true,
        tags: [],
        share: []
      })
    }
    setOpen(isOpen)
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        <Button variant="default" side="bottom" tooltip={t('documentPanel.uploadDocuments.tooltip')} size="sm">
          <UploadIcon /> {t('documentPanel.uploadDocuments.button')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('documentPanel.uploadDocuments.title')}</DialogTitle>
          <DialogDescription>
            {selectedScheme ? (
              <>{t('schemeManager.upload.currentScheme')}<strong>{selectedScheme.name}</strong></>
            ) : (
              t('schemeManager.upload.noSchemeMessage')
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Metadata Form */}
          <div>
            <h3 className="text-sm font-medium mb-3">{t('documentPanel.uploadDocuments.metadata.title')}</h3>
            <UploadMetadataForm
              metadata={metadata}
              onChange={handleMetadataChange}
            />
          </div>

          {/* File Upload */}
          <div>
            <h3 className="text-sm font-medium mb-3">{t('documentPanel.uploadDocuments.files.title')}</h3>
            {!selectedScheme ? (
              <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <p className="text-sm font-medium text-yellow-800">
                    No processing scheme selected
                  </p>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  Please select a processing scheme (LightRAG or RAGAnything) before uploading files.
                  Look for the scheme manager button near the upload button.
                </p>
              </div>
            ) : (
              (() => {
                try {
                  console.log('SimpleUploadDialog: Rendering SimpleFileUploader with disabled:', !selectedScheme)
                  return (
                    <SimpleFileUploader
                      onUpload={handleFileUpload}
                      disabled={!selectedScheme}
                    />
                  )
                } catch (error) {
                  console.error('SimpleUploadDialog: Error rendering SimpleFileUploader:', error)
                  return <div>Error loading file uploader: {String(error)}</div>
                }
              })()
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
