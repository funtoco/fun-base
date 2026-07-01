import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { Person } from "@/lib/models"
import { MANUAL_PERSON_ID_PREFIX } from "@/lib/person-source"
import { deleteFileFromStorage, uploadFileToStorage } from "@/lib/storage/file-uploader"

const STRING_FIELDS = [
  "name",
  "kana",
  "nationality",
  "dob",
  "specificSkillField",
  "phone",
  "employeeNumber",
  "workingStatus",
  "residenceCardNo",
  "residenceCardExpiryDate",
  "residenceCardIssuedDate",
  "email",
  "address",
  "company",
  "note",
  "employmentNotificationDate",
  "employmentChangeNotificationDate",
  "interviewDate",
  "jobOfferDate",
  "applicationNumber",
  "departureProcedureStatus",
  "entryConfirmedDate",
  "myNumber",
  "joiningDate",
  "insuranceNumber",
  "insuranceAcquiredDate",
] as const

const PEOPLE_IMAGES_BUCKET = "people-images"
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const VALID_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getRequestValue(body: Record<string, unknown> | FormData, field: string): unknown {
  return body instanceof FormData ? body.get(field) : body[field]
}

function getRequestFile(body: Record<string, unknown> | FormData, field: string): File | null {
  if (!(body instanceof FormData)) return null
  const value = body.get(field)
  return value instanceof File && value.size > 0 ? value : null
}

function getSafeImageExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension

  if (file.type === "image/jpeg") return "jpg"
  if (file.type === "image/png") return "png"
  if (file.type === "image/webp") return "webp"
  if (file.type === "image/heic") return "heic"
  if (file.type === "image/heif") return "heif"
  return "bin"
}

