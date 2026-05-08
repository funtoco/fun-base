/**
 * Unified App & Mapping tab component for connector detail page
 * Combines app selection and field mapping into a single flow
 */

"use client"

import { useState, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { KintoneWizardModal } from "@/components/connectors/wizard/kintone-wizard-modal"
import { useKintoneWizardStore, type WizardState } from "@/components/connectors/wizard/kintone-wizard-store"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Database, Settings, ExternalLink, RefreshCw, Loader2, Plus, Edit, Trash2, Search, X, GitBranch, AlertCircle, ToggleLeft, ToggleRight } from "lucide-react"
import { type Connector } from "@/lib/types/connector"
import { buildRecordIdBatches } from "@/lib/sync/batch-utils"
import { toast } from "sonner"
import { StatusToggleDialog } from "@/components/ui/status-toggle-dialog"

const PEOPLE_IMAGE_BATCH_SIZE = 100
const PEOPLE_IMAGE_BATCH_DELAY_MS = 500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface AppMapping {
  id: string
  connector_id: string
  source_app_id: string
  source_app_name: string
  target_app_type: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Legacy fields for backward compatibility
  service_feature?: string
  kintone_app_id?: string
  kintone_app_code?: string
  kintone_app_name?: string
  description?: string
  app_type?: string
  status?: string
}

interface FieldMapping {
  id: string
  mapping_app_id: string
  kintone_field_code: string
  kintone_field_label: string
  kintone_field_type: string
  internal_field_name: string
  internal_field_type: string
  is_required: boolean
  created_at: string
  updated_at: string
}

interface KintoneApp {
  appId: number
  code: string
  name: string
  description?: string
}

interface KintoneField {
  code: string
  label: string
  type: string
  required?: boolean
}

interface ConnectorAppMappingTabProps {
  connector: Connector
  tenantId: string
  connectionStatus?: { status: string } | null
  onMappingsCountChange?: (count: number) => void
}

