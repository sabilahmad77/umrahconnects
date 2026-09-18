/**
 * The account password rule, mirroring PASSWORD_RULE in
 * platform/api/src/modules/auth/dto/register.dto.ts.
 *
 * Kept here so signup and reset stop advertising a weaker rule than the server
 * enforces: they said "at least 8 characters" and then the server rejected an
 * 8-character password with no digit.
 */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';
export const PASSWORD_MESSAGE = 'Password must be 8–128 characters and include a letter and a number.';

export function passwordProblem(password: string): string {
  return PASSWORD_RULE.test(password) ? '' : PASSWORD_MESSAGE;
}

/** Boolean form of the same rule, used by the account settings forms. */
export function validPassword(value: string): boolean {
  return PASSWORD_RULE.test(value);
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordInput | 'form', string>>;

/** Client-side checks before `POST /auth/change-password`; the server re-checks everything. */
export function changePasswordProblems(input: ChangePasswordInput): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (!input.currentPassword) errors.currentPassword = 'Enter your current password.';
  if (!validPassword(input.newPassword)) errors.newPassword = PASSWORD_MESSAGE;
  else if (input.newPassword === input.currentPassword) errors.newPassword = 'Choose a new password that is different from your current one.';
  if (!errors.newPassword && input.confirmPassword !== input.newPassword) errors.confirmPassword = 'The passwords do not match.';
  return errors;
}

/** Places a server refusal of `POST /auth/change-password` next to the field it concerns. */
export function changePasswordServerErrors(error: unknown, message: string): ChangePasswordErrors {
  const failure = error as { response?: { status?: number; data?: { error?: { code?: string } } } };
  switch (failure?.response?.data?.error?.code) {
    case 'CURRENT_PASSWORD_INCORRECT':
      return { currentPassword: 'Your current password is not correct.' };
    case 'PASSWORD_UNCHANGED':
      return { newPassword: 'Choose a new password that is different from your current one.' };
    default:
      if (failure?.response?.status === 429) return { form: 'Too many attempts. Wait a few minutes and try again.' };
      if (!failure?.response) return { form: 'We could not reach Umrah Connect. Your password was not changed. Try again.' };
      return { form: message };
  }
}
