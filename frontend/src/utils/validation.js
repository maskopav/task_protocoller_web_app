// src/utils/validation.js
// Centralized validation logic for TaskProtocoller

/**
 * Atomic Validation Rules
 */
const rules = {
  isRequired: (value) => value !== null && value !== undefined && value.toString().trim().length > 0,
  
  isValidEmail: (email) => {
    if (!email) return true; // Optional field
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  isValidPhone: (phone) => {
    if (!phone) return true;
    return /^\+?[\d\s-]{9,15}$/.test(phone);
  },

  checkAge: (dobString) => {
    if (!dobString) return "birthDateRequired";
    const today = new Date();
    const birthDate = new Date(dobString);
    
    if (birthDate > today) return "futureDateError";

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    
    if (age < 18) return "underAge";
    if (age > 120) return "overAge";
    return true; 
  }
};

/**
 * Module-Specific Validation Schemes
 */
export const validate = {
  participant: (data) => {
    const errors = {};

    const hasExternalId = rules.isRequired(data.external_id);
    const hasName = rules.isRequired(data.full_name);
    const hasAge = rules.isRequired(data.birth_date) && data.birth_date !== "-"; 
    const hasSex = rules.isRequired(data.sex) && data.sex !== "-";

    // A participant is "identifiable" if they have an ID OR (Name + Valid Age + Sex)
    const isIdentifiable = hasExternalId || (hasName && hasAge && hasSex);

    // If neither method is satisfied, we set a general error
    if (!hasExternalId && !isIdentifiable) {
      errors.identity = "identityRequired"; 
    }

    // Rule: If a field is filled, it MUST be valid...

    // Check Birth Date Integrity (if it's not just "missing", it must be valid)
    const ageStatus = rules.checkAge(data.birth_date);
    if (data.birth_date && ageStatus !== true) {
      errors.birth_date = ageStatus; 
    }
    // Check Email Integrity
    if (data.contact_email && !rules.isValidEmail(data.contact_email)) {
      errors.contact_email = "invalidEmail";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  },

  protocol: (data) => {
    const errors = {};
    if (!rules.isRequired(data.name)) errors.name = "nameRequired";
    if (!data.language) errors.language = "languageRequired";
    if (!data.tasks || data.tasks.length === 0) errors.tasks = "tasksRequired";
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  },

  auth: {
    field: (name, value, isRequired = false) => {
      if (isRequired && !rules.isRequired(value)) return "required";
      
      if (name === "email" && !rules.isValidEmail(value)) return "invalidEmail";
      
      if (name === "phone" && value && !rules.isValidPhone(value)) return "invalidPhone";
      
      if (name === "birth_date" && value) {
        const ageStatus = rules.checkAge(value);
        return ageStatus === true ? "" : ageStatus;
      }

      if (name === "full_name" && value && value.trim().split(" ").length < 2) {
        return "nameTooShort";
      }

      if (name === "sex" && (value === "not_selected" || value === "-- Choose --")) {
        return "invalidGender";
      }

      return "";
    },
    login: (data) => {
      const errors = {};
      const emailErr = validate.auth.field("email", data.email, true);
      const passErr = validate.auth.field("password", data.password, true);

      if (emailErr) errors.email = emailErr;
      if (passErr) errors.password = passErr;

      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};