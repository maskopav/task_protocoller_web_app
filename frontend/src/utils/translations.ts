//src/utils/translations.ts
import i18next from "i18next";
import { taskBaseConfig } from "../config/tasksBase.js";

// -----------------------------
// TRANSLATION HELPERS
// -----------------------------

export function translateTaskName(category: string): string {
  return i18next.t(`${category}.name`, { ns: "tasks", defaultValue: category });
}

export function translateTaskDescription(category: string): string {
  return i18next.t(`${category}.description`, { ns: "tasks", defaultValue: "" });
}

export function translateTaskTitle(category: string, params: Record<string, any> = {}): string {
  return i18next.t(`${category}.title`, { ns: "tasks", ...params, defaultValue: category });
}


export function translateTaskInstructions(category: string, params: Record<string, any> = {}): string {
  return i18next.t(`${category}.instructions`, { ns: "tasks", ...params, defaultValue: "" });
}

export function translateTaskInstructionsActive(category: string, params: Record<string, any> = {}): string {
  return i18next.t(`${category}.instructionsActive`, { ns: "tasks", ...params, defaultValue: "" });
}

export function translateParamName(category: string, param: string): string {
  const key = `${category}.params.${param}.label`;
  const taskLabel = i18next.t(key, { ns: "tasks", defaultValue: "" });
  if (taskLabel) return taskLabel as string;
  return param;
}

export function translateParamValue(category: string, param: string, value: string): string {
  const key = `${category}.params.${param}.values.${value}`;

  // Use returnObjects:true so i18next can return nested structures when needed
  const translated = i18next.t(key, { ns: "tasks", defaultValue: value, returnObjects: true });

  if (typeof translated === "object" && translated !== null) {
    // Case: structured translation (like reading/monologue)
    if ("label" in translated && typeof translated.label === "string") {
      return translated.label;
    }

    // If label is missing, try to find first string field
    const firstString = Object.values(translated).find(v => typeof v === "string");
    return (firstString as string) || value;
  }

  // Normal case: translation is a plain string
  return translated as string;
}

// Returns all params with translated labels and values - detailed structure for Admin UI lists
export function getAllParams(category: string): Record<string, any> {
  const params = taskBaseConfig[category]?.params;
  if (!params) return {};

  // load translations for this category
  const translationTree = i18next.t(category, { ns: "tasks", returnObjects: true }) as Record<string, any>;

  return Object.fromEntries(
    Object.entries(params).map(([paramKey, paramDef]) => {
      const paramTranslation = translationTree?.params?.[paramKey];
      const translatedValues = paramTranslation?.values || {};

      // Check if parameter has translated possible values (string list)
      const hasEnumValues = Object.keys(translatedValues).length > 0;

      // --- CASE 1: translated string-based options (e.g. phoneme, fairytale, topic)
      if (hasEnumValues) {
        const isMultiple = paramDef.multiple === true;
        const values = Object.keys(translatedValues).map((vKey) => ({
          key: vKey,
          label: translateParamValue(category, paramKey, vKey),
        }));

        return [
          paramKey,
          {
            key: paramKey,
            label: translateParamName(category, paramKey),
            values,
            type: isMultiple ? "multiselect" : "enum",
          },
        ];
      }

      // --- CASE 2: numeric or literal parameters (e.g. repeat, duration)
      const defaultValue = paramDef.default;
      const isNumeric = typeof defaultValue === "number";

      return [
        paramKey,
        {
          key: paramKey,
          label: translateParamName(category, paramKey),
          values: [], // no enum list
          type: isNumeric ? "number" : "text",
          default: defaultValue,
        },
      ];
    })
  );
}

//  Returns parameter metadata + actual values for a specific task.
/**
 * Deeply resolves all parameters for a given task category,
 * including nested definitions like label + topicDescription
 * from the translation JSON (not just base config).
 */
export function getResolvedParams(category: string, actualParams: Record<string, any> = {}): Record<string, any> {
  // Translation tree for the given task (from en.json or loaded i18n)
  const translationTree = i18next.t(category, { ns: "tasks", returnObjects: true }) as Record<string, any>;

  if (!translationTree || typeof translationTree !== "object" || !translationTree.params) {
    console.warn(`⚠️ No translation structure found for category: ${category}`);
    return { ...actualParams };
  }

  const result: Record<string, any> = { ...actualParams };

  for (const [paramKey, actualValue] of Object.entries(actualParams)) {
    const paramTranslation = translationTree.params[paramKey]; 
    if (!paramTranslation) continue;

    // If parameter has value map, try to find the entry for the current value
    if (paramTranslation.values && typeof paramTranslation.values === "object") {

      // Handle Arrays (Multi-select) 
      if (Array.isArray(actualValue)) {
        result[paramKey] = actualValue.map(key => {
          const valDef = paramTranslation.values[key];
          // Returns the full object containing label & topicDescription!
          if (typeof valDef === "object" && valDef !== null) return valDef;
          return { label: key, topicDescription: valDef || key }; 
        });
      } 
      // --- EXISTING: Handle Single-select ---
      else {
        const valueDef = paramTranslation.values[actualValue];
        if (typeof valueDef === "string") {
          // simple case (like phonation: "a": "aaa")
          result[paramKey] = valueDef;
        } else if (typeof valueDef === "object" && valueDef !== null) {
          // deep object (like monologue.topic.any)
          // flatten into result (topic label, topicDescription, etc.)
          for (const [k, v] of Object.entries(valueDef)) {
            if (k === "label") {
              result[paramKey] = v; // main param label replaces original value
            } else {
              result[k] = v; // other nested info (topicDescription, text, etc.)
            }
          }
        }
      }
    // Parameter has no translation values (keep numeric / literal values)
    } else {
      // Only override with label if the original value is a string
      // and label is explicitly provided (e.g. "fairytale": { label: "Fairytale" })
      if (typeof actualValue === "string" && paramTranslation.label && category !== "questionnaire") {
        result[paramKey] = paramTranslation.label;
      } else {
        // Otherwise, preserve the numeric / literal value
        result[paramKey] = actualValue;
      }
    }
  }

  return result;
}

// Returns default params
export function getDefaultParams(category: string): Record<string, any> {
  const params = taskBaseConfig[category]?.params || {};
  const translationTree = i18next.t(category, { ns: "tasks", returnObjects: true }) as Record<string, any>;

  return Object.fromEntries(
    Object.entries(params).map(([key, def]) => {
      let defaultValue = def.default;
      const possibleValues = Object.keys(translationTree?.params?.[key]?.values || {});
      
      if (defaultValue === undefined) {
        if (def.multiple) {
          // If it's a multiple select, fallback to empty array or all options
          defaultValue = []; 
        } else if (possibleValues.length > 0) {
          // If it's a single select, fallback to the first available option
          defaultValue = possibleValues[0];
        }
      }
      return [key, defaultValue];
    })
  );
}

