import { describe, expect, it, vi } from 'vitest';
import { runConfirmAction } from '../components/ui/confirm-dialog';

// F15: the confirm action's failure is shown in the dialog (an Alert, role="alert") and the dialog stays open.
describe('ConfirmDialog action outcome', () => {
  it('closes the dialog only when the action succeeds', async () => {
    const close = vi.fn();
    await expect(runConfirmAction(async () => ({ ok: true }), close)).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and returns the server's reason when the action is refused", async () => {
    const close = vi.fn();
    const refused = { response: { status: 409, data: { success: false, error: { code: 'CONFLICT', message: 'A vehicle with open trips cannot be archived' } } } };
    await expect(runConfirmAction(() => Promise.reject(refused), close)).resolves.toBe('A vehicle with open trips cannot be archived');
    expect(close).not.toHaveBeenCalled();
  });

  it('also catches a synchronous throw and joins validation messages into a sentence', async () => {
    const close = vi.fn();
    const invalid = { response: { data: { error: { message: ['reason must be longer than or equal to 3 characters'] } } } };
    await expect(runConfirmAction(() => { throw invalid; }, close)).resolves.toBe('Reason must be longer than or equal to 3 characters.');
    expect(close).not.toHaveBeenCalled();
  });

  it("falls back to the caller's sentence, else a plain one, when the failure carries no message", async () => {
    await expect(runConfirmAction(() => Promise.reject({}), vi.fn(), 'The vehicle could not be archived.')).resolves.toBe('The vehicle could not be archived.');
    await expect(runConfirmAction(() => Promise.reject({}), vi.fn())).resolves.toBe('This action could not be completed. Try again.');
  });
});
