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
