import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: "メールアドレスが必要です" },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error:
          "この導線からは再送できません。所属企業の担当者またはFuntoco担当者へ再送をご依頼ください。",
      },
      { status: 403 }
    )
  } catch (error) {
    console.error("Error in resend invitation API:", error)
    return NextResponse.json(
      { error: "内部サーバーエラー" },
      { status: 500 }
    )
  }
}
