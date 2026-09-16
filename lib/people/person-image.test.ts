import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
  isKintonePlaceholderImageName,
  isKintonePlaceholderImagePath,
} from './person-image'

describe('Kintoneの写真プレースホルダー判定', () => {
  test('noimage.pngはプレースホルダーとして扱う', () => {
    assert.equal(isKintonePlaceholderImageName('noimage.png'), true)
    assert.equal(isKintonePlaceholderImageName('NOIMAGE.PNG'), true)
  })

  test('通常の写真ファイルはプレースホルダーとして扱わない', () => {
    assert.equal(isKintonePlaceholderImageName('profile-photo.jpg'), false)
  })

  test('Storageパス内のnoimage.pngを判定する', () => {
    assert.equal(
      isKintonePlaceholderImagePath('global/people_image/765/image/bm9pbWFnZQ.png'),
      true
    )
    assert.equal(
      isKintonePlaceholderImagePath('global/people_image/765/image/Tk9JTUFHRQ.PNG'),
      true
    )
  })

  test('通常のStorageパスはプレースホルダーとして扱わない', () => {
    assert.equal(
      isKintonePlaceholderImagePath('global/people_image/1382/image/Mg.png'),
      false
    )
    assert.equal(
      isKintonePlaceholderImagePath('global/people_image/1382/image/bm9PbWFnZq.png'),
      false
    )
    assert.equal(isKintonePlaceholderImagePath(undefined), false)
  })
})
