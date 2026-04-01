import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PersonDetailTabs } from "@/components/person-detail-tabs"
import { PersonAvatar } from "@/components/ui/person-avatar"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { DeadlineChip } from "@/components/ui/deadline-chip"
import { getPersonById } from "@/lib/supabase/people-server"
import { getVisasByPersonId } from "@/lib/supabase/visas-server"
import { getPersonDocumentsByPersonId } from "@/lib/supabase/person-documents-server"
import { allMeetings } from "@/data/meetings"
import { supportActions } from "@/data/support-actions"
import { formatDate, formatDateTime } from "@/lib/utils"
import { Mail, Phone, MapPin, Building2, Calendar, User, IdCard, User2, Edit, FileText, Plane, Shield, Briefcase } from "lucide-react"

interface PersonDetailPageProps {
  params: { id: string }
}

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const [person, personVisas, personDocuments] = await Promise.all([
    getPersonById(params.id),
    getVisasByPersonId(params.id),
    getPersonDocumentsByPersonId(params.id),
  ])
  const excludedVisaStatuses = new Set<string>(['内定[辞退•取消]•退職'])
  const filteredVisas = personVisas.filter((item) => !excludedVisaStatuses.has(item.status))
  const visa = filteredVisas[0] // 最新のvisa (除外済み)
  const personMeetings = allMeetings.filter((m) => m.personId === params.id)
  const personSupportActions = supportActions.filter((sa) => sa.personId === params.id)

  if (!person) {
    notFound()
  }

  // Generate timeline for this person

  return (
    <div className="p-6 space-y-6">
      {/* Header with Edit Button */}
      <div className="flex items-center justify-end">
        <Link href={`/people/${params.id}/edit`}>
          <Button variant="outline" className="gap-2">
            <Edit className="h-4 w-4" />
            編集
          </Button>
        </Link>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <PersonAvatar 
              name={person.name} 
              imagePath={person.imagePath}
              size="xl"
            />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold">{person.name}</h1>
                  {person.kana && <p className="text-muted-foreground">{person.kana}</p>}
                  <div className="flex items-center gap-4 mt-2">
                    {person.nationality && (
                      <Badge variant="outline" className="gap-1">
                        <User className="h-3 w-3" />
                        {person.nationality}
                      </Badge>
                    )}
                    {person.tenantName && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        {person.tenantName}
                      </Badge>
                    )}
                    {person.company && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        所属先: {person.company}
                      </Badge>
                    )}
                    {person.workingStatus && (
                      <StatusBadge status={person.workingStatus} type="working" />
                    )}
                  </div>
                </div>
                {visa && (
                  <div className="text-right">
                    <StatusBadge status={visa.status} type="visa" />
                    {person.residenceCardExpiryDate && (
                      <div className="mt-2">
                        <DeadlineChip date={person.residenceCardExpiryDate} label="在留カード期限" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabs Content */}
        <div className="lg:col-span-2">
          <PersonDetailTabs
            personId={params.id}
            personMeetings={personMeetings}
            personSupportActions={personSupportActions}
            personVisas={personVisas}
            personDocuments={personDocuments}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>本人情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {person.dob && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">生年月日</span>
                  </div>
                  <span className="text-sm">{person.dob}</span>
                </div>
              )}
              {person.employeeNumber && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">従業員番号</span>
                  </div>
                  <span className="text-sm">{person.employeeNumber}</span>
                </div>
              )}
              {person.residenceCardNo && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IdCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">在留カード番号</span>
                  </div>
                  <span className="text-sm">{person.residenceCardNo}</span>
                </div>
              )}
              {(person.residenceCardExpiryDate || visa?.expiryDate) && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">在留カード有効期限</span>
                  </div>
                  <span className="text-sm">
                    {person.residenceCardExpiryDate ?? (visa?.expiryDate ? formatDate(visa.expiryDate) : "")}
                  </span>
                </div>
              )}
              {person.residenceCardIssuedDate && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">在留カード発行日</span>
                  </div>
                  <span className="text-sm">{person.residenceCardIssuedDate}</span>
                </div>
              )}
              {person.email && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">メールアドレス</span>
                  </div>
                  <span className="text-sm">{person.email}</span>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">電話番号</span>
                  </div>
                  <span className="text-sm">{person.phone}</span>
                </div>
              )}
              {person.address && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">住所</span>
                  </div>
                  <span className="text-sm">{person.address}</span>
                </div>
              )}
              {person.specificSkillField && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">特定技能分野</span>
                  </div>
                  <span className="text-sm">{person.specificSkillField}</span>
                </div>
              )}
              {person.company && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">所属先</span>
                  </div>
                  <span className="text-sm">{person.company}</span>
                </div>
              )}
              {person.employmentNotificationDate && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">雇用状況届出日</span>
                  </div>
                  <span className="text-sm">{formatDate(person.employmentNotificationDate)}</span>
                </div>
              )}
              {person.employmentChangeNotificationDate && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">変更届出日</span>
                  </div>
                  <span className="text-sm">{formatDate(person.employmentChangeNotificationDate)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pre-employment Information */}
          {(person.interviewDate || person.jobOfferDate || person.applicationNumber || person.departureProcedureStatus || person.entryConfirmedDate || person.myNumber) && (
            <Card>
              <CardHeader>
                <CardTitle>入社前情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {person.interviewDate && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">面接日</span>
                    </div>
                    <span className="text-sm">{formatDate(person.interviewDate)}</span>
                  </div>
                )}
                {person.jobOfferDate && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">内定日</span>
                    </div>
                    <span className="text-sm">{formatDate(person.jobOfferDate)}</span>
                  </div>
                )}
                {person.applicationNumber && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">申請番号</span>
                    </div>
                    <span className="text-sm font-mono">{person.applicationNumber}</span>
                  </div>
                )}
                {person.departureProcedureStatus && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">出国手続きの状況</span>
                    </div>
                    <span className="text-sm">{person.departureProcedureStatus}</span>
                  </div>
                )}
                {person.entryConfirmedDate && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">入国確定日</span>
                    </div>
                    <span className="text-sm">{formatDate(person.entryConfirmedDate)}</span>
                  </div>
                )}
                {person.myNumber && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IdCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">マイナンバー</span>
                    </div>
                    <span className="text-sm font-mono">****{person.myNumber.slice(-4)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Post-employment Information */}
          {person.joiningDate && (
            <Card>
              <CardHeader>
                <CardTitle>入社後情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">入社日</span>
                  </div>
                  <span className="text-sm">{formatDate(person.joiningDate)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Insurance Information */}
          {(person.insuranceNumber || person.insuranceAcquiredDate) && (
            <Card>
              <CardHeader>
                <CardTitle>社会保険／雇用保険</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {person.insuranceNumber && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">保険番号</span>
                    </div>
                    <span className="text-sm font-mono">{person.insuranceNumber}</span>
                  </div>
                )}
                {person.insuranceAcquiredDate && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">取得日</span>
                    </div>
                    <span className="text-sm">{formatDate(person.insuranceAcquiredDate)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visa Information */}
          {visa && (
            <Card>
              <CardHeader>
                <CardTitle>ビザ情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">種別</span>
                  <Badge variant="outline">{visa.type}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">状況</span>
                  <StatusBadge status={visa.status} type="visa" />
                </div>
                {visa.manager && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">担当者</span>
                    <span className="text-sm">{visa.manager}</span>
                  </div>
                )}
                {visa.receptionApplicationNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">受付申請番号</span>
                    <span className="text-sm font-mono">{visa.receptionApplicationNumber}</span>
                  </div>
                )}
                {visa.receptionNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">受付番号</span>
                    <span className="text-sm font-mono">{visa.receptionNumber}</span>
                  </div>
                )}
                {visa.receptionDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">受付日</span>
                    <span className="text-sm">{formatDate(visa.receptionDate)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {person.note && (
            <Card>
              <CardHeader>
                <CardTitle>メモ</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{person.note}</p>
              </CardContent>
            </Card>
          )}

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>統計情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">面談回数</span>
                <Badge variant="secondary">{personMeetings.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Support件数</span>
                <Badge variant="secondary">{personSupportActions.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">登録日</span>
                <span className="text-sm">{formatDate(person.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
