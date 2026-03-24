import React from "react";
import { Trans } from "react-i18next";

/**
 * FormattedText
 * @param {string} text - The translated string (may contain HTML or placeholders)
 * @param {Object} slots - Mapping of placeholders to React Elements (e.g., { example: <Btn /> })
 */
const FormattedText = ({ text, slots = {} }) => {
  if (!text || typeof text !== 'string') {
    return text; 
  }

  // 1. Find all placeholders in the string, e.g., {{example}}
  const placeholderRegex = /\{\{(.*?)\}\}/g;
  const parts = text.split(placeholderRegex);

  // 2. If no placeholders were found or no slots provided, just render via Trans
  if (parts.length === 1) {
    return <Trans defaults={text} />;
  }

  // 3. Map through parts: even indices are text, odd indices are placeholder keys
  return (
    <>
      {parts.map((part, index) => {
        // If it's an odd index, it's a placeholder key (e.g., "example")
        if (index % 2 === 1) {
          const component = slots[part];
          return component ? (
            <span key={index} className={`slot-${part}`}>
              {component}
            </span>
          ) : (
            `{{${part}}}` // Fallback if slot not provided
          );
        }

        // It's a regular text part (might contain <strong> etc.)
        return <Trans key={index} defaults={part} />;
      })}
    </>
  );
};

export default FormattedText;