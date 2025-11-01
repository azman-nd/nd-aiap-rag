import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Label from '@/components/ui/Label'
import Checkbox from '@/components/ui/Checkbox'
import Badge from '@/components/ui/Badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TagFormValue = {
  name: string
  value?: string
}

export type ShareFormValue = {
  target_type: 'user' | 'role'
  permission: 'view' | 'edit'
  identifier: string
}

export interface UploadMetadata {
  project_id?: string
  owner?: string
  is_public: boolean
  tags: TagFormValue[]
  share: ShareFormValue[]
}

interface UploadMetadataFormProps {
  metadata: UploadMetadata
  onChange: (metadata: UploadMetadata) => void
  className?: string
}

export default function UploadMetadataForm({
  metadata,
  onChange,
  className
}: UploadMetadataFormProps) {
  const { t } = useTranslation()
  const [newTag, setNewTag] = useState<TagFormValue>({ name: '', value: '' })
  const [newShare, setNewShare] = useState<ShareFormValue>({
    target_type: 'user',
    permission: 'view',
    identifier: ''
  })

  const addTag = () => {
    const name = newTag.name.trim()
    if (!name) return
    const value = newTag.value?.trim()
    const exists = metadata.tags.some((tag) => tag.name === name && (tag.value || '') === (value || ''))
    if (!exists) {
      onChange({
        ...metadata,
        tags: [...metadata.tags, { name, value }]
      })
      setNewTag({ name: '', value: '' })
    }
  }

  const removeTag = (tagToRemove: TagFormValue) => {
    onChange({
      ...metadata,
      tags: metadata.tags.filter(tag => !(tag.name === tagToRemove.name && (tag.value || '') === (tagToRemove.value || '')))
    })
  }

  const addShare = () => {
    const identifier = newShare.identifier.trim()
    if (!identifier) return
    const exists = metadata.share.some((entry) =>
      entry.identifier === identifier && entry.permission === newShare.permission && entry.target_type === newShare.target_type
    )
    if (!exists) {
      onChange({
        ...metadata,
        share: [...metadata.share, { ...newShare, identifier }]
      })
      setNewShare({ ...newShare, identifier: '' })
    }
  }

  const removeShare = (entryToRemove: ShareFormValue) => {
    onChange({
      ...metadata,
      share: metadata.share.filter((entry) =>
        !(
          entry.identifier === entryToRemove.identifier &&
          entry.permission === entryToRemove.permission &&
          entry.target_type === entryToRemove.target_type
        )
      )
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      action()
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Label htmlFor="project_id">
          {t('documentPanel.uploadDocuments.metadata.projectId')}
        </Label>
        <Input
          id="project_id"
          placeholder={t('documentPanel.uploadDocuments.metadata.projectIdPlaceholder')}
          value={metadata.project_id || ''}
          onChange={(e) => onChange({ ...metadata, project_id: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="owner_id">
          {t('documentPanel.uploadDocuments.metadata.ownerLabel')}
        </Label>
        <Input
          id="owner_id"
          placeholder={t('documentPanel.uploadDocuments.metadata.ownerPlaceholder')}
          value={metadata.owner || ''}
          onChange={(e) => onChange({ ...metadata, owner: e.target.value || undefined })}
        />
        <p className="text-xs text-muted-foreground">
          {t('documentPanel.uploadDocuments.metadata.ownerHelper')}
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_public"
          checked={metadata.is_public}
          onCheckedChange={(checked) => onChange({ ...metadata, is_public: !!checked })}
        />
        <Label htmlFor="is_public">
          {t('documentPanel.uploadDocuments.metadata.isPublic')}
        </Label>
      </div>

      <div className="space-y-2">
        <Label>{t('documentPanel.uploadDocuments.metadata.tags')}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t('documentPanel.uploadDocuments.metadata.tagNamePlaceholder')}
            value={newTag.name}
            onChange={(e) => setNewTag((prev) => ({ ...prev, name: e.target.value }))}
            onKeyPress={(e) => handleKeyPress(e, addTag)}
          />
          <Input
            placeholder={t('documentPanel.uploadDocuments.metadata.tagValuePlaceholder')}
            value={newTag.value || ''}
            onChange={(e) => setNewTag((prev) => ({ ...prev, value: e.target.value }))}
            onKeyPress={(e) => handleKeyPress(e, addTag)}
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('documentPanel.uploadDocuments.metadata.tagsHelper')}
        </p>
        {metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {metadata.tags.map((tag) => (
              <Badge
                key={`${tag.name}:${tag.value || ''}`}
                variant="secondary"
                className="flex items-center gap-1"
              >
                <span className="font-medium">{tag.name}</span>
                {tag.value && <span className="text-muted-foreground">= {tag.value}</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('documentPanel.uploadDocuments.metadata.share')}</Label>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              value={newShare.target_type}
              onValueChange={(value: 'user' | 'role') =>
                setNewShare((prev) => ({ ...prev, target_type: value }))
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue placeholder={t('documentPanel.uploadDocuments.metadata.shareTargetPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('documentPanel.uploadDocuments.metadata.shareTargetUser')}</SelectItem>
                <SelectItem value="role">{t('documentPanel.uploadDocuments.metadata.shareTargetRole')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={newShare.permission}
              onValueChange={(value: 'view' | 'edit') =>
                setNewShare((prev) => ({ ...prev, permission: value }))
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue placeholder={t('documentPanel.uploadDocuments.metadata.sharePermissionPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{t('documentPanel.uploadDocuments.metadata.sharePermissionView')}</SelectItem>
                <SelectItem value="edit">{t('documentPanel.uploadDocuments.metadata.sharePermissionEdit')}</SelectItem>
              </SelectContent>
            </Select>

            <Input
              className="flex-1"
              placeholder={t('documentPanel.uploadDocuments.metadata.shareIdentifierPlaceholder')}
              value={newShare.identifier}
              onChange={(e) => setNewShare((prev) => ({ ...prev, identifier: e.target.value }))}
              onKeyPress={(e) => handleKeyPress(e, addShare)}
            />

            <Button type="button" variant="outline" size="sm" onClick={addShare}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('documentPanel.uploadDocuments.metadata.shareHelper')}
          </p>
        </div>
        {metadata.share.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {metadata.share.map((entry) => (
              <Badge
                key={`${entry.target_type}:${entry.permission}:${entry.identifier}`}
                variant={entry.permission === 'edit' ? 'destructive' : 'outline'}
                className="flex items-center gap-1"
              >
                <span>
                  {entry.target_type}:{entry.permission}:{entry.identifier}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => removeShare(entry)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
