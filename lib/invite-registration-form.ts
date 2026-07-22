type SignUpUserLike = {
  identities?: unknown[] | null
}

export function isLikelyExistingAccountSignUpResponse(user: SignUpUserLike | null | undefined): boolean {
  const identities = user?.identities
  return Array.isArray(identities) && identities.length === 0
}

export function validateInviteRegistrationPasswords(
  password: string,
  passwordConfirmation: string
): string | null {
  if (password.length < 6) {
    return "パスワードは6文字以上で入力してください"
  }

  if (password !== passwordConfirmation) {
    return "パスワードが一致しません"
  }

  return null
}
