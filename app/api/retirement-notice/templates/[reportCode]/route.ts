import { NextResponse } from 'next/server'

import { getPersonById } from '@/lib/supabase/people-server'
import { getRetirementNoticeReportTemplate } from '@/lib/reports/retirement-notice-reports'
import { generateRetirementNoticePdf } from '@/lib/reports/retirement-notice-pdf'
import {
  applyRetirementNoticeKintoneValues,
  getRetirementNoticeKintoneValues,
} from '@/lib/reports/retirement-notice-kintone-values'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: { reportCode: string } }
) {
  const template = getRetirementNoticeReportTemplate(params.reportCode)
  if (!template) {
    return NextResponse.json({ error: 'Retirement notice template not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const personId = searchParams.get('personId')
  if (!personId) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 })
  }

  const person = await getPersonById(personId)
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const kintoneValues = await getRetirementNoticeKintoneValues(person)
  const pdf = await generateRetirementNoticePdf({
    template,
    person: applyRetirementNoticeKintoneValues(person, kintoneValues),
    extraValues: kintoneValues.fieldValues,
  })

  return buildPdfResponse(pdf)
}

function buildPdfResponse(pdf: Awaited<ReturnType<typeof generateRetirementNoticePdf>>) {
  return new NextResponse(Buffer.from(pdf.data), {
    headers: {
      'Content-Type': pdf.contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pdf.fileName)}`,
      'Cache-Control': 'no-store',
      'X-Rendered-Field-Count': String(pdf.renderedFieldCount),
    },
  })
}
