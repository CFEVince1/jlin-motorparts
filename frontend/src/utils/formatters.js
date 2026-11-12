// Shared formatting helpers for consistent enterprise representation

export const formatCurrency = (amount) => {
    const numeric = typeof amount === 'number' ? amount : Number(amount) || 0;
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numeric);
};

export const formatAuditDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');

    return `${month} ${day}, ${year} • ${formattedHours}:${minutes} ${ampm}`;
};

/**
 * Format raw string into standard 13-digit GCash Reference Number pattern:
 * e.g. "8047 181 819162" (4 digits, space, 3 digits, space, 6 digits)
 */
export const formatGcashReference = (val) => {
    if (!val) return '';
    const digits = String(val).replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
};

/**
 * Validates whether string contains exactly 13 digits for GCash Reference
 */
export const isValidGcashReference = (val) => {
    if (!val) return false;
    const digits = String(val).replace(/\D/g, '');
    return digits.length === 13;
};
