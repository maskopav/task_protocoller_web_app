import { describe, it, expect } from 'vitest';
import {
  catalogueField,
  emptyCustomField,
  parseFileNameTokens,
  renderFileNameExample,
} from './IdentifierFields';

describe('parseFileNameTokens', () => {
  it('keeps the template order and drops duplicates and literals', () => {
    expect(parseFileNameTokens('${field.patient_code}_${taskIndex}_Rep${repetition}_${taskIndex}'))
      .toEqual(['${field.patient_code}', '${taskIndex}', '${repetition}']);
  });

  it('returns nothing for a template without variables', () => {
    expect(parseFileNameTokens('plain')).toEqual([]);
    expect(parseFileNameTokens(null)).toEqual([]);
  });
});

describe('renderFileNameExample', () => {
  it('substitutes known variables and identifier samples', () => {
    const ids = [catalogueField('patient_code')];
    expect(renderFileNameExample('${field.patient_code}_${taskIndex}_${task.subtype}', ids))
      .toBe('HC001_03_PHONATION.wav');
  });

  it('falls back to the placeholder for custom fields and leaves unknown tokens alone', () => {
    const ids = [{ ...emptyCustomField(), name: 'visit', placeholder: 'V1' }];
    expect(renderFileNameExample('${field.visit}_${field.gone}', ids)).toBe('V1_${field.gone}.wav');
  });
});