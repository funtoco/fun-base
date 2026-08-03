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

  it('buildDriveFileName: {案件名}_{書類種別}_{YYYYMMDD}.{ext}', () => {
    const name = buildDriveFileName({
      caseTitle: 'A社/初回',
      documentName: '履歴事項全部証明書',
      originalFileName: 'scan.PDF',
      date: new Date(Date.UTC(2026, 7, 3)),
    })
    expect(name).toBe('A社_初回_履歴事項全部証明書_20260803.pdf') // '/' は _ に、拡張子小文字
  })

  it('buildDriveFileName: caseTitle 無し・拡張子欠落のフォールバック', () => {
    const name = buildDriveFileName({
      caseTitle: null,
      documentName: '住民票',
      originalFileName: 'noext',
      date: new Date(Date.UTC(2026, 0, 9)),
    })
    expect(name).toBe('住民票_20260109.bin')
  })
})
