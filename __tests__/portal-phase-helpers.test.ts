import { describe, it, expect } from 'vitest'
import {
  verifyWebhookSecret,
  parseVisaCaseWebhook,
} from '@/lib/portal/kintone-sync/webhook'
import {
  caseStatusToKintoneLabel,
  kintoneLabelToCaseStatus,
  resolveStatusAction,
  resolveStatusActionPath,
} from '@/lib/portal/kintone-sync/status-map'
import {
  extractDriveFolderId,
  buildDriveFileName,
} from '@/lib/portal/drive/folder'

// ── Phase2: Webhook 検証・解析 ─────────────────────────────
describe('webhook.verifyWebhookSecret', () => {
  it('一致で true、不一致/欠落/expected無しで false', () => {
    expect(verifyWebhookSecret('s3cret', 's3cret')).toBe(true)
    expect(verifyWebhookSecret('wrong', 's3cret')).toBe(false)
    expect(verifyWebhookSecret(null, 's3cret')).toBe(false)
    expect(verifyWebhookSecret('s3cret', undefined)).toBe(false)
    expect(verifyWebhookSecret('', '')).toBe(false)
  })

  it('長さが違っても（タイミングセーフ比較でも）false を返す', () => {
    expect(verifyWebhookSecret('short', 'muchlongersecret')).toBe(false)
  })
})

describe('webhook.parseVisaCaseWebhook', () => {
  const base = {
    type: 'ADD_RECORD',
    app: { id: '296' },
    recordId: '12',
    record: { $id: { value: '12' }, case_title: { value: 'A社' } },
  }

  it('正常な ADD_RECORD を正規化する', () => {
    const ev = parseVisaCaseWebhook(base)
    expect(ev).not.toBeNull()
    expect(ev!.type).toBe('ADD_RECORD')
    expect(ev!.appId).toBe('296')
    expect(ev!.recordId).toBe('12')
    expect(ev!.record.case_title).toEqual({ value: 'A社' })
  })

  it('recordId が無くても record.$id.value から補完する', () => {
    const { recordId, ...noRecordId } = base
    const ev = parseVisaCaseWebhook(noRecordId)
    expect(ev!.recordId).toBe('12')
  })

  it('app.id が 296 以外は null（別アプリの Webhook を無視）', () => {
    expect(parseVisaCaseWebhook({ ...base, app: { id: '34' } })).toBeNull()
  })

  it('type 不正・payload 非オブジェクトは null', () => {
    expect(parseVisaCaseWebhook({ ...base, type: 'FOO' })).toBeNull()
    expect(parseVisaCaseWebhook(null)).toBeNull()
    expect(parseVisaCaseWebhook('x')).toBeNull()
  })

  it('UPDATE_STATUS / ADD_RECORD_COMMENT / DELETE_RECORD の type を判別する', () => {
    for (const t of ['UPDATE_STATUS', 'ADD_RECORD_COMMENT', 'DELETE_RECORD']) {
      expect(parseVisaCaseWebhook({ ...base, type: t })!.type).toBe(t)
    }
  })
})

// ── Phase5: ステータス双方向マップ ─────────────────────────
describe('status-map', () => {
  it('6状態が kintone ラベルと往復一致する', () => {
    const pairs: [string, string][] = [
      ['draft', '下書き'],
      ['collecting', '書類収集中'],
      ['reviewing', '確認中'],
      ['ready', '申請準備完了'],
      ['synced', '連携済み'],
      ['completed', '完了'],
    ]
    for (const [status, label] of pairs) {
      expect(caseStatusToKintoneLabel(status as any)).toBe(label)
      expect(kintoneLabelToCaseStatus(label)).toBe(status)
    }
  })

  it('archived は kintone 非対応（label は null）、未知ラベルは null', () => {
    expect(caseStatusToKintoneLabel('archived')).toBeNull()
    expect(kintoneLabelToCaseStatus('アーカイブ')).toBeNull()
    expect(kintoneLabelToCaseStatus('存在しない')).toBeNull()
  })

  it('resolveStatusAction: 隣接前進のみアクション名、非隣接/後退は null', () => {
    expect(resolveStatusAction('draft', 'collecting')).toBe('提出開始')
    expect(resolveStatusAction('ready', 'synced')).toBe('kintone連携')
    expect(resolveStatusAction('synced', 'completed')).toBe('完了')
    expect(resolveStatusAction('draft', 'synced')).toBeNull() // 非隣接
    expect(resolveStatusAction('reviewing', 'collecting')).toBeNull() // 後退
  })

  it('resolveStatusActionPath: 前進を1手ずつ辿るアクション列', () => {
    expect(resolveStatusActionPath('reviewing', 'completed')).toEqual([
      '準備完了へ',
      'kintone連携',
      '完了',
    ])
    expect(resolveStatusActionPath('draft', 'collecting')).toEqual(['提出開始'])
    expect(resolveStatusActionPath('synced', 'draft')).toEqual([]) // 後退
    expect(resolveStatusActionPath('ready', 'ready')).toEqual([]) // 同一
  })
})

