// Google Drive 連携の純粋ヘルパ（フォルダURL→ID抽出、アップロードファイル名生成）。
// app296 の drive_folder_url（OP が手動で貼る）から親フォルダIDを取り出す。

/**
 * Drive フォルダURL（各種フォーマット）またはフォルダIDから、フォルダIDを取り出す。
 * 対応: /folders/{id}, ?id={id}/&id={id}（open?id= 含む）, 裸のID。抽出不能は null。
 */
export function extractDriveFolderId(input: string | null | undefined): string | null {
  if (!input) {
    return null
  }
  const s = input.trim()
  if (!s) {
    return null
  }
  // https://drive.google.com/drive/folders/{id} / /drive/u/0/folders/{id}
  const folders = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folders) {
    return folders[1]
  }
  // ...open?id={id} / ?id={id} / &id={id}
  const idParam = s.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParam) {
    return idParam[1]
  }
  // 裸のフォルダID（URL でなく、十分長い英数字_-）
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) {
    return s
  }
  return null
}

/** ファイル名として不正な文字を除去する。 */
function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

/** 元ファイル名から拡張子（小文字）を取り出す。無ければ 'bin'。 */
function safeExtension(fileName: string): string {
  const m = fileName.match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : 'bin'
}

/**
 * Drive へ上げるファイル名を生成する（§6: {案件名}_{書類種別}_{YYYYMMDD}.{ext}）。
 * date 省略時は現在時刻（UTC 成分）。案件名が無ければ書類種別のみ。
 */
export function buildDriveFileName(params: {
  caseTitle?: string | null
  documentName: string
  originalFileName: string
  date?: Date
}): string {
  const ext = safeExtension(params.originalFileName)
  const d = params.date ?? new Date()
  // Asia/Tokyo(+9h) の暦日で YYYYMMDD（JST早朝の書類が前日日付になるのを防ぐ）。
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const ymd = `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, '0')}${String(
    jst.getUTCDate()
  ).padStart(2, '0')}`
  const parts = [params.caseTitle, params.documentName]
    .filter((x): x is string => Boolean(x && x.trim()))
    .map(sanitize)
  return `${parts.join('_')}_${ymd}.${ext}`
}
