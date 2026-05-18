import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { app: string } }
) {
  try {
    const appKey = params.app
    const allow = new Set(['people', 'people_image', 'visas', 'meetings', 'interview_records'])
    if (!allow.has(appKey)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 400 })
    }
    // 人材画像は people テーブルに書き込む
    const table = appKey === 'people_image' ? 'people' : appKey

    const supabase = getAdminClient()
    const { data, error } = await supabase.rpc('get_table_columns_raw', { p_table: table })

    if (error || !data) {
      console.error('[SCHEMA] RPC failed', { table, error })
      return NextResponse.json({ error: 'Schema RPC failed', code: 'SCHEMA_RPC_FAILED', detail: error?.message }, { status: 500 })
    }

    // マッピング対象外: システムで設定するため選択肢から除外
    const system = new Set(['created_at', 'updated_at', 'tenant_id'])
    const columnLabels: Record<string, string> = {
      image_path: 'image_path (画像)',
    }
    const columns = (data as any[])
      .map((c) => ({
        key: c.column_name,
        label: columnLabels[c.column_name] ?? c.column_name,
        type: c.data_type,
        nullable: !!c.is_nullable,
        position: c.ordinal_position,
      }))
      .filter((c) => !system.has(c.key))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    console.log(`[SCHEMA] fetched ${table} columns: ${columns.length}`)
    return NextResponse.json({ columns })
  } catch (e) {
    console.error('[SCHEMA] unexpected error', e)
    return NextResponse.json({ error: 'Failed to fetch schema' }, { status: 500 })
  }
}
