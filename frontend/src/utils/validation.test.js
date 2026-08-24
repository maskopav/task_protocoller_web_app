import { describe, it, expect } from 'vitest';
import { validate } from './validation';

describe('validate.participant', () => {
  it('is valid with only an external_id', () => {
    const { isValid, errors } = validate.participant({ external_id: 'P001' });
    expect(isValid).toBe(true);
    expect(errors).toEqual({});
  });

  it('is valid with name + birth_date + sex, no external_id', () => {
    const { isValid } = validate.participant({
      full_name: 'Jane Doe',
      birth_date: '1990-01-01',
      sex: 'female',
    });
    expect(isValid).toBe(true);
  });

  it('is invalid when neither external_id nor the full name/age/sex combo is present', () => {
    const { isValid, errors } = validate.participant({ full_name: 'Jane Doe' });
    expect(isValid).toBe(false);
    expect(errors.identity).toBe('identityRequired');
  });

  it('treats sex/birth_date placeholder "-" as not provided', () => {
    const { isValid, errors } = validate.participant({
      full_name: 'Jane Doe',
      birth_date: '-',
      sex: '-',
    });
    expect(isValid).toBe(false);
    expect(errors.identity).toBe('identityRequired');
  });

  it('flags a birth_date in the future even when external_id is present', () => {
    const futureYear = new Date().getFullYear() + 1;
    const { isValid, errors } = validate.participant({
      external_id: 'P001',
      birth_date: `${futureYear}-01-01`,
    });
    expect(isValid).toBe(false);
    expect(errors.birth_date).toBe('futureDateError');
  });

  it('flags an under-18 birth_date', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const { isValid, errors } = validate.participant({
      external_id: 'P001',
      birth_date: tenYearsAgo.toISOString().slice(0, 10),
    });
    expect(isValid).toBe(false);
    expect(errors.birth_date).toBe('underAge');
  });

  it('flags an invalid contact_email', () => {
    const { isValid, errors } = validate.participant({
      external_id: 'P001',
      contact_email: 'not-an-email',
    });
    expect(isValid).toBe(false);
    expect(errors.contact_email).toBe('invalidEmail');
  });
});

describe('validate.protocol', () => {
  it('requires name, language, and at least one task', () => {
    const { isValid, errors } = validate.protocol({});
    expect(isValid).toBe(false);
    expect(errors).toEqual({
      name: 'nameRequired',
      language: 'languageRequired',
      tasks: 'tasksRequired',
    });
  });

  it('is valid with name, language, and a non-empty task list', () => {
    const { isValid, errors } = validate.protocol({
      name: 'My Protocol',
      language: 'en',
      tasks: [{ id: 1 }],
    });
    expect(isValid).toBe(true);
    expect(errors).toEqual({});
  });
});

describe('validate.auth.field', () => {
  it('flags a missing required field', () => {
    expect(validate.auth.field('email', '', true)).toBe('required');
  });

  it('does not flag an optional missing field', () => {
    expect(validate.auth.field('phone', '', false)).toBe('');
  });

  it('validates email format', () => {
    expect(validate.auth.field('email', 'bad-email', true)).toBe('invalidEmail');
    expect(validate.auth.field('email', 'good@example.com', true)).toBe('');
  });

  it('validates phone format', () => {
    expect(validate.auth.field('phone', '123', false)).toBe('invalidPhone');
    expect(validate.auth.field('phone', '+420 123 456 789', false)).toBe('');
  });

  it('requires full_name to have at least two words', () => {
    expect(validate.auth.field('full_name', 'Jane', false)).toBe('nameTooShort');
    expect(validate.auth.field('full_name', 'Jane Doe', false)).toBe('');
  });

  it('rejects placeholder sex values', () => {
    expect(validate.auth.field('sex', 'not_selected', false)).toBe('invalidGender');
    expect(validate.auth.field('sex', '-- Choose --', false)).toBe('invalidGender');
    expect(validate.auth.field('sex', 'female', false)).toBe('');
  });
});

describe('validate.auth.login', () => {
  it('is invalid when email and password are missing', () => {
    const { isValid, errors } = validate.auth.login({ email: '', password: '' });
    expect(isValid).toBe(false);
    expect(errors.email).toBe('required');
    expect(errors.password).toBe('required');
  });

  it('is valid with a well-formed email and non-empty password', () => {
    const { isValid, errors } = validate.auth.login({
      email: 'user@example.com',
      password: 'secret',
    });
    expect(isValid).toBe(true);
    expect(errors).toEqual({});
  });
});
