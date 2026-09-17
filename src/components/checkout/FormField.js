import React from 'react';

function FormField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  placeholder,
  required = false,
  autoComplete,
  inputMode,
  children,
}) {
  return (
    <div className={`checkout-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children || (
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      )}
      {error && (
        <p className="checkout-error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