// ── Phase4: Drive フォルダID抽出・ファイル名 ──────────────
describe('drive/folder', () => {
  it('extractDriveFolderId: 各URL形からIDを取り出す', () => {
    expect(
      extractDriveFolderId('https://drive.google.com/drive/folders/ABC_123-xyz?usp=sharing')
    ).toBe('ABC_123-xyz')
    expect(extractDriveFolderId('https://drive.google.com/drive/u/0/folders/XYZ999')).toBe('XYZ999')
    expect(extractDriveFolderId('https://drive.google.com/open?id=IDID123456')).toBe('IDID123456')
    expect(extractDriveFolderId('1A2B3C4D5E6F7G')).toBe('1A2B3C4D5E6F7G') // 裸ID
  })

  it('extractDriveFolderId: 空/非URL/短すぎは null', () => {
    expect(extractDriveFolderId(null)).toBeNull()
    expect(extractDriveFolderId('')).toBeNull()
    expect(extractDriveFolderId('   ')).toBeNull()
    expect(extractDriveFolderId('https://example.com/no-folder-here')).toBeNull()
    expect(extractDriveFolderId('short')).toBeNull()
  })

  it('buildDriveFileName: [書類種別] 法人名.{ext}（OP の既存命名に合わせる）', () => {
    const name = buildDriveFileName({
      documentCode: 'corp_registry',
      documentName: '履歴事項全部証明書',
      companyName: '医療法人縁和会',
      originalFileName: 'scan.PDF',
    })
    expect(name).toBe('[履歴事項全部証明書] 医療法人縁和会.pdf') // 拡張子は小文字
  })

  it('buildDriveFileName: 書類種別は Drive 用の短縮名を使う', () => {
    expect(
      buildDriveFileName({
        documentCode: 'kyogikai_cert',
        documentName: '特定技能協議会加入証明書',
        companyName: '医療法人縁和会',
        originalFileName: 'a.pdf',
      })
    ).toBe('[協議会加入証明書] 医療法人縁和会.pdf')

    expect(
      buildDriveFileName({
        documentCode: 'resident_record_corp',
        documentName: '住民票（本籍地記載あり・マイナンバー記載無）',
        companyName: '医療法人縁和会',
        originalFileName: 'a.pdf',
      })
    ).toBe('[住民票の写し] 医療法人縁和会.pdf')
  })

  it('buildDriveFileName: 短縮名の無い書類はカタログ名をそのまま使う', () => {
    const name = buildDriveFileName({
      documentCode: 'unknown_doc',
      documentName: '前回申請している書類一式',
      companyName: 'A社',
      originalFileName: 'a.pdf',
    })
    expect(name).toBe('[前回申請している書類一式] A社.pdf')
  })

  it('buildDriveFileName: 法人名無し・拡張子欠落・不正文字のフォールバック', () => {
    expect(
      buildDriveFileName({
        documentCode: 'corp_registry',
        documentName: '履歴事項全部証明書',
        companyName: null,
        originalFileName: 'noext',
      })
    ).toBe('[履歴事項全部証明書].bin')

    expect(
      buildDriveFileName({
        documentCode: 'corp_registry',
        documentName: '履歴事項全部証明書',
        companyName: 'A/B社',
        originalFileName: 'a.pdf',
      })
    ).toBe('[履歴事項全部証明書] A_B社.pdf')
  })
})
