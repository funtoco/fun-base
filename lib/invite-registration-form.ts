type SignUpUserLike = {
  identities?: unknown[] | null
}

export function isLikelyExistingAccountSignUpResponse(user: SignUpUserLike | null | undefined): boolean {
  const identities = user?.identities
  return Array.isArray(identities) && identities.length === 0
}

export function validateInviteRegistrationPasswords(
  password: string,
  passwordConfirmation: string,
  options: { enforceMinimumLength?: boolean } = {}
): string | null {
  const enforceMinimumLength = options.enforceMinimumLength ?? true

  if (enforceMinimumLength && password.length < 8) {
    return "パスワードは8文字以上で入力してください"
  }

  if (password !== passwordConfirmation) {
    return "パスワードが一致しません"
  }

  return null
}
