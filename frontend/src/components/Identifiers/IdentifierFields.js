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
    label: 'First Name',
    type: 'text',
  },
  {
    id: 'last_name',
    tKey: 'identifiers.lastName',
    label: 'Last Name',
    type: 'text',
  },
  {
    id: 'birth_year',
    tKey: 'identifiers.birthYear',
    label: 'Year of Birth',
    type: 'year',
    // Adjust min/max to match your study population.
    yearRange: { min: 1920, max: CURRENT_YEAR - 10 },
  },
  {
    id: 'external_id',
    tKey: 'identifiers.externalId',
    label: 'External ID',
    type: 'text',
  },
  {
    id: 'sex',
    tKey: 'identifiers.sex',
    label: 'Sex',
    type: 'select',
    options: [
      { value: 'male',   tKey: 'common.male',   label: 'Male'   },
      { value: 'female', tKey: 'common.female', label: 'Female' },
    ],
  },
];
