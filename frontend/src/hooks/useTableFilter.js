import { useState, useMemo, useCallback } from 'react';
import useDebouncedValue from './useDebouncedValue';

/**
 * Reusable hook to unify search query input, debouncing, multi-filter dropdowns,
 * and optional pagination across data tables.
 */
export const useTableFilter = ({
    items = [],
    initialFilters = {},
    filterFn = null,
    debounceMs = 250,
    itemsPerPage = 0
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState(initialFilters);
    const [currentPage, setCurrentPage] = useState(1);

    const debouncedSearchQuery = useDebouncedValue(searchQuery, debounceMs);

    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setCurrentPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setSearchQuery('');
        setFilters(initialFilters);
        setCurrentPage(1);
    }, [initialFilters]);

    const handleSearchChange = useCallback((e) => {
        const val = typeof e === 'string' ? e : e?.target?.value ?? '';
        setSearchQuery(val);
        setCurrentPage(1);
    }, []);

    const filteredItems = useMemo(() => {
        if (typeof filterFn === 'function') {
            return filterFn(items, debouncedSearchQuery, filters);
        }
        return items;
    }, [items, debouncedSearchQuery, filters, filterFn]);

    // Optional pagination calculation
    const totalPages = itemsPerPage > 0 ? Math.max(1, Math.ceil(filteredItems.length / itemsPerPage)) : 1;

    const paginatedItems = useMemo(() => {
        if (!itemsPerPage || itemsPerPage <= 0) return filteredItems;
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredItems, currentPage, itemsPerPage]);

    const paginate = useCallback((page) => {
        setCurrentPage(prev => {
            const next = typeof page === 'function' ? page(prev) : page;
            return Math.max(1, Math.min(next, totalPages));
        });
    }, [totalPages]);

    return {
        searchQuery,
        setSearchQuery,
        handleSearchChange,
        debouncedSearchQuery,
        filters,
        setFilter,
        setFilters,
        resetFilters,
        filteredItems,
        paginatedItems,
        currentPage,
        totalPages,
        paginate,
        totalCount: items.length,
        filteredCount: filteredItems.length
    };
};

export default useTableFilter;
