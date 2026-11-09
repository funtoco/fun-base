import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkAllReadButton } from './mark-all-read-button'

describe('お知らせ一覧の一括既読ボタン', () => {
  it('未読があると操作でき、保存中は文言を変えて操作を止める', () => {
    const ready = renderToStaticMarkup(<MarkAllReadButton unreadCount={2} saving={false} onClick={() => {}} />)
    expect(ready).toContain('すべて既読にする')
    expect(ready).not.toMatch(/ disabled(=""|\s|>)/)

    const saving = renderToStaticMarkup(<MarkAllReadButton unreadCount={2} saving onClick={() => {}} />)
    expect(saving).toContain('既読にしています...')
    expect(saving).toMatch(/ disabled(=""|\s|>)/)

    const empty = renderToStaticMarkup(<MarkAllReadButton unreadCount={0} saving={false} onClick={() => {}} />)
    expect(empty).toMatch(/ disabled(=""|\s|>)/)
  })
})
