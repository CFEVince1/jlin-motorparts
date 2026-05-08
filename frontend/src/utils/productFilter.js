const MATCH_RANKS = {
    part_number_exact: 0,
    part_number_partial: 1,
    compatibility: 2,
    product_name: 3,
    brand: 4,
    size: 5,
    none: Number.POSITIVE_INFINITY
};

export const normalizeSearchText = (value) => (value || '').toString().trim().toLowerCase();

export const normalizePartNumberSearch = (value) => normalizeSearchText(value).replace(/[^a-z0-9]/g, '');

export const isSerializedProduct = (product) => product?.is_serialized === 1 || product?.is_serialized === true;

export const getCompatibilityText = (product) => {
    const compatibilityList = Array.isArray(product?.compatibility) ? product.compatibility : [];
    const groupsList = Array.isArray(product?.compatibility_groups) ? product.compatibility_groups : [];
    const effectiveList = Array.isArray(product?.effective_compatibility) ? product.effective_compatibility : [];
    return [
        product?.compatibility_display, 
        ...compatibilityList,
        ...groupsList,
        ...effectiveList
    ].filter(Boolean).join(' ');
};

export const getStockStatus = (product) => {
    const stock = Number(product?.stock) || 0;
    const reorderLevel = Number(product?.reorder_level) || 0;

    if (stock === 0) return 'out_of_stock';
    if (stock <= reorderLevel) return 'low_stock';
    return 'in_stock';
};

export const getProductMatch = (product, query) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return { matchType: 'none', rank: 0 };

    const partNumber = normalizeSearchText(product?.part_number);
    const compactPartNumber = normalizePartNumberSearch(product?.part_number);
    const compactQuery = normalizePartNumberSearch(normalizedQuery);
    const compatibility = normalizeSearchText(getCompatibilityText(product));
    const productName = normalizeSearchText(product?.product_name || product?.name);
    const brand = normalizeSearchText(product?.brand);
    const size = normalizeSearchText(product?.size);

    if (partNumber === normalizedQuery || (compactQuery && compactPartNumber === compactQuery)) {
        return { matchType: 'part_number_exact', rank: MATCH_RANKS.part_number_exact };
    }

    if (partNumber.includes(normalizedQuery) || (compactQuery && compactPartNumber.includes(compactQuery))) {
        return { matchType: 'part_number_partial', rank: MATCH_RANKS.part_number_partial };
    }

    if (compatibility.includes(normalizedQuery)) {
        return { matchType: 'compatibility', rank: MATCH_RANKS.compatibility };
    }

    if (productName.includes(normalizedQuery)) {
        return { matchType: 'product_name', rank: MATCH_RANKS.product_name };
    }

    if (brand.includes(normalizedQuery)) {
        return { matchType: 'brand', rank: MATCH_RANKS.brand };
    }

    if (size.includes(normalizedQuery)) {
        return { matchType: 'size', rank: MATCH_RANKS.size };
    }

    return { matchType: 'none', rank: MATCH_RANKS.none };
};

const normalizeList = (value) => {
    if (Array.isArray(value)) return value.map(normalizeSearchText).filter(Boolean);
    return (value || '')
        .toString()
        .split(',')
        .map(normalizeSearchText)
        .filter(Boolean);
};

const hasExactPartNumberMatch = (values, normalizedQuery, compactQuery) => {
    return values.some(value =>
        value === normalizedQuery ||
        (compactQuery && normalizePartNumberSearch(value) === compactQuery)
    );
};

const hasPartialPartNumberMatch = (values, normalizedQuery, compactQuery) => {
    return values.some(value =>
        value.includes(normalizedQuery) ||
        (compactQuery && normalizePartNumberSearch(value).includes(compactQuery))
    );
};

export const getProductSnapshotMatch = (snapshot, query) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return { matchType: 'none', rank: 0 };

    const compactQuery = normalizePartNumberSearch(normalizedQuery);
    const partNumbers = [
        ...normalizeList(snapshot?.part_number),
        ...normalizeList(snapshot?.part_numbers)
    ];
    const compatibility = normalizeSearchText(snapshot?.compatibility_display || snapshot?.compatibility);
    const productName = normalizeSearchText(snapshot?.product_name || snapshot?.product_names || snapshot?.products_included);
    const brand = normalizeSearchText(snapshot?.brand || snapshot?.brands);
    const size = normalizeSearchText(snapshot?.size || snapshot?.sizes);

    if (hasExactPartNumberMatch(partNumbers, normalizedQuery, compactQuery)) {
        return { matchType: 'part_number_exact', rank: MATCH_RANKS.part_number_exact };
    }

    if (hasPartialPartNumberMatch(partNumbers, normalizedQuery, compactQuery)) {
        return { matchType: 'part_number_partial', rank: MATCH_RANKS.part_number_partial };
    }

    if (compatibility.includes(normalizedQuery)) {
        return { matchType: 'compatibility', rank: MATCH_RANKS.compatibility };
    }

    if (productName.includes(normalizedQuery)) {
        return { matchType: 'product_name', rank: MATCH_RANKS.product_name };
    }

    if (brand.includes(normalizedQuery)) {
        return { matchType: 'brand', rank: MATCH_RANKS.brand };
    }

    if (size.includes(normalizedQuery)) {
        return { matchType: 'size', rank: MATCH_RANKS.size };
    }

    return { matchType: 'none', rank: MATCH_RANKS.none };
};

const matchesCompatibilityFilter = (product, compatibilityId) => {
    if (!compatibilityId || compatibilityId === 'All') return true;

    const selectedId = Number(compatibilityId);
    if (!selectedId) return true;

    const effectiveUnitIds = Array.isArray(product?.effective_motorcycle_unit_ids) 
        ? product.effective_motorcycle_unit_ids 
        : Array.isArray(product?.motorcycle_unit_ids) ? product.motorcycle_unit_ids : [];
        
    return effectiveUnitIds.map(Number).includes(selectedId);
};

const matchesTypeFilter = (product, type) => {
    if (!type || type === 'All') return true;
    if (type === 'Serialized') return isSerializedProduct(product);
    if (type === 'Non-Serialized') return !isSerializedProduct(product);
    return true;
};

const matchesStockFilter = (product, stockStatus) => {
    if (!stockStatus || stockStatus === 'All') return true;
    return getStockStatus(product) === stockStatus;
};

export const filterProducts = (products, query = '', filters = {}) => {
    const normalizedQuery = normalizeSearchText(query);
    const {
        category = 'All',
        brand = 'All',
        size = 'All',
        type = 'All',
        compatibilityId = null,
        stockStatus = 'All'
    } = filters;

    return (products || [])
        .map((product, index) => {
            const match = getProductMatch(product, normalizedQuery);
            return { product, index, ...match };
        })
        .filter(({ product, rank }) => {
            const matchesSearch = !normalizedQuery || Number.isFinite(rank);
            const matchesCategory = !category || category === 'All' || product?.category === category;
            const matchesBrand = !brand || brand === 'All' || product?.brand === brand;
            const matchesSize = !size || size === 'All' || product?.size === size;

            return (
                matchesSearch &&
                matchesCategory &&
                matchesBrand &&
                matchesSize &&
                matchesTypeFilter(product, type) &&
                matchesCompatibilityFilter(product, compatibilityId) &&
                matchesStockFilter(product, stockStatus)
            );
        })
        .sort((a, b) => {
            if (!normalizedQuery) return a.index - b.index;
            return a.rank - b.rank || a.index - b.index;
        })
        .map(({ product }) => product);
};
