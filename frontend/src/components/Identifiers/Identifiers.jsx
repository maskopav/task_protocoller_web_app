import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import { IDENTIFIER_FIELDS } from './IdentifierFields';
import { updateSessionIdentifiers } from '../../api/sessions';
import './Identifiers.css';

/**
 * Build a flat descending list of years for a <datalist>.
 * Descending so typing a partial year (e.g. "195") shows the 1950s first.
 */
function buildYearList(min, max) {
  const years = [];
  for (let y = max; y >= min; y--) years.push(y);
  return years;
}

export default function Identifiers({ requiredIdentifiers = [], onNext, sessionId, token }) {
  const { t } = useTranslation(['common']);
  const [formData, setFormData]       = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]             = useState(null);

  // Fast id → field-definition lookup
  const fieldMap = Object.fromEntries(IDENTIFIER_FIELDS.map(f => [f.id, f]));

  const handleChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all required fields
    for (const id of requiredIdentifiers) {
      const value = formData[id];
      const field = fieldMap[id];

      // 1. Check if the field is empty
      if (!value?.trim()) {
        setError(t('identifiers.fillAllFields'));
        return;
      }

      // Validate 'year' type fields against their defined range
      if (field?.type === 'year') {
        const numValue = parseInt(value, 10);
        const { min, max } = field.yearRange;
        
        if (isNaN(numValue) || numValue < min || numValue > max) {
          // Provide a helpful error message indicating the allowed range
          setError(
            t('identifiers.invalidYear', { min, max })
          );
          return;
        }
      }
    }

    // Skip API call if there is no sessionId (e.g., editing/testing mode)
    if (!sessionId) {
      onNext();
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSessionIdentifiers(sessionId, formData, token);
      onNext();
    } catch (err) {
      console.error('Error saving identifiers:', err);
      setError(t('identifiers.saveError'));
      setIsSubmitting(false);
    }
  };

  /** Render the appropriate control for a field based on its type. */
  const renderControl = (field) => {
    const { id, type, options, yearRange } = field;
    const label = t(field.tKey, field.label);

    switch (type) {
      case 'select':
        return (
          <select
            id={id}
            value={formData[id] || ''}
            onChange={e => handleChange(id, e.target.value)}
            required
          >
            <option value="" disabled>
              {t('common.selectOption')}
            </option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {t(opt.tKey, opt.label)}
              </option>
            ))}
          </select>
        );

      case 'year': {
        const { min, max } = yearRange;
        const listId = `${id}-datalist`;
        return (
          <>
            <input
              id={id}
              type="text"
              inputMode="numeric"
              list={listId}
              value={formData[id] || ''}
              onChange={e => handleChange(id, e.target.value)}
              placeholder={t('identifiers.yearPlaceholder')}
              pattern="[0-9]{4}"
              title={t('identifiers.yearTitle')}
              required
            />
            <datalist id={listId}>
              {buildYearList(min, max).map(y => (
                <option key={y} value={String(y)} />
              ))}
            </datalist>
          </>
        );
      }

      default: // 'text'
        return (
          <input
            id={id}
            type="text"
            value={formData[id] || ''}
            onChange={e => handleChange(id, e.target.value)}
            placeholder={label}
            required
          />
        );
    }
  };

  return (
    <TaskLayout
      showSpacer={true}
      instructions={
        <>
          <div>
            {t('identifiers.description')}
          </div>

          <form id="identifiers-form" onSubmit={handleSubmit} className="identifiers-form">
            {error && <div className="identifiers-error">{error}</div>}

            {requiredIdentifiers.map(id => {
              const field = fieldMap[id];
              if (!field) return null; // unknown id — skip silently
              return (
                <div key={id} className="identifiers-form-group">
                  <label htmlFor={id}>
                    {t(field.tKey, field.label)}
                  </label>
                  {renderControl(field)}
                </div>
              );
            })}
          </form>
        </>
      }
      controls={
        <button
          type="submit"
          form="identifiers-form"
          className="btn-primary identifiers-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('buttons.saving') : t('buttons.continue')}
        </button>
      }
    />
  );
}
