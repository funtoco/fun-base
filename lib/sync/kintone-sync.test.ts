import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyFileFieldProcessResult,
  buildPeopleImageStoragePath,
  shouldSkipMissingUpdateTarget,
} from './kintone-sync'
import { buildUpdateCondition } from './update-key-utils'

test('buildPeopleImageStoragePath keeps same filenames isolated per Kintone record', () => {
  const first = buildPeopleImageStoragePath({
    tenantId: '',
    recordId: '1382',
    fieldCode: 'image',
    fileName: '2.png',
  })
  const second = buildPeopleImageStoragePath({
    tenantId: '',
    recordId: '1729',
    fieldCode: 'image',
    fileName: '2.png',
  })

  assert.equal(first, 'global/people_image/1382/image/Mg.png')
  assert.equal(second, 'global/people_image/1729/image/Mg.png')
  assert.notEqual(first, second)
})

test('buildPeopleImageStoragePath includes tenant scope when connector is tenant-bound', () => {
  const path = buildPeopleImageStoragePath({
    tenantId: 'tenant-123',
    recordId: '1382',
    fieldCode: 'image',
    fileName: '2.png',
  })

  assert.equal(path, 'tenant-123/people_image/1382/image/Mg.png')
})

test('applyFileFieldProcessResult does not clear existing image when file processing failed', () => {
  const data: Record<string, unknown> = { image_path: 'old/path.png' }

  applyFileFieldProcessResult(data, 'image_path', {
    shouldUpdate: false,
    path: null,
  })

  assert.equal(data.image_path, 'old/path.png')
})

test('applyFileFieldProcessResult clears image when Kintone FILE field is intentionally empty', () => {
  const data: Record<string, unknown> = { image_path: 'old/path.png' }

  applyFileFieldProcessResult(data, 'image_path', {
    shouldUpdate: true,
    path: null,
  })

  assert.equal(data.image_path, null)
})

test('buildUpdateCondition treats __ID__ mapping as Kintone record id', () => {
  const condition = buildUpdateCondition(
    {
      $id: { value: '2447' },
      image: { value: [{ fileKey: 'file-key' }] },
    },
    [
      {
        source_field_code: '__ID__',
        target_field_id: 'external_id',
        is_required: true,
        sort_order: 0,
        is_update_key: true,
      },
    ],
    '',
    false
  )

  assert.deepEqual(condition, { external_id: '2447' })
})

test('people_image sync always skips records without an existing target person', () => {
  assert.equal(shouldSkipMissingUpdateTarget('people_image', false), true)
  assert.equal(shouldSkipMissingUpdateTarget('people_image', true), true)
  assert.equal(shouldSkipMissingUpdateTarget('people', false), false)
  assert.equal(shouldSkipMissingUpdateTarget('people', true), true)
})
