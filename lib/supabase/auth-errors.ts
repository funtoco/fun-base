export function isExistingAccountSignUpError(errorMessage: string): boolean {
  const normalizedMessage = errorMessage.trim().toLowerCase()
  return (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("user already")
  )
}
