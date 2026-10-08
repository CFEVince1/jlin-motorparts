import { useState, useCallback } from 'react';

/**
 * Reusable form state management hook that harmonizes per-field change callbacks,
 * resets, and validation errors.
 */
export const useForm = (initialValues = {}) => {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});

    // Standardized change handler for inputs, selects, and textareas
    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        if (!name) return;

        setValues(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Clear error for field when updated
        setErrors(prev => {
            if (!prev[name]) return prev;
            const updated = { ...prev };
            delete updated[name];
            return updated;
        });
    }, []);

    // Set a field value directly
    const setFieldValue = useCallback((name, value) => {
        setValues(prev => ({
            ...prev,
            [name]: value
        }));

        setErrors(prev => {
            if (!prev[name]) return prev;
            const updated = { ...prev };
            delete updated[name];
            return updated;
        });
    }, []);

    // Reset form back to initial values or custom values
    const resetForm = useCallback((newValues = initialValues) => {
        setValues(newValues);
        setErrors({});
    }, [initialValues]);

    return {
        values,
        setValues,
        errors,
        setErrors,
        handleChange,
        setFieldValue,
        resetForm
    };
};

export default useForm;
