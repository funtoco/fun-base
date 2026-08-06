import { NextRequest, NextResponse } from 'next/server'
import { downloadCaseFile } from '@/lib/portal/case-files'

// GET /api/applications/[caseId]/files/[fileKey]
// 署名URLは使わず、FunBase のセッション認証を必ず通してから kintone から取得して返す。

/** Content-Disposition のファイル名（日本語対応・RFC 5987）。 */
function contentDisposition(fileName: string): string {
  // ヘッダを壊す文字は落とし、非ASCII名は filename* で渡す。
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { caseId: string; fileKey: string } }
) {
  try {
    const result = await downloadCaseFile({
      caseId: params.caseId,
      fileKey: decodeURIComponent(params.fileKey),
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { name, contentType, body } = result.data
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'Content-Disposition': contentDisposition(name),
        // 取得元の型を尊重させ、別の型として解釈されるのを防ぐ。
        'X-Content-Type-Options': 'nosniff',
        // 案件書類なので中間キャッシュには載せない。
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Error downloading case file:', error)
    return NextResponse.json(
      { error: 'ファイルの取得に失敗しました' },
      { status: 500 }
    )
  }
}