// Service field definitions for different features
const SERVICE_FIELDS = {
  default: [
    { name: 'name', label: '氏名', type: 'string', required: true },
    { name: 'kana', label: 'フリガナ', type: 'string', required: false },
    { name: 'nationality', label: '国籍', type: 'string', required: false },
    { name: 'dob', label: '生年月日', type: 'date', required: false },
    { name: 'phone', label: '電話番号', type: 'string', required: false },
    { name: 'email', label: 'メールアドレス', type: 'email', required: false },
    { name: 'address', label: '住所', type: 'string', required: false },
    { name: 'employee_number', label: '従業員番号', type: 'string', required: false },
    { name: 'working_status', label: '就労ステータス', type: 'string', required: false },
    { name: 'specific_skill_field', label: '特定技能分野', type: 'string', required: false },
    { name: 'residence_card_no', label: '在留カード番号', type: 'string', required: false },
    { name: 'residence_card_expiry_date', label: '在留カード有効期限', type: 'date', required: false },
    { name: 'residence_card_issued_date', label: '在留カード交付日', type: 'date', required: false }
  ]
}

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function ConnectorAppMappingTab({ connector, tenantId, connectionStatus, onMappingsCountChange }: ConnectorAppMappingTabProps) {
  // Dev logging
  if (process.env.NODE_ENV === 'development') {
    console.debug('[apps-mapping] mount', { connectorId: connector.id, isConnected: connectionStatus?.status === 'connected' })
  }
  const [appMappings, setAppMappings] = useState<AppMapping[]>([])
  const [selectedMapping, setSelectedMapping] = useState<AppMapping | null>(null)
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
  const [kintoneFields, setKintoneFields] = useState<KintoneField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAppPicker, setShowAppPicker] = useState(false)
  const openWizard = useKintoneWizardStore((s: WizardState) => s.open)
  
  // App picker modal state
  const [kintoneApps, setKintoneApps] = useState<KintoneApp[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [hasMoreApps, setHasMoreApps] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentOffset, setCurrentOffset] = useState(0)
  const [addingApp, setAddingApp] = useState<string | null>(null)
  
  // Status toggle dialog state
  const [statusToggleDialog, setStatusToggleDialog] = useState<{
    isOpen: boolean
    mapping: AppMapping | null
  }>({ isOpen: false, mapping: null })
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)
  
  // Reset addingApp state on component mount
  useEffect(() => {
    setAddingApp(null)
  }, [])

  // Notify parent component when appMappings count changes
  useEffect(() => {
    if (onMappingsCountChange) {
      onMappingsCountChange(appMappings.length)
    }
  }, [appMappings.length, onMappingsCountChange])
  const [showDestinationSelector, setShowDestinationSelector] = useState(false)
  
  // Debug showDestinationSelector state changes
  useEffect(() => {
    console.log('showDestinationSelector changed to:', showDestinationSelector)
    if (showDestinationSelector) {
      console.log('Modal should be visible now')
    }
  }, [showDestinationSelector])
  const [selectedApp, setSelectedApp] = useState<KintoneApp | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<string>('people')
  
  // Field mapping state
  const [fieldMappingValues, setFieldMappingValues] = useState<Record<string, string>>({})
  const [savingMappings, setSavingMappings] = useState(false)
  const [loadingFields, setLoadingFields] = useState(false)
  const [syncingMapping, setSyncingMapping] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<Record<string, {
    current: number
    total: number
    range: string
  }>>({})
  
  const debouncedSearch = useDebounce(searchTerm, 300)

  // Service field definitions
  const serviceFields = {
    people: {
      label: '人材一覧',
      required: [
        { name: 'full_name', label: '氏名' },
        { name: 'email', label: 'メールアドレス' }
      ],
      optional: [
        { name: 'phone', label: '電話番号' },
        { name: 'birth_date', label: '生年月日' },
        { name: 'notes', label: '備考' }
      ]
    },
    people_image: {
      label: '人材画像',
      required: [],
      optional: []
    },
    visas: {
      label: 'ビザ進捗管理',
      required: [
        { name: 'person_id', label: '人材ID' },
        { name: 'visa_type', label: 'ビザ種類' },
        { name: 'status', label: 'ステータス' },
        { name: 'expiry_date', label: '有効期限' }
      ],
      optional: [
        { name: 'remarks', label: '備考' }
      ]
    },
    meetings: {
      label: '面談記録',
      required: [
        { name: 'title', label: 'タイトル' },
        { name: 'scheduled_at', label: '面談日時' }
      ],
      optional: [
        { name: 'location', label: '場所' },
        { name: 'organizer', label: '担当者' },
        { name: 'notes', label: '備考' }
      ]
    }
  }

  const isConnected = connectionStatus?.status === 'connected'

  const loadAppMapping = async () => {
    try {
      setLoading(true)
      setError(null)
      
      if (process.env.NODE_ENV === 'development') {
        console.debug('[apps-mapping] loading app mapping for connector:', connector.id)
      }
      
      // Load app mapping directly from app_mappings table
      const response = await fetch(`/api/connectors/${connector.id}/kintone/apps`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
        throw new Error(`Failed to fetch app mapping: ${errorMessage}`)
      }
      
      const data = await response.json()
      const mappings = data.apps || []
      
      if (process.env.NODE_ENV === 'development') {
        console.debug('[apps-mapping] loaded mappings:', mappings.length, mappings)
        console.debug('[apps-mapping] mapping details:', mappings.map((m: any) => ({
          id: m.id,
          service_feature: m.service_feature,
          target_app_type: m.target_app_type,
          kintone_app_name: m.kintone_app_name
        })))
      }
      
      // Set all mappings and select the first one
      setAppMappings(mappings)
      const firstMapping = mappings.length > 0 ? mappings[0] : null
      setSelectedMapping(firstMapping)
      
      if (firstMapping) {
        await loadFieldMappings(firstMapping.id)
        // Use source_app_id for Kintone fields
        await loadKintoneFields(firstMapping.source_app_id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load app mapping'
      console.error('[apps-mapping] Error loading app mapping:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const loadFieldMappings = async (mappingId: string) => {
    try {
      const response = await fetch(`/api/connectors/${connector.id}/mappings/${mappingId}/fields`)
      if (!response.ok) {
        // Field mappings might not exist yet, that's okay
        setFieldMappings([])
        return
      }
      const data = await response.json()
      setFieldMappings(data.fields || [])
      
      // Initialize field mapping values
      const values: Record<string, string> = {}
      data.fields?.forEach((field: FieldMapping) => {
        values[field.internal_field_name] = field.kintone_field_code
      })
      setFieldMappingValues(values)
    } catch (err) {
      console.error('Failed to load field mappings:', err)
      setFieldMappings([])
    }
  }

  const loadKintoneFields = async (appId: string) => {
    try {
      setLoadingFields(true)
      const response = await fetch(`/api/connectors/${connector.id}/kintone/apps/${appId}/fields`)
      if (!response.ok) {
        throw new Error('Failed to fetch Kintone fields')
      }
      const data = await response.json()
      setKintoneFields(data.fields || [])
    } catch (err) {
      console.error('Failed to load Kintone fields:', err)
      setKintoneFields([])
    } finally {
      setLoadingFields(false)
    }
  }

  const fetchKintoneApps = useCallback(async (search: string = '', offset: number = 0, append: boolean = false) => {
    try {
      if (offset === 0) {
        setModalLoading(true)
      } else {
        setLoadingMore(true)
      }
      
      const url = `/api/connectors/${connector.id}/kintone/apps?source=kintone&limit=30&offset=${offset}${search ? `&q=${encodeURIComponent(search)}` : ''}`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch apps')
      }
      
      const data = await response.json()
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[fetchKintoneApps] Response data:', data)
        console.log('[fetchKintoneApps] Apps array:', data.apps)
        console.log('[fetchKintoneApps] Apps length:', data.apps?.length || 0)
      }
      
      if (append) {
        setKintoneApps(prev => [...prev, ...(data.apps || [])])
      } else {
        setKintoneApps(data.apps || [])
      }
      
      setHasMoreApps(data.hasMore || false)
      setCurrentOffset(offset)
    } catch (error) {
      console.error('Error fetching apps:', error)
      
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('OAuth token is invalid') || error.message.includes('expired')) {
          toast.error('OAuth認証が必要です', {
            description: 'Kintoneに再接続してください。トークンが期限切れまたは無効です。'
          })
        } else if (error.message.includes('OAuth scope insufficient')) {
          toast.error('権限が不足しています', {
            description: 'k:app:readスコープが必要です。Kintoneに再接続して適切な権限を付与してください。'
          })
        } else if (error.message.includes('Missing scope')) {
          toast.error('権限が不足しています', {
            description: 'k:app:readスコープが必要です。OAuth設定を確認してください。'
          })
        } else {
          toast.error('アプリの取得に失敗しました', {
            description: error.message
          })
        }
      } else {
        toast.error('アプリの取得に失敗しました', {
          description: 'Unknown error'
        })
      }
    } finally {
      setModalLoading(false)
      setLoadingMore(false)
    }
  }, [connector.id])

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMoreApps) {
      fetchKintoneApps(debouncedSearch, currentOffset + 30, true)
    }
  }, [fetchKintoneApps, debouncedSearch, currentOffset, loadingMore, hasMoreApps])

  const handleAddApp = (app: KintoneApp) => {
    console.log('handleAddApp called with app:', app)
    console.log('Current addingApp state:', addingApp)
    console.log('Setting selectedApp and showDestinationSelector to true')
    
    // Use flushSync to ensure state updates are processed immediately
    flushSync(() => {
      setSelectedApp(app)
      setShowDestinationSelector(true)
    })
    console.log('State updated, showDestinationSelector should be true')
  }

  const handleConfirmAddApp = async () => {
    if (!selectedApp) {
      return
    }

    try {
      setAddingApp(String(selectedApp.appId))
      
      const response = await fetch(`/api/connectors/${connector.id}/kintone/apps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_mapping',
          appId: selectedApp.appId,
          appName: selectedApp.name,
          appCode: selectedApp.code,
          serviceFeature: selectedDestination
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add app')
      }
      
      const data = await response.json()
      toast.success('アプリを追加しました', {
        description: `${selectedApp.name} を${serviceFields[selectedDestination as keyof typeof serviceFields].label}に追加しました`
      })
      
      setSelectedMapping(data.mapping)
      setShowAppPicker(false)
      setShowDestinationSelector(false)
      setSelectedApp(null)
      
      // Load fields for the new app
      await loadKintoneFields(String(selectedApp.appId))
      
      // Reset field mappings
      setFieldMappings([])
      setFieldMappingValues({})
    } catch (error) {
      console.error('Error adding app:', error)
      toast.error('アプリの追加に失敗しました', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setAddingApp(null)
    }
  }

  const handleSaveFieldMappings = async () => {
    if (!selectedMapping) return
    
    try {
      setSavingMappings(true)
      
      const response = await fetch(`/api/connectors/${connector.id}/mappings/${selectedMapping.id}/fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fieldMappings: Object.entries(fieldMappingValues).map(([internalField, kintoneField]) => ({
            internal_field_name: internalField,
            kintone_field_code: kintoneField,
            kintone_field_label: kintoneFields.find(f => f.code === kintoneField)?.label || '',
            kintone_field_type: kintoneFields.find(f => f.code === kintoneField)?.type || '',
            is_required: serviceFields[selectedMapping.service_feature as keyof typeof serviceFields]?.required.find(f => f.name === internalField) !== undefined
          }))
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save field mappings')
      }
      
      toast.success('フィールドマッピングを保存しました')
      await loadFieldMappings(selectedMapping.id)
    } catch (error) {
      console.error('Error saving field mappings:', error)
      toast.error('フィールドマッピングの保存に失敗しました', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setSavingMappings(false)
    }
  }

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      console.log('Deleting mapping:', { mappingId, connectorId: connector.id })
      const response = await fetch(`/api/connectors/${connector.id}/kintone/mappings/${mappingId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete mapping')
      }
      toast.success('マッピングを削除しました')
      
      // Update state
      setAppMappings(prev => prev.filter(m => m.id !== mappingId))
      if (selectedMapping?.id === mappingId) {
        setSelectedMapping(null)
        setFieldMappings([])
        setFieldMappingValues({})
        setKintoneFields([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete mapping'
      toast.error("マッピングの削除に失敗しました", {
        description: errorMessage
      })
    }
  }

  const fetchMaxRecordId = async (appMappingId: string): Promise<number> => {
    const response = await fetch(`/api/connectors/${connector.id}/sync?appMappingId=${encodeURIComponent(appMappingId)}&metric=maxRecordId`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to fetch max Kintone record id')
    }

    const data = await response.json()
    const maxRecordId = Number(data.maxRecordId)

    if (!Number.isInteger(maxRecordId) || maxRecordId < 1) {
      throw new Error('Kintone app has no syncable records')
    }

    return maxRecordId
  }

  const runSyncRequest = async (
    mappingId: string,
    range?: { from: number; to: number }
  ) => {
    const response = await fetch(`/api/connectors/${connector.id}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId,
        force: true,
        appMappingId: mappingId,
        ...(range ? {
          recordIdFrom: String(range.from),
          recordIdTo: String(range.to)
        } : {})
      })
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.error || 'Failed to start sync')
    }

    if (result.success === false) {
      const detail = Array.isArray(result.errors) && result.errors.length > 0
        ? result.errors.join('; ')
        : 'Sync completed with errors'
      throw new Error(detail)
    }

    return result
  }

  const handlePeopleImageBatchSync = async (mapping: AppMapping) => {
    const maxRecordId = await fetchMaxRecordId(mapping.id)
    const batches = buildRecordIdBatches(1, maxRecordId, PEOPLE_IMAGE_BATCH_SIZE)
    let totalSynced = 0

    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index]
      setSyncProgress(prev => ({
        ...prev,
        [mapping.id]: {
          current: index + 1,
          total: batches.length,
          range: `${batch.from}-${batch.to}`
        }
      }))

      const result = await runSyncRequest(mapping.id, batch)
      totalSynced += Number(result.synced?.people_image || 0)

      if (index < batches.length - 1) {
        await sleep(PEOPLE_IMAGE_BATCH_DELAY_MS)
      }
    }

    toast.success('画像連携が完了しました', {
      description: `${batches.length} batch / ${totalSynced}件を更新しました`
    })
  }

  const handleStartSync = async (mapping: AppMapping) => {
    try {
      setSyncingMapping(mapping.id)

      if (mapping.target_app_type === 'people_image') {
        await handlePeopleImageBatchSync(mapping)
        return
      }

      const result = await runSyncRequest(mapping.id)
      toast.success('連携を開始しました', {
        description: 'データの同期処理が完了しました'
      })

      console.log('Sync completed:', result)
    } catch (error) {
      console.error('Error starting sync:', error)
      toast.error('連携の開始に失敗しました', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setSyncingMapping(null)
      setSyncProgress(prev => {
        const next = { ...prev }
        delete next[mapping.id]
        return next
      })
    }
  }

  const handleStatusToggle = (mapping: AppMapping) => {
    setStatusToggleDialog({ isOpen: true, mapping })
  }

  const handleConfirmStatusToggle = async () => {
    const { mapping } = statusToggleDialog
    if (!mapping) return

    try {
      setTogglingStatus(mapping.id)
      
      const endpoint = mapping.is_active 
        ? `/api/connectors/${connector.id}/mappings/${mapping.id}/deactivate`
        : `/api/connectors/${connector.id}/mappings/${mapping.id}/activate`
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to toggle status')
      }
      
      // Update local state
      setAppMappings(prev => 
        prev.map(m => 
          m.id === mapping.id 
            ? { ...m, is_active: !m.is_active }
            : m
        )
      )
      
      const action = mapping.is_active ? '無効化' : '有効化'
      toast.success(`マッピングを${action}しました`, {
        description: `${mapping.source_app_name || mapping.kintone_app_name} のマッピングが${action}されました`
      })
      
    } catch (error) {
      console.error('Error toggling status:', error)
      const action = mapping.is_active ? '無効化' : '有効化'
      toast.error(`マッピングの${action}に失敗しました`, {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setTogglingStatus(null)
    }
  }

  const getFieldTypeCompatibility = (serviceFieldType: string, kintoneFieldType: string) => {
    const typeMap: Record<string, string[]> = {
      'string': ['SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT'],
      'email': ['SINGLE_LINE_TEXT'],
      'date': ['DATE', 'DATETIME'],
      'number': ['NUMBER', 'CALC'],
      'boolean': ['CHECK_BOX', 'RADIO_BUTTON']
    }
    
    return typeMap[serviceFieldType]?.includes(kintoneFieldType) || false
  }

  const getValidationErrors = () => {
    const errors: string[] = []
    const currentServiceFields = serviceFields[selectedMapping?.target_app_type as keyof typeof serviceFields]
    
    if (currentServiceFields) {
      currentServiceFields.required.forEach(field => {
        if (!fieldMappingValues[field.name]) {
          errors.push(`${field.label} は必須です`)
        }
      })
    }
    
    return errors
  }

  useEffect(() => {
    if (isConnected) {
      loadAppMapping()
    } else {
      setLoading(false)
    }
  }, [connector.id, isConnected])

  // Listen for mapping events
  useEffect(() => {
    const handleMappingActivated = () => {
      loadAppMapping()
    }
    
    const handleMappingUpdated = () => {
      loadAppMapping()
    }

    window.addEventListener('mapping:activated', handleMappingActivated)
    window.addEventListener('mapping:updated', handleMappingUpdated)

    return () => {
      window.removeEventListener('mapping:activated', handleMappingActivated)
      window.removeEventListener('mapping:updated', handleMappingUpdated)
    }
  }, [])


  useEffect(() => {
    if (showAppPicker) {
      setCurrentOffset(0)
      fetchKintoneApps(debouncedSearch, 0, false)
    }
  }, [showAppPicker, debouncedSearch, fetchKintoneApps])


  if (connector.provider !== 'kintone') {
    return (
      <>
        <EmptyState
          icon={<Database className="h-12 w-12" />}
          title="Kintone プロバイダーではありません"
          description={`このコネクターは ${connector.provider} プロバイダーです`}
        />
        <KintoneWizardModal />
      </>
    )
  }

  if (!isConnected) {
    return (
      <>
        <EmptyState
          icon={<Database className="h-12 w-12" />}
          title="コネクターが未接続です"
          description="Kintone に接続してからアプリを追加してください"
          action={
            <Button disabled title="先に接続してください">
              <Plus className="h-4 w-4 mr-2" />
              Kintone から追加
            </Button>
          }
        />
        <KintoneWizardModal />
      </>
    )
  }

  if (loading) {
    return (
      <>
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>マッピングを読み込み中...</span>
          </CardContent>
        </Card>
        <KintoneWizardModal />
      </>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        {/* Header with primary CTA */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span className="text-lg font-semibold">アプリ＆マッピング</span>
          </div>
          <Button onClick={() => {
            openWizard({ connectorId: connector.id, tenantId })
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Kintone から追加
          </Button>
        </div>
        
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <div className="text-red-600">エラー: {error}</div>
              <div className="text-sm text-muted-foreground">
                既存のマッピングを読み込めませんでしたが、新しいアプリを追加することは可能です。
              </div>
              <div className="flex items-center justify-center space-x-2">
                <Button onClick={loadAppMapping} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  再試行
                </Button>
                <Button onClick={() => setShowAppPicker(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Kintone から追加
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* App Picker Modal */}
        <Dialog open={showAppPicker} onOpenChange={setShowAppPicker}>
          <DialogContent className="max-w-xl max-h-[70vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Kintone からアプリを追加</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="アプリ名、コード、またはIDで検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Apps List */}
              <ScrollArea className="h-64">
                {modalLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>アプリを読み込み中...</span>
                  </div>
                ) : kintoneApps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    アプリが見つかりませんでした
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kintoneApps.map((app) => (
                      <div
                        key={app.appId}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddApp(app)
                        }}
                      >
                        <div className="space-y-2">
                          <h4 className="font-medium truncate">{app.name}</h4>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              ID: {app.appId}
                            </Badge>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAddApp(app)
                              }}
                              disabled={addingApp === String(app.appId)}
                            >
                              {addingApp === String(app.appId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-1" />
                                  追加
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              {/* Load More Button */}
              {hasMoreApps && !modalLoading && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        読み込み中...
                      </>
                    ) : (
                      'さらに読み込む'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Destination Selector Modal */}
        {showDestinationSelector && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center space-x-2 mb-4">
                <Database className="h-5 w-5" />
                <h2 className="text-lg font-semibold">マッピング先を選択</h2>
              </div>
            
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedApp?.name || 'Unknown App'} をどの機能にマッピングしますか？
              </div>
              
              <div className="space-y-3">
                {Object.entries(serviceFields).map(([key, config]) => (
                  <label
                    key={key}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="destination"
                      value={key}
                      checked={selectedDestination === key}
                      onChange={(e) => setSelectedDestination(e.target.value)}
                      className="h-4 w-4"
                    />
                    <div>
                      <div className="font-medium">{config.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {config.required.length} 必須フィールド, {config.optional.length} オプションフィールド
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDestinationSelector(false)
                    setSelectedApp(null)
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleConfirmAddApp}
                  disabled={addingApp !== null || !selectedApp}
                >
                  {addingApp ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      追加中...
                    </>
                  ) : (
                    '追加'
                  )}
                </Button>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Step 1: No app mapping - show empty state
  if (appMappings.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header with primary CTA */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span className="text-lg font-semibold">アプリ＆マッピング</span>
          </div>
          <Button onClick={() => {
            openWizard({ connectorId: connector.id, tenantId })
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Kintone から追加
          </Button>
        </div>
        
        <EmptyState
          icon={<Database className="h-12 w-12" />}
          title="アプリマッピングがありません"
          description="Kintone からアプリを選択してマッピングを作成します"
          action={
            <Button onClick={() => {
              openWizard({ connectorId: connector.id, tenantId })
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Kintone から追加
            </Button>
          }
        />
        
        {/* App Picker Modal */}
      <Dialog open={showAppPicker} onOpenChange={setShowAppPicker}>
          <DialogContent className="max-w-xl max-h-[70vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Kintone からアプリを追加</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="アプリ名、コード、またはIDで検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Apps List */}
              <ScrollArea className="h-64">
                {modalLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>アプリを読み込み中...</span>
                  </div>
                ) : kintoneApps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    アプリが見つかりませんでした
                  </div>
                ) : (
                  <div className="space-y-2">
                    {kintoneApps.map((app) => (
                      <div
                        key={app.appId}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddApp(app)
                        }}
                      >
                        <div className="space-y-2">
                          <h4 className="font-medium truncate">{app.name}</h4>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              ID: {app.appId}
                            </Badge>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAddApp(app)
                              }}
                              disabled={addingApp === String(app.appId)}
                            >
                              {addingApp === String(app.appId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-1" />
                                  追加
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              {/* Load More Button */}
              {hasMoreApps && !modalLoading && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        読み込み中...
                      </>
                    ) : (
                      'さらに読み込む'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <KintoneWizardModal />
      </div>
    )
  }

  // Step 2: App mappings exist - show table and always show add button
  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span className="text-lg font-semibold">アプリ＆マッピング</span>
          <Badge variant="secondary">{appMappings.length}</Badge>
        </div>
        <Button onClick={() => {
          openWizard({ connectorId: connector.id, tenantId })
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Kintone から追加
        </Button>
      </div>

      {/* Mappings Table */}
      <Card>
        <CardHeader>
          <CardTitle>アプリマッピング一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>アプリ名</TableHead>
                <TableHead>アプリID</TableHead>
                <TableHead>マッピング先</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>作成日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appMappings.map((mapping) => (
                <TableRow 
                  key={mapping.id}
                  className={selectedMapping?.id === mapping.id ? "bg-muted/50" : ""}
                  onClick={() => {
                    setSelectedMapping(mapping)
                    loadFieldMappings(mapping.id)
                    loadKintoneFields(mapping.source_app_id)
                  }}
                >
                  <TableCell className="font-medium">
                    {mapping.source_app_name || mapping.kintone_app_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {mapping.source_app_id || mapping.kintone_app_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {serviceFields[mapping.target_app_type as keyof typeof serviceFields]?.label || mapping.target_app_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={mapping.is_active ? "default" : "secondary"}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStatusToggle(mapping)
                      }}
                      disabled={togglingStatus === mapping.id}
                      className="flex items-center space-x-1"
                    >
                      {togglingStatus === mapping.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : mapping.is_active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                      <span>{mapping.is_active ? "有効" : "無効"}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(mapping.created_at).toLocaleDateString('ja-JP')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          openWizard({ 
                            connectorId: connector.id, 
                            tenantId,
                            editMode: true,
                            existingMapping: mapping
                          })
                        }}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        フィールド編集
                      </Button>
                      {mapping.is_active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartSync(mapping)
                          }}
                          disabled={syncingMapping === mapping.id}
                        >
                          {syncingMapping === mapping.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          {syncingMapping === mapping.id
                            ? (syncProgress[mapping.id]
                              ? `連携中 ${syncProgress[mapping.id].current}/${syncProgress[mapping.id].total}`
                              : '連携中...')
                            : '連携開始'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteMapping(mapping.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        削除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* App Picker Modal (for changing app) */}
      <Dialog open={showAppPicker} onOpenChange={setShowAppPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>Kintone からアプリを変更</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="アプリ名、コード、またはIDで検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Apps List */}
            <ScrollArea className="h-64">
              {modalLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>アプリを読み込み中...</span>
                </div>
              ) : kintoneApps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  アプリが見つかりませんでした
                </div>
              ) : (
                <div className="space-y-2">
                  {kintoneApps.map((app) => (
                    <div
                      key={app.appId}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddApp(app)
                      }}
                    >
                      <div className="space-y-2">
                        <h4 className="font-medium truncate">{app.name}</h4>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            ID: {app.appId}
                          </Badge>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddApp(app)
                            }}
                            disabled={addingApp === String(app.appId)}
                          >
                            {addingApp === String(app.appId) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Plus className="h-4 w-4 mr-1" />
                                変更
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <KintoneWizardModal />
      
      {/* Status Toggle Dialog */}
      <StatusToggleDialog
        isOpen={statusToggleDialog.isOpen}
        onClose={() => setStatusToggleDialog({ isOpen: false, mapping: null })}
        onConfirm={handleConfirmStatusToggle}
        currentStatus={statusToggleDialog.mapping?.is_active ?? false}
        appName={statusToggleDialog.mapping?.source_app_name || statusToggleDialog.mapping?.kintone_app_name || ''}
        isLoading={togglingStatus === statusToggleDialog.mapping?.id}
      />
    </div>
  )
}
