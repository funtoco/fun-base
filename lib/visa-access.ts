export type VisaWorkspaceRole = "company" | "ops"

const OPS_ROLES = new Set(["admin", "owner", "operator", "ops", "staff", "support"])

export function getVisaWorkspaceRole(
  email: string | null | undefined,
  role: string | null | undefined,
): VisaWorkspaceRole {
  const normalizedRole = role?.trim().toLowerCase()
  const normalizedEmail = email?.trim().toLowerCase()

  if ((normalizedRole && OPS_ROLES.has(normalizedRole)) || normalizedEmail?.endsWith("@funtoco.jp")) {
    return "ops"
  }

  return "company"
}
