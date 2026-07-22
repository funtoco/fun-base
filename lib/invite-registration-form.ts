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