function mapPerson(data: any): Person {
  return {
    id: data.id,
    name: data.name,
    kana: data.kana,
    nationality: data.nationality,
    dob: data.dob,
    specificSkillField: data.specific_skill_field,
    phone: data.phone,
    employeeNumber: data.employee_number,
    workingStatus: data.working_status,
    residenceCardNo: data.residence_card_no,
    residenceCardExpiryDate: data.residence_card_expiry_date,
    residenceCardIssuedDate: data.residence_card_issued_date,
    email: data.email,
    address: data.address,
    tenantName: data.tenant?.name,
    company: data.company,
    note: data.note,
    visaId: data.visa_id,
    externalId: data.external_id,
    imagePath: data.image_path,
    employmentNotificationDate: data.employment_notification_date,
    employmentChangeNotificationDate: data.employment_change_notification_date,
    interviewDate: data.interview_date,
    jobOfferDate: data.job_offer_date,
    applicationNumber: data.application_number,
    departureProcedureStatus: data.departure_procedure_status,
    entryConfirmedDate: data.entry_confirmed_date,
    myNumber: data.my_number,
    joiningDate: data.joining_date,
    insuranceNumber: data.insurance_number,
    insuranceAcquiredDate: data.insurance_acquired_date,
    insuranceEnrollmentStatus: data.insurance_enrollment_status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || ""
    const body = contentType.includes("multipart/form-data")
      ? await request.formData()
      : await request.json()

    for (const field of STRING_FIELDS) {
      const value = getRequestValue(body, field)
      if (value !== undefined && value !== null && typeof value !== "string") {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
      }
    }

    const name = normalizeString(getRequestValue(body, "name"))
    const tenantId = normalizeString(getRequestValue(body, "tenantId"))
    const imageFile = getRequestFile(body, "image")

    if (!name) {
      return NextResponse.json({ error: "氏名は必須です" }, { status: 400 })
    }

    if (!tenantId) {
      return NextResponse.json({ error: "会社を選択してください" }, { status: 400 })
    }

    if (imageFile) {
      if (imageFile.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: "写真は5MB以下にしてください" }, { status: 400 })
      }

      if (!VALID_IMAGE_CONTENT_TYPES.includes(imageFile.type)) {
        return NextResponse.json({ error: "写真はPNG、JPEG、WebP、HEIC、HEIF形式で登録してください" }, { status: 400 })
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("user_tenants")
      .select("id, tenant_id, status")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1)

    if (membershipError) {
      console.error("Error checking tenant membership:", membershipError)
      return NextResponse.json({ error: "会社の確認に失敗しました" }, { status: 500 })
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: "この会社に人材を登録する権限がありません" }, { status: 403 })
    }

    const now = new Date().toISOString()
    const personId = `${MANUAL_PERSON_ID_PREFIX}${crypto.randomUUID()}`
    let imagePath: string | null = null

    if (imageFile) {
      const extension = getSafeImageExtension(imageFile)
      const filePath = `${tenantId}/manual_people_image/${personId}/profile.${extension}`
      const uploadResult = await uploadFileToStorage(
        PEOPLE_IMAGES_BUCKET,
        filePath,
        await imageFile.arrayBuffer(),
        imageFile.type,
        { upsert: true }
      )

      if (!uploadResult.success) {
        return NextResponse.json(
          { error: uploadResult.error || "写真のアップロードに失敗しました" },
          { status: 500 }
        )
      }

      imagePath = uploadResult.path || filePath
    }

    const insertFields = {
      id: personId,
      tenant_id: tenantId,
      name,
      kana: normalizeString(getRequestValue(body, "kana")),
      nationality: normalizeString(getRequestValue(body, "nationality")),
      dob: normalizeString(getRequestValue(body, "dob")),
      specific_skill_field: normalizeString(getRequestValue(body, "specificSkillField")),
      phone: normalizeString(getRequestValue(body, "phone")),
      employee_number: normalizeString(getRequestValue(body, "employeeNumber")),
      working_status: normalizeString(getRequestValue(body, "workingStatus")) ?? "入社待ち",
      residence_card_no: normalizeString(getRequestValue(body, "residenceCardNo")),
      residence_card_expiry_date: normalizeString(getRequestValue(body, "residenceCardExpiryDate")),
      residence_card_issued_date: normalizeString(getRequestValue(body, "residenceCardIssuedDate")),
      email: normalizeString(getRequestValue(body, "email")),
      address: normalizeString(getRequestValue(body, "address")),
      company: normalizeString(getRequestValue(body, "company")),
      note: normalizeString(getRequestValue(body, "note")),
      image_path: imagePath,
      employment_notification_date: normalizeString(getRequestValue(body, "employmentNotificationDate")),
      employment_change_notification_date: normalizeString(getRequestValue(body, "employmentChangeNotificationDate")),
      interview_date: normalizeString(getRequestValue(body, "interviewDate")),
      job_offer_date: normalizeString(getRequestValue(body, "jobOfferDate")),
      application_number: normalizeString(getRequestValue(body, "applicationNumber")),
      departure_procedure_status: normalizeString(getRequestValue(body, "departureProcedureStatus")),
      entry_confirmed_date: normalizeString(getRequestValue(body, "entryConfirmedDate")),
      my_number: normalizeString(getRequestValue(body, "myNumber")),
      joining_date: normalizeString(getRequestValue(body, "joiningDate")),
      insurance_number: normalizeString(getRequestValue(body, "insuranceNumber")),
      insurance_acquired_date: normalizeString(getRequestValue(body, "insuranceAcquiredDate")),
      insurance_enrollment_status: {},
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from("people")
      .insert(insertFields)
      .select(`
        *,
        tenant:tenant_id (id, name)
      `)
      .single()

    if (error) {
      if (imagePath) {
        await deleteFileFromStorage(PEOPLE_IMAGES_BUCKET, imagePath)
      }
      console.error("Error creating person:", error)
      return NextResponse.json({ error: "人材の登録に失敗しました" }, { status: 500 })
    }

    revalidatePath("/people", "page")
    revalidatePath(`/people/${data.id}`, "page")

    return NextResponse.json(
      {
        success: true,
        person: mapPerson(data),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error creating person:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "人材の登録に失敗しました" },
      { status: 500 }
    )
  }
}
