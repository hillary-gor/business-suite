import { describe, expect, it } from 'vitest';
import { BusinessRuleError, translateDatabaseError, userMessage } from '@/server/db/errors';

describe('translateDatabaseError', () => {
  it('surfaces restrict_violation raises as a user-facing business rule', () => {
    const error = translateDatabaseError({
      code: '23001',
      message: 'Only a draft invoice can be saved',
    });
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(userMessage(error)).toBe('Only a draft invoice can be saved');
  });
});
