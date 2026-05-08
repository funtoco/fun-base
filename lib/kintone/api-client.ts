/**
 * Kintone API client for data synchronization
 * Handles authentication and data fetching from Kintone
 */

export interface KintoneApp {
  appId: string
  code: string
  name: string
  description: string
  spaceId?: string
  threadId?: string
  createdAt: string
  modifiedAt: string
}

export interface KintoneField {
  code: string
  label: string
  type: string
  required: boolean
  options?: any
}

export interface KintoneRecord {
  $id: { value: string }
  $revision: { value: string }
  [fieldCode: string]: any
}

export interface KintoneApiConfig {
  domain: string  // Full domain like https://funtoco.cybozu.com
  accessToken: string
}

export function buildKintoneRecordsQuery(query: string | undefined, limit: number, offset: number): string {
  const trimmedQuery = query?.trim()
  const hasLimit = !!trimmedQuery && /\blimit\s+\d+\b/i.test(trimmedQuery)

  if (!trimmedQuery) {
    return `order by $id asc limit ${limit} offset ${offset}`
  }

  if (hasLimit) {
    return trimmedQuery
  }

  const hasOrderBy = /\border\s+by\b/i.test(trimmedQuery)
  const orderClause = hasOrderBy ? '' : ' order by $id asc'

  return `${trimmedQuery}${orderClause} limit ${limit} offset ${offset}`
}

export class KintoneApiClient {
  private domain: string
  private accessToken: string
  private baseUrl: string

  constructor(config: KintoneApiConfig) {
    this.domain = config.domain
    this.accessToken = config.accessToken
    this.baseUrl = this.domain
  }

  /**
   * Make authenticated request to Kintone API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    // Build headers - don't set Content-Type for GET requests
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json'
    }
    
    // Only set Content-Type for requests with body (POST, PUT, etc.)
    if (options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
      headers['Content-Type'] = 'application/json'
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[kintone-api] Request: ${options.method || 'GET'} ${url}`)
      console.log(`[kintone-api] Headers:`, { ...headers, Authorization: `Bearer ${this.accessToken.substring(0, 20)}...` })
    }
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (process.env.NODE_ENV === 'development') {
        console.log(`[kintone-api] Error response: ${response.status} ${errorText}`)
      }
      
      // Preserve specific error codes for 401 handling
      if (response.status === 401) {
        throw new Error(`Kintone API error: 401 ${errorText}`)
      }
      
      throw new Error(`Kintone API error: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  /**
   * Get all apps accessible to the current user
   */
  async getApps(options: {
    ids?: string[]
    codes?: string[]
    name?: string
    spaceIds?: string[]
    guestSpaceId?: string
    limit?: number
    offset?: number
  } = {}): Promise<KintoneApp[]> {
    // Build query parameters - only use allowed keys
    const queryParams = new URLSearchParams()
    
    if (options.ids && options.ids.length > 0) {
      options.ids.forEach(id => queryParams.append('ids[]', id))
    }
    if (options.codes && options.codes.length > 0) {
      options.codes.forEach(code => queryParams.append('codes[]', code))
    }
    if (options.name) {
      queryParams.append('name', options.name)
    }
    if (options.spaceIds && options.spaceIds.length > 0) {
      options.spaceIds.forEach(spaceId => queryParams.append('spaceIds[]', spaceId))
    }
    if (options.guestSpaceId) {
      queryParams.append('guestSpaceId', options.guestSpaceId)
    }
    if (options.limit) {
      queryParams.append('limit', options.limit.toString())
    }
    if (options.offset) {
      queryParams.append('offset', options.offset.toString())
    }
    
    const queryString = queryParams.toString()
    const endpoint = `/k/v1/apps.json${queryString ? `?${queryString}` : ''}`
    
    const response = await this.request<{ apps: any[] }>(endpoint)
    
    return response.apps.map(app => ({
      appId: app.appId,
      code: app.code,
      name: app.name,
      description: app.description || '',
      spaceId: app.spaceId,
      threadId: app.threadId,
      createdAt: app.createdAt,
      modifiedAt: app.modifiedAt
    }))
  }

  /**
   * Get app details including form fields
   */
  async getAppFields(appId: string): Promise<KintoneField[]> {
    const response = await this.request<{ properties: Record<string, any> }>(
      `/k/v1/app/form/fields.json?app=${appId}`
    )
    
    return Object.entries(response.properties).map(([code, field]) => ({
      code,
      label: field.label || code,
      type: field.type,
      required: field.required || false,
      options: field.options || null
    }))
  }

