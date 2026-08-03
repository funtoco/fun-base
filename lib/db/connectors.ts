/**
 * Database helpers for new connector system
 */

import { createClient } from '@supabase/supabase-js'
import { encryptJson, decryptJson } from '@/lib/crypto/secretStore'
import { decryptJson as decryptLegacyJson } from '@/lib/security/crypto'

// Server-side Supabase client
function getServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase configuration')
  }
  
  // Detect if this is a new API key format (sb_secret_...)
  const isNewApiKeyFormat = serviceKey.startsWith('sb_secret_')
  
  if (isNewApiKeyFormat) {
    // New API key format - configure for new format
    return createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    })
  } else {
    // Legacy JWT format - use standard configuration
    return createClient(supabaseUrl, serviceKey)
  }
}

// Types
export interface Connector {
  id: string
  tenant_id: string | null
  provider: string
  display_name: string
  created_at: string
  updated_at: string
}

export interface Credential {
  id: string
  connector_id: string
  type: string
  payload_encrypted: Buffer
  created_at: string
  updated_at: string
}

export interface ConnectionStatus {
  id: string
  connector_id: string
  status: 'connected' | 'disconnected' | 'error'
  last_error?: string
  updated_at: string
}

export interface ConnectorWithSecrets extends Connector {
  secrets?: {
    client_id: string
    client_secret: string
  }
}

// Connector operations
export async function createConnector(data: {
  tenant_id: string | null
  provider: string
  display_name: string
}): Promise<string> {
  const supabase = getServerClient()
  
  const { data: connector, error } = await supabase
    .from('connectors')
    .insert(data)
    .select('id')
    .single()
  
  if (error || !connector) {
    throw new Error(`Failed to create connector: ${error?.message}`)
  }
  
  return connector.id
}

