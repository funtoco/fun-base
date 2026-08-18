import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function AdminPrepareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email?.endsWith("@funtoco.jp")) {
    redirect("/people")
  }

  return <>{children}</>
}
