import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  DEFAULT_EXTERNAL_CONFIRMATION_STATUS,
  buildInterviewRecordsQuery,
  isImportableInterviewRecord,
  parseActivityEntries,
  transformInterviewRecord,
} from './interview-record-transformer'

test('isImportableInterviewRecord only accepts completed regular or daily interview records', () => {
  assert.equal(
    isImportableInterviewRecord({
      $id: { value: '9559' },
      $revision: { value: '1' },
      Status: { value: '完了' },
      interview: { value: '定期面談' },
    }),
    true
  )
  assert.equal(
    isImportableInterviewRecord({
      $id: { value: '9560' },
      $revision: { value: '1' },
      Status: { value: '確認中' },
      interview: { value: '定期面談' },
    }),
    false
  )
  assert.equal(
    isImportableInterviewRecord({
      $id: { value: '9561' },
      $revision: { value: '1' },
      Status: { value: '完了' },
      interview: { value: '家族面談' },
    }),
    false
  )
})

test('buildInterviewRecordsQuery keeps connector filters and enforces completed status', () => {
  assert.equal(
    buildInterviewRecordsQuery('COID = "3222"'),
    'COID = "3222" and Status = "完了"'
  )

  assert.equal(
    buildInterviewRecordsQuery('COID = "3222" and Status = "完了"'),
    'COID = "3222" and Status = "完了"'
  )
})

test('transformInterviewRecord maps regular interview fields to interview_records row', () => {
  const row = transformInterviewRecord(
    {
      $id: { value: '9559' },
      $revision: { value: '3' },
      HRID: { value: '3505' },
      COID: { value: '3222' },
      companyName: { value: '株式会社ABC製造' },
      interview: { value: '定期面談' },
      Status: { value: '完了' },
      interviewDate: { value: '2026-05-14' },
      Time: { value: '14:00' },
      Time_0: { value: '15:00' },
      targetQuarter: { value: '2026年第2四半期' },
      timeInterview: { value: '60' },
      interviewMethod: { value: '対面' },
      interviewPlace: { value: '本社会議室' },
      supportName: { value: [{ name: '田中' }] },
      salesName: { value: [{ name: '佐藤' }] },
      funtocoStaff: { value: [{ name: '山田' }] },
      確認期限: { value: '2026-05-22T18:00:00Z' },
      企業提出用レポート: { value: '本人の勤務状況は良好です。' },
    },
    {
      tenantId: 'tenant-1',
      personId: 'person-1',
      sourceAppId: '98',
    }
  )

  assert.equal(row.tenant_id, 'tenant-1')
  assert.equal(row.person_id, 'person-1')
  assert.equal(row.source_person_id, '3505')
  assert.equal(row.source_system, 'kintone')
  assert.equal(row.source_app_id, '98')
  assert.equal(row.source_record_id, '9559')
  assert.equal(row.record_type, 'regular_interview')
  assert.equal(row.source_status, '完了')
  assert.equal(row.interview_date, '2026-05-14')
  assert.equal(row.interview_duration_minutes, 60)
  assert.equal(row.external_confirmation_status, DEFAULT_EXTERNAL_CONFIRMATION_STATUS)
  assert.equal(row.external_report_body, '本人の勤務状況は良好です。')
  assert.deepEqual(row.activity_entries, [])
})

test('parseActivityEntries normalizes Kintone subtable rows for daily support', () => {
  const entries = parseActivityEntries({
    value: [
      {
        id: 'row-1',
        value: {
          dai: { value: '生活支援' },
          chu: { value: '銀行・送金' },
          shou: { value: ['口座開設', '海外送金'] },
          notes: { value: '本人へ案内済み' },
        },
      },
    ],
  })

  assert.deepEqual(entries, [
    {
      dai: '生活支援',
      chu: '銀行・送金',
      shou: '口座開設, 海外送金',
      notes: '本人へ案内済み',
    },
  ])
})

test('parseActivityEntries normalizes serialized tableStorageDaily values', () => {
  const entries = parseActivityEntries({
    value: JSON.stringify([
      {
        dai: '日々の対応報告',
        chu: 'ビザ更新対応',
        shou: ['申請に必要な公的書類の案内（課税証明等）', '健康診断の受診案内'],
        notes: '健康診断の有効性と申請について必要な書類についての案内をしました。',
      },
    ]),
  })

  assert.deepEqual(entries, [
    {
      dai: '日々の対応報告',
      chu: 'ビザ更新対応',
      shou: '申請に必要な公的書類の案内（課税証明等）, 健康診断の受診案内',
      notes: '健康診断の有効性と申請について必要な書類についての案内をしました。',
    },
  ])
})
