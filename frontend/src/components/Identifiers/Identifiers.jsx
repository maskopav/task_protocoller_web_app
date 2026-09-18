import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TaskLayout from '../TaskLayout/TaskLayout';
import { normalizeIdentifiers, CATALOGUE_OPTIONS } from './IdentifierFields';
import { updateSessionIdentifiers } from '../../api/sessions';
import { SafeButton } from '../Shared/SafeButton';
import './Identifiers.css';

// In-browser preview of the participant identifiers ("patientFields") the
// desktop app shows before a protocol. Rendering mirrors the app's semantics:
// current_date is auto-filled, sex/education are fixed-option selects, every
// other field is free text validated by its regex.
export default function Identifiers({ requiredIdentifiers = [], onNext, sessionId, token }) {
  const { t } = useTranslation(['common']);
  const [formData, setFormData]       = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]             = useState(null);

  const fields = normalizeIdentifiers(requiredIdentifiers);
  const today = new Date().toISOString().slice(0, 10);

  const labelOf = (f) => (f.catalogue ? t(`identifiers.catalogue.${f.name}.label`, f.name) : f.label || f.name);
  const helpOf = (f) => (f.catalogue ? t(`identifiers.catalogue.${f.name}.help`, '') : f.help || '');

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    for (const f of fields) {
      if (f.name === 'current_date') continue;
      const value = (formData[f.name] ?? '').trim();
      if (f.required && !value) {
        setError(t('identifiers.fillAllFields'));
        return;
      }
      if (value && f.regex && !new RegExp(`^(?:${f.regex})$`).test(value)) {
        setError(t('identifiers.fillAllFields'));
        return;
      }
    }

    // Skip API call if there is no sessionId (e.g., editing/testing mode)
    if (!sessionId) {
      onNext();
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSessionIdentifiers(sessionId, { ...formData, current_date: today }, token);
      onNext();
    } catch (err) {
      console.error('Error saving identifiers:', err);
      setError(t('identifiers.saveError'));
      setIsSubmitting(false);
    }
  };

  const renderControl = (f) => {
    if (f.name === 'current_date') {
      return <input id={f.name} type="date" value={today} readOnly />;
    }
    const options = f.catalogue ? CATALOGUE_OPTIONS[f.name] : null;
    if (options) {
      return (
        <select id={f.name} value={formData[f.name] || ''} onChange={e => handleChange(f.name, e.target.value)} required={f.required}>
          <option value="" disabled>{t('identifiers.selectOption')}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    return (
      <input
        id={f.name}
        type="text"
        value={formData[f.name] || ''}
        onChange={e => handleChange(f.name, e.target.value)}
        placeholder={f.placeholder || labelOf(f)}
        pattern={f.regex || undefined}
        required={f.required}
      />
    );
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

            {fields.map(f => (
              <div key={f.name} className="identifiers-form-group">
                <label htmlFor={f.name}>
                  {labelOf(f)}{f.required ? ' *' : ''}
                </label>
                {renderControl(f)}
                {helpOf(f) && <small>{helpOf(f)}</small>}
              </div>
            ))}
          </form>
        </>
      }
      controls={
        <SafeButton
          type="submit"
          form="identifiers-form"
          className="btn-next"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('buttons.sending') : t('buttons.next')}
        </SafeButton>
      }
    />
  );
}