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
 * Drive のファイル名に使う書類種別（OP が実運用で使っている短縮名）。
 * ここに無い書類はカタログ名をそのまま使う。
 */
const DRIVE_DOC_LABELS: Record<string, string> = {
  corp_registry: '履歴事項全部証明書',
  resident_record_corp: '住民票の写し',
  labor_insurance_cert: '労働保険料等納付証明書',
  corp_tax_cert_type3: '納税証明書その3',
  social_insurance_proof: '社会保険料納入状況照会回答票',
  corp_residence_tax_cert: '法人住民税納税証明書',
  kyogikai_cert: '協議会加入証明書',
  business_license: '営業許可証',
  resident_record_sp: '住民票の写し',
  labor_insurance_cert_sp: '労働保険料等納付証明書',
  sp_tax_cert_type3: '納税証明書その3',
  social_insurance_proof_sp: '社会保険料納入状況照会回答票',
  sp_residence_tax_cert: '個人住民税納税証明書',
}

/**
 * Drive へ上げるファイル名を生成する（OP の既存命名: `[書類種別] 法人名.{ext}`）。
 * 法人名が取れない場合は書類種別のみ。同名ファイルは上書きせず並ぶ（旧版は OP が OLD へ退避する運用）。
 */
export function buildDriveFileName(params: {
  documentCode: string
  documentName: string
  companyName?: string | null
  originalFileName: string
}): string {
  const ext = safeExtension(params.originalFileName)
  const label = sanitize(DRIVE_DOC_LABELS[params.documentCode] ?? params.documentName)
  const company = params.companyName?.trim() ? sanitize(params.companyName) : null
  return company ? `[${label}] ${company}.${ext}` : `[${label}].${ext}`
}
