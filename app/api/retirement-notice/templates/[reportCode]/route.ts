import { NextResponse } from 'next/server'

import { getPersonById } from '@/lib/supabase/people-server'
import {
  buildRetirementNoticeMetadataFilename,
  getRetirementNoticeReportTemplate,
} from '@/lib/reports/retirement-notice-reports'

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
  const person = personId ? await getPersonById(personId) : null
  if (personId && !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const payload = {
    kind: 'retirement_notice_template_metadata',
    template,
    person: person
      ? {
          id: person.id,
          name: person.name,
          kana: person.kana,
          nationality: person.nationality,
          dob: person.dob,
          residenceCardNo: person.residenceCardNo,
          workingStatus: person.workingStatus,
          company: person.company,
          specificSkillField: person.specificSkillField,
        }
      : null,
  }
  const filename = buildRetirementNoticeMetadataFilename(template, { name: person?.name })

  return NextResponse.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
