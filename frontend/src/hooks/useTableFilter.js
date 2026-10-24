import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import useDebouncedValue from './useDebouncedValue';

/**
 * Reusable hook to unify search query input, debouncing, multi-filter dropdowns,
 * and optional pagination across data tables.
 */
export const useTableFilter = ({
    items = [],
    initialSearch = '',
    initialFilters = {},
    initialPage = 1,
    filterFn = null,
    debounceMs = 250,
    itemsPerPage = 0
}) => {
    const [searchQuery, setSearchQueryState] = useState(initialSearch);
    const [filters, setFilters] = useState(initialFilters);
    const [currentPage, setCurrentPage] = useState(initialPage);

    const debouncedSearchQuery = useDebouncedValue(searchQuery, debounceMs);

    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setCurrentPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setSearchQueryState('');
        setFilters(initialFilters);
        setCurrentPage(1);
    }, [initialFilters]);

    const setSearchQuery = useCallback((val) => {
        const query = typeof val === 'function' ? val : () => val;
        setSearchQueryState(query);
        setCurrentPage(1);
    }, []);

    const handleSearchChange = useCallback((e) => {
        const val = typeof e === 'string' ? e : e?.target?.value ?? '';
        setSearchQueryState(val);
        setCurrentPage(1);
    }, []);

    // Reset to page 1 whenever debounced search query actually changes (skip initial mount)
    const prevSearchQueryRef = useRef(debouncedSearchQuery);
    useEffect(() => {
        if (prevSearchQueryRef.current !== debouncedSearchQuery) {
            prevSearchQueryRef.current = debouncedSearchQuery;
            setCurrentPage(1);
        }
    }, [debouncedSearchQuery]);

    // Reset to page 1 whenever itemsPerPage actually changes (skip initial mount)
    const prevItemsPerPageRef = useRef(itemsPerPage);
    useEffect(() => {
        if (prevItemsPerPageRef.current !== itemsPerPage) {
            prevItemsPerPageRef.current = itemsPerPage;
            setCurrentPage(1);
        }
    }, [itemsPerPage]);

    const filteredItems = useMemo(() => {
        if (typeof filterFn === 'function') {
            return filterFn(items, debouncedSearchQuery, filters);
        }
        return items;
    }, [items, debouncedSearchQuery, filters, filterFn]);

    // Optional pagination calculation
    const totalPages = itemsPerPage > 0 ? Math.max(1, Math.ceil(filteredItems.length / itemsPerPage)) : 1;

    // Automatically clamp currentPage if totalPages shrinks below currentPage after items have loaded
    useEffect(() => {
        if (items.length > 0 && totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages, items.length]);

    const paginatedItems = useMemo(() => {
        if (!itemsPerPage || itemsPerPage <= 0) return filteredItems;
        // Guard with safePage so out-of-bounds state during transitions doesn't return empty slice
        const safePage = Math.max(1, Math.min(currentPage, totalPages));
        const startIndex = (safePage - 1) * itemsPerPage;
        return filteredItems.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredItems, currentPage, totalPages, itemsPerPage]);

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