export async function getConnector(connectorId: string): Promise<Connector | null> {
  const supabase = getServerClient()
  
  const { data, error } = await supabase
    .from('connectors')
    .select()
    .eq('id', connectorId)
    .single()
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get connector: ${error.message}`)
  }
  
  return data
}

export async function listConnectors(tenantId: string): Promise<Connector[]> {
  const supabase = getServerClient()
  
  const { data, error } = await supabase
    .from('connectors')
    .select()
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(`Failed to list connectors: ${error.message}`)
  }
  
  return data || []
}

export async function listAllConnectors(): Promise<Connector[]> {
  const supabase = getServerClient()
  
  const { data, error } = await supabase
    .from('connectors')
    .select()
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(`Failed to list all connectors: ${error.message}`)
  }
  
  return data || []
}

// Credential operations
export async function storeCredential(connectorId: string, type: string, data: any): Promise<void> {
  const supabase = getServerClient()
  
  const encrypted = encryptJson(data)
  
  const { error } = await supabase
    .from('credentials')
    .insert({
      connector_id: connectorId,
      type,
      payload_encrypted: encrypted.toString('base64')
    })
  
  if (error) {
    throw new Error(`Failed to store credential: ${error.message}`)
  }
}

export async function getCredential(connectorId: string, type: string): Promise<any | null> {
  const supabase = getServerClient()
  
  const { data, error } = await supabase
    .from('credentials')
    .select('payload, payload_encrypted, format')
    .eq('connector_id', connectorId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get credential: ${error.message}`)
  }
  
  if (!data) {
    return null
  }
  
  // Try payload first (plain text JSON)
  if (data.payload) {
    try {
      return JSON.parse(data.payload)
    } catch (error) {
      console.error('Failed to parse payload as JSON:', error)
    }
  }
  
  // Fallback to payload_encrypted
  if (data.payload_encrypted) {
    try {
      // Try to decrypt first
      return decryptJson(data.payload_encrypted)
    } catch (error) {
      try {
        return decryptLegacyJson(data.payload_encrypted)
      } catch {
        // If decryption fails, try to parse as plain text (base64 encoded JSON)
        try {
          const plainText = Buffer.from(data.payload_encrypted, 'base64').toString('utf8')
          return JSON.parse(plainText)
        } catch (parseError) {
          throw new Error(
            `Failed to decrypt or parse credential: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }
  }
  
  return null
}

export async function updateCredential(connectorId: string, type: string, data: any): Promise<void> {
  const supabase = getServerClient()

  const { data: existing, error: existingError } = await supabase
    .from('credentials')
    .select('id, payload')
    .eq('connector_id', connectorId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(`Failed to get existing credential: ${existingError.message}`)
  }

  const updates = {
    payload: JSON.stringify(data),
    updated_at: new Date().toISOString(),
  }

  const query = supabase
    .from('credentials')
    .update(updates)
    .eq('connector_id', connectorId)
    .eq('type', type)

  const { error } = existing?.id
    ? await query.eq('id', existing.id)
    : await query

  if (error) {
    throw new Error(`Failed to update credential: ${error.message}`)
  }
}

// Update connector
export async function updateConnector(
  connectorId: string, 
  updates: Partial<{
    name: string
    provider_config: Record<string, any>
    scopes: string[]
  }>
): Promise<Connector> {
  const supabase = getServerClient()
  
  const updateData: any = {
    updated_at: new Date().toISOString()
  }
  
  if (updates.provider_config) {
    updateData.provider_config = updates.provider_config
  }
  
  if (updates.scopes) {
    updateData.scopes = updates.scopes
  }
  
  if (updates.name) {
    updateData.name = updates.name
  }
  
  const { data, error } = await supabase
    .from('connectors')
    .update(updateData)
    .eq('id', connectorId)
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to update connector: ${error.message}`)
  }
  
  return data
}

// Connection status operations
export async function updateConnectionStatus(
  connectorId: string, 
  status: 'connected' | 'disconnected' | 'error',
  lastError?: string
): Promise<void> {
  const supabase = getServerClient()
  
  const { error } = await supabase
    .from('connection_status')
    .upsert({
      connector_id: connectorId,
      status,
      last_error: lastError || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'connector_id' })
  
  if (error) {
    throw new Error(`Failed to update connection status: ${error.message}`)
  }
}

export async function getConnectionStatus(connectorId: string): Promise<ConnectionStatus | null> {
  const supabase = getServerClient()
  
  const { data, error } = await supabase
    .from('connection_status')
    .select()
    .eq('connector_id', connectorId)
    .single()
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get connection status: ${error.message}`)
  }
  
  return data
}

// Additional functions for compatibility
export async function getConnectorSecrets(connectorId: string): Promise<ConnectorWithSecrets | null> {
  const connector = await getConnector(connectorId)
  if (!connector) return null
  
  const credential = await getCredential(connectorId, 'kintone_config')
  if (!credential) return connector
  
  return {
    ...connector,
    secrets: {
      client_id: credential.clientId,
      client_secret: credential.clientSecret
    }
  }
}

export async function addLog(
  connectorId: string,
  level: 'info' | 'warn' | 'error',
  event: string,
  detail: any
): Promise<void> {
  const supabase = getServerClient()
  
  const { error } = await supabase
    .from('connector_logs')
    .insert({
      connector_id: connectorId,
      level,
      event,
      detail: JSON.stringify(detail),
      created_at: new Date().toISOString()
    })
  
  if (error) {
    throw new Error(`Failed to add log: ${error.message}`)
  }
}

export async function deleteConnector(connectorId: string): Promise<void> {
  const supabase = getServerClient()
  
  // Delete related data first
  await supabase.from('connector_logs').delete().eq('connector_id', connectorId)
  await supabase.from('credentials').delete().eq('connector_id', connectorId)
  await supabase.from('connection_status').delete().eq('connector_id', connectorId)
  
  // Delete connector
  const { error } = await supabase
    .from('connectors')
    .delete()
    .eq('id', connectorId)
  
  if (error) {
    throw new Error(`Failed to delete connector: ${error.message}`)
  }
}

export async function setConnectorStatus(
  connectorId: string,
  status: 'connected' | 'disconnected' | 'error',
  errorMessage?: string
): Promise<void> {
  await updateConnectionStatus(connectorId, status, errorMessage)
}
