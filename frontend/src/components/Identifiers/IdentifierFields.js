/**
 * Single source of truth for all supported participant identifier fields.
 * Used by:
 *  - Identifiers.jsx     — renders the form fields
 *  - ProtocolEditor.jsx  — renders the checkbox selection modal
 *
 * Field types:
 *  'text'   — plain text input
 *  'select' — dropdown; provide `options: [{ value, tKey, label }]`
 *  'year'   — year dropdown grouped by decade; provide `yearRange: { min, max }`
 */

const CURRENT_YEAR = new Date().getFullYear();

export const IDENTIFIER_FIELDS = [
  {
    id: 'first_name',
    tKey: 'identifiers.firstName',
    type: 'text',
  },
  {
    id: 'last_name',
    tKey: 'identifiers.lastName',
    type: 'text',
  },
  {
    id: 'birth_year',
    tKey: 'identifiers.birthYear',
    type: 'year',
    // Adjust min/max to match your study population.
    yearRange: { min: CURRENT_YEAR - 120 , max: CURRENT_YEAR - 17 },
  },
  {
    id: 'external_id',
    tKey: 'identifiers.externalId',
    type: 'text',
  },
  {
    id: 'sex',
    tKey: 'identifiers.sex',
    type: 'select',
    options: [
      { value: 'male',   tKey: 'common.male',   label: 'Male'   },
      { value: 'female', tKey: 'common.female', label: 'Female' },
    ],
  },
];