  /**
   * Get records from an app with pagination support
   */
  async getRecords(appId: string, query?: string, fields?: string[]): Promise<KintoneRecord[]> {
    const limit = 500
    let offset = 0
    let allRecords: KintoneRecord[] = []
    const isExplicitlyLimited = !!query?.trim() && /\blimit\s+\d+\b/i.test(query)

    while (true) {
      const recordsQuery = buildKintoneRecordsQuery(query, limit, offset)
      let endpoint = `/k/v1/records.json?app=${appId}&query=${encodeURIComponent(recordsQuery)}`
      
      if (fields && fields.length > 0) {
        const fieldsParam = fields.map(field => `fields[]=${encodeURIComponent(field)}`).join('&')
        endpoint += `&${fieldsParam}`
      }
      
      const response = await this.request<{ records: KintoneRecord[] }>(endpoint)
      const records = response.records
      
      allRecords = allRecords.concat(records)
      
      // If we got fewer records than the limit, we've reached the end
      if (isExplicitlyLimited || records.length < limit) {
        break
      }
      
      offset += limit
    }

    return allRecords
  }

  /**
   * Create records in an app
   */
  async createRecords(appId: string, records: Record<string, any>[]): Promise<{ ids: string[]; revisions: string[] }> {
    const response = await this.request<{ ids: string[]; revisions: string[] }>(
      '/k/v1/records.json',
      {
        method: 'POST',
        body: JSON.stringify({
          app: appId,
          records: records.map(record => ({ fields: record }))
        })
      }
    )
    
    return response
  }

  /**
   * Update records in an app
   */
  async updateRecords(appId: string, records: { id: string; record: Record<string, any>; revision?: string }[]): Promise<{ records: { id: string; revision: string }[] }> {
    const response = await this.request<{ records: { id: string; revision: string }[] }>(
      '/k/v1/records.json',
      {
        method: 'PUT',
        body: JSON.stringify({
          app: appId,
          records: records.map(({ id, record, revision }) => ({
            id,
            fields: record,
            revision
          }))
        })
      }
    )
    
    return response
  }

  /**
   * Test connection to Kintone
   */
  async testConnection(): Promise<{ success: boolean; userInfo?: any; error?: string }> {
    try {
      // Try to get apps as a connection test (uses k:app_settings:read scope)
      const appsResponse = await this.request<{ apps: any[] }>('/k/v1/apps.json')
      return {
        success: true,
        userInfo: {
          appsCount: appsResponse.apps.length,
          accessibleApps: appsResponse.apps.map(app => ({
            id: app.appId,
            name: app.name,
            code: app.code
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get app schema for mapping purposes
   */
  async getAppSchema(appId: string): Promise<{
    app: KintoneApp
    fields: KintoneField[]
    recordCount: number
  }> {
    const [apps, fields, records] = await Promise.all([
      this.getApps(),
      this.getAppFields(appId),
      this.getRecords(appId, 'limit 1') // Just get count
    ])

    const app = apps.find(a => a.appId === appId)
    if (!app) {
      throw new Error(`App ${appId} not found`)
    }

    // Get total record count
    const countResponse = await this.request<{ totalCount: string }>(
      `/k/v1/records.json?app=${appId}&totalCount=true&query=limit 0`
    )

    return {
      app,
      fields,
      recordCount: parseInt(countResponse.totalCount)
    }
  }

  /**
   * Download file from Kintone
   */
  async downloadFile(fileKey: string): Promise<{
    data: ArrayBuffer
    contentType: string
    fileName: string
  }> {
    const endpoint = `/k/v1/file.json?fileKey=${encodeURIComponent(fileKey)}`
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': '*/*'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to download file: ${response.status} ${errorText}`)
    }

    const data = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition = response.headers.get('content-disposition') || ''
    
    // Extract filename from Content-Disposition header
    const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    const fileName = fileNameMatch ? fileNameMatch[1].replace(/['"]/g, '') : `file_${fileKey}`

    return {
      data,
      contentType,
      fileName
    }
  }
}

/**
 * Create Kintone API client from connector credentials
 */
export async function createKintoneClient(connectorId: string): Promise<KintoneApiClient> {
  // This would typically get credentials from database
  // For now, we'll need to implement the credential retrieval
  throw new Error('Kintone client creation not yet implemented - need credential retrieval')
}

/**
 * Test Kintone connection with given credentials
 */
export async function testKintoneConnection(
  domain: string, 
  accessToken: string
): Promise<{ success: boolean; userInfo?: any; error?: string }> {
  const client = new KintoneApiClient({ domain, accessToken })
  return client.testConnection()
}
