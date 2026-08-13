// app296「就労_ビザ案件管理」の事業所を単一フィールドから office_details サブテーブルへ移す。
// 手順: バックアップ → 旧フィールド削除 → サブテーブル追加 → デプロイ待ち → レコード復元。
// 実行前に .env.local の KINTONE_* を読み込む。

const fs = require('node:fs')

const ENV_PATH = '/Users/nishimuratomooakira/workspace/funtoco/fun-base/.env.local'
fs.readFileSync(ENV_PATH, 'utf8')
  .split('\n')
  .forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  })

const BASE = process.env.KINTONE_BASE_URL
const AUTH = Buffer.from(
  `${process.env.KINTONE_USERNAME}:${process.env.KINTONE_PASSWORD}`
).toString('base64')
const APP = '296'

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Cybozu-Authorization': AUTH,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return json
}

// app36 ルックアップの定義。既存の office_ref から写して、サブテーブル内の
// office_name_disp へ事業所名を自動コピーさせる。
const OFFICE_LOOKUP = {
  relatedApp: { app: '36', code: 'OF' },
  relatedKeyField: 'OFID',
  fieldMappings: [{ field: 'office_name_disp', relatedField: 'officeName' }],
  lookupPickerFields: ['officeName', 'companyName'],
  filterCond: '',
  sort: 'OFID asc',
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  // 1) 現在の事業所値をバックアップ（復元用）。
  const records = await call(
    'GET',
    `/k/v1/records.json?app=${APP}&fields[0]=$id&fields[1]=office_ref`
  )
  const backup = records.records
    .map((r) => ({ id: r.$id.value, officeRef: r.office_ref?.value ?? '' }))
    .filter((r) => r.officeRef !== '')
  console.log('バックアップした事業所値:', JSON.stringify(backup))

  if (dryRun) {
    console.log('--dry-run のためここで終了（構成は変更していません）')
    return
  }

  // 2) 旧フィールドを preview から削除。
  await call('DELETE', '/k/v1/preview/app/form/fields.json', {
    app: APP,
    fields: ['office_ref', 'office_name_disp'],
  })
  console.log('旧フィールド office_ref / office_name_disp を削除')

  // 3) office_details サブテーブルを追加（koyou_details と同じ構造）。
  await call('POST', '/k/v1/preview/app/form/fields.json', {
    app: APP,
    properties: {
      office_details: {
        type: 'SUBTABLE',
        code: 'office_details',
        label: '事業所（複数可）',
        fields: {
          office_ref: {
            type: 'NUMBER',
            code: 'office_ref',
            label: '事業所',
            noLabel: false,
            required: true,
            lookup: OFFICE_LOOKUP,
          },
          office_name_disp: {
            type: 'SINGLE_LINE_TEXT',
            code: 'office_name_disp',
            label: '事業所名（自動）',
            noLabel: false,
            required: false,
          },
        },
      },
    },
  })
  console.log('office_details サブテーブルを追加')

  // 4) デプロイ（完了までポーリング）。
  await call('POST', '/k/v1/preview/app/deploy.json', { apps: [{ app: APP }] })
  console.log('デプロイ開始…')
  for (let i = 0; i < 60; i += 1) {
    const status = await call('GET', `/k/v1/preview/app/deploy.json?apps[0]=${APP}`)
    const state = status.apps[0].status
    if (state === 'SUCCESS') {
      console.log('デプロイ完了')
      break
    }
    if (state === 'FAIL' || state === 'CANCEL') {
      throw new Error(`デプロイ失敗: ${state}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // 5) 事業所値をサブテーブルへ復元。ルックアップのキーを入れれば
  //    kintone が office_name_disp を自動で埋める。
  for (const row of backup) {
    await call('PUT', '/k/v1/record.json', {
      app: APP,
      id: row.id,
      record: {
        office_details: {
          value: [{ value: { office_ref: { value: row.officeRef } } }],
        },
      },
    })
    console.log(`レコード #${row.id} に事業所 ${row.officeRef} を復元`)
  }

  // 6) 検証。
  const after = await call(
    'GET',
    `/k/v1/records.json?app=${APP}&fields[0]=$id&fields[1]=office_details`
  )
  for (const r of after.records) {
    const rows = (r.office_details?.value ?? []).map(
      (x) => `${x.value.office_ref.value}:${x.value.office_name_disp.value}`
    )
    console.log(`#${r.$id.value} office_details=${JSON.stringify(rows)}`)
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
