import { NextResponse } from 'next/server'

import { getPersonById } from '@/lib/supabase/people-server'
import { getRetirementNoticeReportTemplate } from '@/lib/reports/retirement-notice-reports'
import { generateRetirementNoticePdf } from '@/lib/reports/retirement-notice-pdf'
import type { Person } from '@/lib/models'

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

  const pdf = await generateRetirementNoticePdf({ template, person })

  return buildPdfResponse(pdf)
}

export async function POST(
  request: Request,
  { params }: { params: { reportCode: string } }
) {
  const template = getRetirementNoticeReportTemplate(params.reportCode)
  if (!template) {
    return NextResponse.json({ error: 'Retirement notice template not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const personId = readFormText(formData, 'personId')
  if (!personId) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 })
  }

  const person = await getPersonById(personId)
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const pdf = await generateRetirementNoticePdf({
    template,
    person: applyRetirementNoticeOverrides(person, formData),
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

function applyRetirementNoticeOverrides(person: Person, formData: FormData): Person {
  return {
    ...person,
    sex: readFormText(formData, 'sex') ?? person.sex,
    specificSkillField: readFormText(formData, 'specificSkillField') ?? person.specificSkillField,
    businessCategory: readFormText(formData, 'businessCategory') ?? person.businessCategory,
    employmentContractEndDate:
      readFormText(formData, 'employmentContractEndDate') ?? person.employmentContractEndDate,
    employmentContractDate: readFormText(formData, 'employmentContractDate') ?? person.employmentContractDate,
    companyCorporateNumber: readFormText(formData, 'companyCorporateNumber') ?? person.companyCorporateNumber,
    companyPostalCode: readFormText(formData, 'companyPostalCode') ?? person.companyPostalCode,
    companyAddress: readFormText(formData, 'companyAddress') ?? person.companyAddress,
    companyPhone: readFormText(formData, 'companyPhone') ?? person.companyPhone,
  }
}

function readFormText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string') return undefined
  return value.trim()
}
