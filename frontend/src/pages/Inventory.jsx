import React, { useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Search,
  Printer,
  ChevronDown,
  Layers,
  History,
  Package,
  Building2,
  Truck,
  X,
  AlertTriangle,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Archive,
  ArrowRight,
  Filter,
  Plus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  Tag
} from 'lucide-react';
import Spinner from '../components/Spinner';
import { filterProducts, getStockStatus } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import {
  SHORT_TAXONOMY,
  STANDARD_TAXONOMY_KEYS,
  getShortCategory,
  getLedgerCategoryCode,
  getShortBrand,
  formatLedgerReference,
  cleanLedgerRemark
} from '../utils/categoryTaxonomy';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import AdjustmentModal from '../components/AdjustmentModal';
import ItemLedgerDrawer from '../components/ItemLedgerDrawer';
import PrintInventoryModal from '../components/PrintInventoryModal';
import ProductEditModal from '../components/ProductEditModal';
import AddProductModal from '../components/AddProductModal';
import CategoriesBrandsManager from '../components/CategoriesBrandsManager';
import PhysicalInventoryAudit from '../components/PhysicalInventoryAudit';
import LowStockReorderPanel from '../components/LowStockReorderPanel';

const STANDARD_CATEGORIES = [
  'All',
  'Engine',
  'Tires',
  'Wheels & Hubs',
  'CVT & Pulleys',
  'Suspension',
  'Exhaust',
  'Brakes',
  'Chains & Sprockets',
  'Handlebars & Controls',
  'Lights & Mirrors',
  'Electrical',
  'Oils & Lubricants',
  'Bolts & Accessories',
  'Body & Seats',
  'Riding Gear & Luggage'
];

const getPageNumbers = (current, total) => {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
};

const Inventory = () => {
  const { user } = useContext(AuthContext);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const qTab = searchParams.get('tab');
    if (!isAdmin && (qTab === 'movements' || qTab === 'reorder' || qTab === 'reorder_list')) return 'catalog';
    if (isAdmin && (qTab === 'reorder' || qTab === 'reorder_list')) return 'reorder_list';
    if (['categories_brands', 'physical_audit'].includes(qTab)) return qTab;
    if (isAdmin && qTab === 'movements') return 'movements';
    return 'catalog';
  });

  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (!isAdmin && (qTab === 'movements' || qTab === 'reorder' || qTab === 'reorder_list')) {
      setActiveTab('catalog');
      return;
    }
    if (isAdmin && (qTab === 'reorder' || qTab === 'reorder_list')) {
      setActiveTab('reorder_list');
    } else if (['categories_brands', 'physical_audit', 'catalog'].includes(qTab)) {
      setActiveTab(qTab);
    } else if (isAdmin && qTab === 'movements') {
      setActiveTab('movements');
    }
  }, [searchParams, isAdmin]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'catalog') next.delete('tab');
      else next.set('tab', tab);
      return next;
    });
  };

  // Stock Movements & Audit state
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementSearch, setMovementSearch] = useState('');
  const [movementType, setMovementType] = useState('ALL');
  const [movementStartDate, setMovementStartDate] = useState('');
  const [movementEndDate, setMovementEndDate] = useState('');
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsLimit, setMovementsLimit] = useState(20);
  const [movementsPagination, setMovementsPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  });
  const [quickLookupSearch, setQuickLookupSearch] = useState('');

  const fetchMovements = useCallback(async (page = 1, limit = movementsLimit) => {
    setLoadingMovements(true);
    try {
      const res = await api.get('/inventory/movements', {
        params: {
          page,
          limit,
          search: movementSearch.trim() || undefined,
          type: movementType !== 'ALL' ? movementType : undefined,
          startDate: movementStartDate || undefined,
          endDate: movementEndDate || undefined
        }
      });
      const rawData = res.data;
      const rawList = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.movements || []);
      const list = rawList.filter(m => {
        const isZeroBaseline = (m.transaction_type === 'OPENING_BALANCE' || (m.transaction_type || '').toUpperCase() === 'INIT') &&
          Number(m.quantity_change ?? m.quantity ?? 0) === 0 &&
          Number(m.balance_after ?? 0) === 0;
        return !isZeroBaseline;
      });
      setMovements(list);
      if (rawData?.pagination) {
        setMovementsPagination(rawData.pagination);
        setMovementsPage(rawData.pagination.page);
      }
    } catch {
      toast.error('Failed to load stock movements');
    } finally {
      setLoadingMovements(false);
    }
  }, [movementSearch, movementType, movementStartDate, movementEndDate, movementsLimit]);

  useEffect(() => {
    if (activeTab === 'movements') {
      fetchMovements(1, movementsLimit);
    }
  }, [activeTab, fetchMovements, movementsLimit]);

  const handleQuickLookup = async () => {
    if (!quickLookupSearch.trim()) {
      toast('Enter a part number or product name');
      return;
    }
    try {
      const res = await api.get('/inventory', { params: { search: quickLookupSearch.trim() } });
      const prods = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (prods.length > 0) {
        setLedgerTarget(prods[0]);
      } else {
        toast.error('No product found with that part number or name');
      }
    } catch {
      toast.error('Failed to look up product');
    }
  };

  const renderMovementTypeBadge = (type) => {
    const t = (type || '').toUpperCase();
    if (t === 'OPENING_BALANCE' || t === 'INIT' || t === 'OPEN') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(100, 116, 139, 0.15)',
          color: '#94a3b8',
          border: '1px solid rgba(100, 116, 139, 0.3)'
        }}>
          Init
        </span>
      );
    }
    if (t === 'STOCK_IN' || t === 'IN' || t === 'RECEIVE') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          In
        </span>
      );
    }
    if (t === 'SALE' || t === 'OUT') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        }}>
          Sale
        </span>
      );
    }
    if (t === 'RETURN' || t === 'REFUND') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(168, 85, 247, 0.15)',
          color: '#a855f7',
          border: '1px solid rgba(168, 85, 247, 0.3)'
        }}>
          Ret
        </span>
      );
    }
    if (t === 'VOID') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(100, 116, 139, 0.15)',
          color: '#64748b',
          border: '1px solid rgba(100, 116, 139, 0.3)'
        }}>
          Void
        </span>
      );
    }
    if (t === 'ADJUSTMENT' || t === 'ADJUST') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        }}>
          Adj
        </span>
      );
    }
    if (t === 'DAMAGE') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          💥 Defect
        </span>
      );
    }
    if (t === 'LOSS') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        }}>
          ⚠️ Loss
        </span>
      );
    }
    if (t === 'FOUND' || t === 'SURPLUS') {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          📦 Found
        </span>
      );
    }
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '0.72rem',
        fontWeight: 600,
        background: 'var(--surface-hover)',
        color: 'var(--text-muted)'
      }}>
        {t || 'Move'}
      </span>
    );
  };

  // Modals & Drawers state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printFilterType, setPrintFilterType] = useState('all');
  const [adjustmentTarget, setAdjustmentTarget] = useState(null);
  const [ledgerTarget, setLedgerTarget] = useState(null);
  const [editingProductModal, setEditingProductModal] = useState(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [selectedSerialsModalProduct, setSelectedSerialsModalProduct] = useState(null);
  const [expandedSerials, setExpandedSerials] = useState(new Set());

  // Page Size with localStorage persistence
  const [pageSize, setPageSize] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('inventory_page_size') : null;
    return saved ? Number(saved) : 15;
  });

  const handlePageSizeChange = (newSize) => {
    const sz = Number(newSize);
    setPageSize(sz);
    if (typeof window !== 'undefined') {
      localStorage.setItem('inventory_page_size', String(sz));
    }
  };

  const toggleExpandSerials = (id) => {
    setExpandedSerials(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const {
    searchQuery,
    handleSearchChange,
    filters,
    setFilter,
    filteredItems: filteredProducts,
    paginatedItems: currentItems,
    currentPage,
    totalPages,
    paginate,
    filteredCount
  } = useTableFilter({
    items: products,
    initialFilters: { category: 'All', brand: 'All', type: 'All', stockStatus: 'All', sortBy: 'name_asc' },
    itemsPerPage: pageSize,
    filterFn: (items, query, f) => {
      let result = filterProducts(items, query, {
        brand: f.brand,
        type: f.type,
        stockStatus: f.stockStatus
      });

      if (f.category && f.category !== 'All') {
        const target = f.category.toLowerCase();
        result = result.filter(p => {
          const shortCat = getShortCategory(p.category);
          return (
            shortCat.key.toLowerCase() === target ||
            shortCat.label.toLowerCase() === target ||
            (p.category && p.category.toLowerCase() === target)
          );
        });
      }

      const sortBy = f.sortBy || 'name_asc';
      return [...result].sort((a, b) => {
        switch (sortBy) {
          case 'name_desc':
            return (b.product_name || b.name || '').localeCompare(a.product_name || a.name || '');
          case 'sku_asc':
            return (a.part_number || a.sku || '').localeCompare(b.part_number || b.sku || '');
          case 'brand_asc':
            return (a.brand || '').localeCompare(b.brand || '');
          case 'price_asc':
            return Number(a.price ?? a.selling_price ?? 0) - Number(b.price ?? b.selling_price ?? 0);
          case 'price_desc':
            return Number(b.price ?? b.selling_price ?? 0) - Number(a.price ?? a.selling_price ?? 0);
          case 'stock_asc':
            return Number(a.stock ?? a.current_stock ?? 0) - Number(b.stock ?? b.current_stock ?? 0);
          case 'stock_desc':
            return Number(b.stock ?? b.current_stock ?? 0) - Number(a.stock ?? a.current_stock ?? 0);
          case 'damaged_desc':
            return Number(b.damaged_stock ?? 0) - Number(a.damaged_stock ?? 0);
          case 'name_asc':
          default:
            return (a.product_name || a.name || '').localeCompare(b.product_name || b.name || '');
        }
      });
    }
  });

  const categoryFilter = filters.category || 'All';
  const brandFilter = filters.brand || 'All';
  const typeFilter = filters.type || 'All';
  const stockStatusFilter = filters.stockStatus || 'All';
  const sortByFilter = filters.sortBy || 'name_asc';

  const categoryCounts = useMemo(() => {
    const counts = { All: products.length };
    STANDARD_TAXONOMY_KEYS.forEach(k => { counts[k] = 0; });
    products.forEach(p => {
      const shortCat = getShortCategory(p.category);
      if (counts[shortCat.key] !== undefined) {
        counts[shortCat.key]++;
      } else {
        counts[shortCat.key] = (counts[shortCat.key] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  const activeCategories = useMemo(() => {
    // Only show categories that currently have products in inventory to avoid cluttering the filter bar
    return STANDARD_TAXONOMY_KEYS.filter(k => (categoryCounts[k] || 0) > 0);
  }, [categoryCounts]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory');
      setProducts(res.data || []);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchMovements(1, movementsLimit);
  }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This will remove it from the active inventory catalog.`)) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product removed from catalog');
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product');
    }
  };

  // Combine standard motorparts categories with any custom catalog categories
  const uniqueCategories = useMemo(() => {
    const fromData = products.map(p => p.category).filter(Boolean);
    const extras = fromData.filter(c => !STANDARD_CATEGORIES.includes(c));
    return [...STANDARD_CATEGORIES, ...new Set(extras)];
  }, [products]);

  const uniqueBrands = useMemo(() => {
    return ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];
  }, [products]);

  // KPI Calculations
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalUnits = products.reduce((acc, p) => acc + Number(p.stock || p.current_stock || 0), 0);
    const lowStock = products.filter(p => getStockStatus(p) === 'low_stock').length;
    const outOfStock = products.filter(p => getStockStatus(p) === 'out_of_stock').length;
    return { totalProducts, totalUnits, lowStock, outOfStock };
  }, [products]);

  const handleOpenPrint = (type = 'all') => {
    setPrintFilterType(type);
    setPrintModalOpen(true);
  };

  return (
    <div className="inventory-page-container" style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
      {/* Header */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Archive size={28} color="var(--primary)" />
            <span>Inventory (Product Directory & Stock)</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 38px' }}>
            Unified catalog of all motorcycle parts, specifications, live shelf stock counts, and wholesale pricing.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsAddProductOpen(!isAddProductOpen)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', padding: '8px 16px', height: '38px', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)' }}
              title={isAddProductOpen ? 'Close add product form' : 'Add a new motorcycle part to the inventory catalog'}
            >
              {isAddProductOpen ? (
                <>
                  <X size={16} />
                  <span>Close Form</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>Add New Product</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (adjustmentTarget !== null) {
                setAdjustmentTarget(null);
              } else {
                setAdjustmentTarget(products[0] || {});
              }
            }}
            className={adjustmentTarget !== null ? 'btn-primary' : 'btn-secondary'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              padding: '8px 14px',
              height: '38px',
              cursor: 'pointer',
              background: adjustmentTarget !== null ? 'rgba(245, 158, 11, 0.2)' : undefined,
              borderColor: adjustmentTarget !== null ? '#f59e0b' : undefined,
              color: adjustmentTarget !== null ? '#f59e0b' : undefined
            }}
            title={adjustmentTarget !== null ? 'Close stock adjustment form' : 'Record manual stock adjustment (Damaged on shelf, Lost/Stolen, Found extra)'}
          >
            {adjustmentTarget !== null ? (
              <>
                <X size={15} style={{ color: '#f59e0b' }} />
                <span>Close Adjustment</span>
              </>
            ) : (
              <>
                <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                <span>Stock Adjustment</span>
              </>
            )}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/purchasing?tab=receive_orders')}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', padding: '8px 16px', height: '38px' }}
              title="Receive incoming shipment from supplier (restock existing or add new parts)"
            >
              <Truck size={16} />
              <span>Receive Supplier Stock</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleOpenPrint('out_of_stock')}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', padding: '8px 14px', height: '38px', cursor: 'pointer' }}
              title="Print inventory stock list or out-of-stock report"
            >
              <Printer size={15} />
              <span>Print Stock Report</span>
            </button>
          )}
        </div>
      </div>
      {/* View Switcher Tabs: Products | Categories & Brands | Movements | Physical Audit | Low Stock */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}
          style={{
            height: '38px',
            padding: '0 16px',
            fontSize: '0.84rem',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            background: activeTab === 'catalog' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'catalog' ? '#ffffff' : 'var(--text-muted)',
            border: activeTab === 'catalog' ? 'none' : '1.5px solid var(--border)',
            boxShadow: activeTab === 'catalog' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
          }}
          onClick={() => handleTabChange('catalog')}
        >
          <Package size={16} />
          <span>Products (Parts List) ({products.length})</span>
        </button>

        <button
          type="button"
          className={activeTab === 'categories_brands' ? 'btn-primary' : 'btn-secondary'}
          style={{
            height: '38px',
            padding: '0 16px',
            fontSize: '0.84rem',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            background: activeTab === 'categories_brands' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'categories_brands' ? '#ffffff' : 'var(--text-muted)',
            border: activeTab === 'categories_brands' ? 'none' : '1.5px solid var(--border)',
            boxShadow: activeTab === 'categories_brands' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
          }}
          onClick={() => handleTabChange('categories_brands')}
        >
          <Tag size={16} />
          <span>Categories & Brands</span>
        </button>

        <button
          type="button"
          className={activeTab === 'physical_audit' ? 'btn-primary' : 'btn-secondary'}
          style={{
            height: '38px',
            padding: '0 16px',
            fontSize: '0.84rem',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            background: activeTab === 'physical_audit' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'physical_audit' ? '#ffffff' : 'var(--text-muted)',
            border: activeTab === 'physical_audit' ? 'none' : '1.5px solid var(--border)',
            boxShadow: activeTab === 'physical_audit' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
          }}
          onClick={() => handleTabChange('physical_audit')}
        >
          <ClipboardList size={16} />
          <span>Stock Count (Physical Audit)</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className={activeTab === 'reorder_list' ? 'btn-primary' : 'btn-secondary'}
            style={{
              height: '38px',
              padding: '0 16px',
              fontSize: '0.84rem',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              background: activeTab === 'reorder_list' ? 'var(--primary)' : 'var(--surface)',
              color: activeTab === 'reorder_list' ? '#ffffff' : 'var(--text-muted)',
              border: activeTab === 'reorder_list' ? 'none' : '1.5px solid var(--border)',
              boxShadow: activeTab === 'reorder_list' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
            }}
            onClick={() => handleTabChange('reorder_list')}
          >
            <AlertTriangle size={16} />
            <span>Low Stock / Reorder List ({stats.lowStock + stats.outOfStock})</span>
          </button>
        )}

        {isAdmin && (
        <button
          type="button"
          className={activeTab === 'movements' ? 'btn-primary' : 'btn-secondary'}
          style={{
            height: '38px',
            padding: '0 16px',
            fontSize: '0.84rem',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            background: activeTab === 'movements' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'movements' ? '#ffffff' : 'var(--text-muted)',
            border: activeTab === 'movements' ? 'none' : '1.5px solid var(--border)',
            boxShadow: activeTab === 'movements' ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
          }}
          onClick={() => handleTabChange('movements')}
        >
          <History size={16} />
          <span>Stock Movement ({movementsPagination.total || 0})</span>
        </button>
        )}
      </div>

      {/* =========================================================================
          TAB 1: CATALOG & INVENTORY DIRECTORY
         ========================================================================= */}
      {activeTab === 'catalog' && (
        <>
          {/* INLINE FORM: PUT NEW PRODUCT / REGISTER NEW PART (ADMIN ONLY, NO MODAL, NO GLASS PANEL) */}
          {isAdmin && isAddProductOpen && (
            <AddProductModal
              isOpen={true}
              asPanel={true}
              onClose={() => setIsAddProductOpen(false)}
              onSuccess={() => {
                fetchInventory();
                setIsAddProductOpen(false);
              }}
            />
          )}

          {/* INLINE FORM: STOCK COUNT ADJUSTMENT (NO MODAL, NO GLASS OVERLAY) */}
          {adjustmentTarget !== null && (
            <AdjustmentModal
              isOpen={true}
              asPanel={true}
              onClose={() => setAdjustmentTarget(null)}
              product={adjustmentTarget}
              onSuccess={() => {
                fetchInventory();
                setAdjustmentTarget(null);
              }}
            />
          )}

          {/* INLINE FORM: EDIT PRODUCT METADATA & PRICING (NO POPUP MODAL) */}
          {editingProductModal !== null && (
            <ProductEditModal
              isOpen={true}
              asPanel={true}
              product={editingProductModal}
              onClose={() => setEditingProductModal(null)}
              onSuccess={() => {
                fetchInventory();
                setEditingProductModal(null);
              }}
            />
          )}

      {/* KPI Overview Cards */}
      <div className="no-print" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {/* Total Products */}
        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(5, 150, 105, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Package size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Catalog Products
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', lineHeight: 1.2 }}>
              {stats.totalProducts}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Active SKU entries
            </div>
          </div>
        </div>

        {/* Total Stock Units */}
        <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(10, 132, 255, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--accent, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Layers size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Units on Shelf
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', lineHeight: 1.2 }}>
              {stats.totalUnits.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Total physical inventory
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div
          className="glass-panel"
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            border: stockStatusFilter === 'low_stock' ? '1px solid #f59e0b' : '1px solid var(--border)'
          }}
          onClick={() => setFilter('stockStatus', stockStatusFilter === 'low_stock' ? 'All' : 'low_stock')}
          title="Click to filter low stock items"
        >
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Low Stock Alerts
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: stats.lowStock > 0 ? '#f59e0b' : 'inherit', lineHeight: 1.2 }}>
              {stats.lowStock}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {stockStatusFilter === 'low_stock' ? 'Filtering Active (Click to reset)' : 'At or below reorder level'}
            </div>
          </div>
        </div>

        {/* Out of Stock */}
        <div
          className="glass-panel"
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            border: stockStatusFilter === 'out_of_stock' ? '1px solid #ef4444' : '1px solid var(--border)'
          }}
          onClick={() => setFilter('stockStatus', stockStatusFilter === 'out_of_stock' ? 'All' : 'out_of_stock')}
          title="Click to filter out of stock items"
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Out of Stock
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: stats.outOfStock > 0 ? '#ef4444' : 'inherit', lineHeight: 1.2 }}>
              {stats.outOfStock}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {stockStatusFilter === 'out_of_stock' ? 'Filtering Active (Click to reset)' : '0 units remaining'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Catalog & Inventory Panel */}
      <div className="glass-panel" style={{ padding: '20px', width: '100%' }}>
        {/* Filter Controls Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 2fr) minmax(160px, 1.2fr) minmax(160px, 1.2fr) minmax(130px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr)',
          gap: '10px',
          alignItems: 'center',
          width: '100%',
          marginBottom: '14px'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search part #, name, brand, spec..."
              className="input-premium"
              style={{ paddingLeft: '32px', width: '100%', height: '38px', fontSize: '0.84rem' }}
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          {/* Category Filter Dropdown */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={categoryFilter}
              onChange={(e) => setFilter('category', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
              title="Filter by Category"
            >
              <option value="All">All Categories ({products.length})</option>
              {STANDARD_TAXONOMY_KEYS.map(cat => {
                const count = categoryCounts[cat] || 0;
                return (
                  <option key={cat} value={cat}>
                    {cat} {count > 0 ? `(${count})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={sortByFilter}
              onChange={(e) => setFilter('sortBy', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
              title="Sort products list"
            >
              <option value="name_asc">Sort: Part Name (A-Z)</option>
              <option value="name_desc">Sort: Part Name (Z-A)</option>
              <option value="sku_asc">Sort: SKU / Item Code (A-Z)</option>
              <option value="brand_asc">Sort: Brand (A-Z)</option>
              <option value="price_asc">Sort: Retail Price (Low-High)</option>
              <option value="price_desc">Sort: Retail Price (High-Low)</option>
              <option value="stock_asc">Sort: Stock Level (Low-High)</option>
              <option value="stock_desc">Sort: Stock Level (High-Low)</option>
            </select>
          </div>

          {/* Category Dropdown Filter */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={categoryFilter}
              onChange={(e) => setFilter('category', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
              title="Filter by product category"
            >
              <option value="All">All Categories ({categoryCounts.All || products.length})</option>
              {activeCategories.map(catKey => {
                const conf = SHORT_TAXONOMY[catKey] || getShortCategory(catKey);
                const count = categoryCounts[catKey] || 0;
                return (
                  <option key={catKey} value={catKey}>
                    {conf.label || catKey} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Brand Filter */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={brandFilter}
              onChange={(e) => setFilter('brand', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
            >
              {uniqueBrands.map(brand => (
                <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={stockStatusFilter}
              onChange={(e) => setFilter('stockStatus', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
            >
              <option value="All">All Stock Levels</option>
              <option value="in_stock">In Stock Only</option>
              <option value="low_stock">Low Stock (Reorder Needed)</option>
              <option value="out_of_stock">Out of Stock (Zero Units)</option>
            </select>
          </div>

          {/* Type Filter */}
          <div style={{ width: '100%' }}>
            <select
              className="input-premium"
              value={typeFilter}
              onChange={(e) => setFilter('type', e.target.value)}
              style={{ width: '100%', height: '38px', cursor: 'pointer', fontSize: '0.84rem' }}
            >
              <option value="All">All Product Types</option>
              <option value="Non-Serialized">Standard Parts (No Serial)</option>
              <option value="Serialized">Parts with Serial Numbers</option>
            </select>
          </div>
        </div>

        {/* Top Category Filter Pills Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '8px',
          marginBottom: '14px',
          scrollbarWidth: 'thin'
        }}>
          {/* All Pill */}
          <button
            type="button"
            onClick={() => setFilter('category', 'All')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.15s ease',
              border: categoryFilter === 'All' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
              background: categoryFilter === 'All' ? 'rgba(16, 185, 129, 0.18)' : 'var(--surface)',
              color: categoryFilter === 'All' ? '#10b981' : 'var(--text-muted)'
            }}
          >
            <span>All</span>
            <span style={{
              fontSize: '0.68rem',
              padding: '1px 6px',
              borderRadius: '10px',
              background: categoryFilter === 'All' ? '#10b981' : 'rgba(255,255,255,0.08)',
              color: categoryFilter === 'All' ? '#ffffff' : 'var(--text-muted)'
            }}>
              {categoryCounts.All || products.length}
            </span>
          </button>

          {/* 15 Standard Motorparts Category Pills */}
          {activeCategories.map(catKey => {
            const conf = SHORT_TAXONOMY[catKey] || getShortCategory(catKey);
            const isSelected = categoryFilter.toLowerCase() === catKey.toLowerCase();
            const count = categoryCounts[catKey] || 0;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setFilter('category', isSelected ? 'All' : catKey)}
                title={conf.scope || catKey}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  border: isSelected ? `1.5px solid ${conf.color}` : '1px solid var(--border)',
                  background: isSelected ? conf.bg : 'var(--surface)',
                  color: isSelected ? conf.color : count > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                  opacity: count === 0 ? 0.6 : 1
                }}
              >
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: conf.dot || conf.color,
                  flexShrink: 0
                }} />
                <span>{conf.label || catKey}</span>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: isSelected ? conf.color : 'rgba(255,255,255,0.08)',
                  color: isSelected ? '#ffffff' : 'var(--text-muted)'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Filters Display */}
        {(categoryFilter !== 'All' || brandFilter !== 'All' || stockStatusFilter !== 'All' || typeFilter !== 'All' || searchQuery) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active Filters:</span>
            {searchQuery && (
              <span className="badge-pill" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Search: "{searchQuery}"
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleSearchChange({ target: { value: '' } })} />
              </span>
            )}
            {categoryFilter !== 'All' && (
              <span className="badge-pill" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Category: {categoryFilter}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilter('category', 'All')} />
              </span>
            )}
            {brandFilter !== 'All' && (
              <span className="badge-pill" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Brand: {brandFilter}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilter('brand', 'All')} />
              </span>
            )}
            {stockStatusFilter !== 'All' && (
              <span className="badge-pill" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Status: {stockStatusFilter === 'in_stock' ? 'In Stock' : stockStatusFilter === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilter('stockStatus', 'All')} />
              </span>
            )}
            {typeFilter !== 'All' && (
              <span className="badge-pill" style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Type: {typeFilter}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFilter('type', 'All')} />
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setFilter('category', 'All');
                setFilter('brand', 'All');
                setFilter('stockStatus', 'All');
                setFilter('type', 'All');
                handleSearchChange({ target: { value: '' } });
              }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Reset all filters
            </button>
          </div>
        )}

        {/* Table Content */}
        {loading ? (
          <Spinner text="Loading inventory catalog..." />
        ) : (
                    <div className="table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: '180px' }}>Product & Part #</th>
                  <th style={{ minWidth: '110px' }}>Brand & Category</th>
                  <th style={{ minWidth: '160px' }}>Default FB Supplier</th>
                  <th style={{ textAlign: 'right', minWidth: '110px' }}>RETAIL / COST</th>
                  <th style={{ textAlign: 'center', minWidth: '130px' }}>Stock Status</th>
                  <th style={{ textAlign: 'center', minWidth: '110px', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map(p => {
                  const status = getStockStatus(p);
                  const currentStock = Number(p.stock ?? p.current_stock ?? 0);
                  const damagedStock = Number(p.damaged_stock ?? 0);
                  const reorderLevel = Math.max(1, Number(p.reorder_level) || 5);
                  const costNum = Number(p.cost_price || 0);
                  const priceNum = Number(p.price ?? p.selling_price ?? 0);
                  const shortCat = getShortCategory(p.category);

                  return (
                    <React.Fragment key={p.id}>
                      <tr>
                        {/* 1. Product & Part # (Uniform 2-line height) */}
                        <td>
                          <div style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.product_name || p.name}>
                            {p.product_name || p.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {p.part_number || p.sku}
                            </span>
                            {p.is_serialized ? (
                              <>
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => toggleExpandSerials(p.id)}
                                  className="badge-pill badge-serialized"
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    cursor: 'pointer',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#f59e0b',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                  title="Click to view serial breakdown"
                                >
                                  Serialized {expandedSerials.has(p.id) ? '▴' : '▾'}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>

                        {/* 2. Brand & Category */}
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                            {p.brand || '—'}
                          </div>
                          <div style={{ marginTop: '3px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: shortCat.bg,
                              border: `1px solid ${shortCat.border}`,
                              color: shortCat.color,
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }} title={p.category || shortCat.label}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: shortCat.dot,
                                flexShrink: 0
                              }} />
                              {shortCat.label}
                            </span>
                          </div>
                        </td>

                        {/* 3. Default FB Supplier */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              background: '#1877f2',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              flexShrink: 0
                            }}>
                              f
                            </span>
                            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              {p.default_facebook_supplier || p.supplier_name || 'Direct Wholesale'}
                            </span>
                          </div>
                        </td>

                        {/* 4. Cost / Retail Price */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.94rem' }}>
                            {formatCurrency(priceNum)}
                          </div>
                          {isAdmin && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Cost: {costNum > 0 ? formatCurrency(costNum) : '—'}
                            </div>
                          )}
                        </td>

                        {/* 5. Unified Stock Status (Locked Single Line) */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '0.94rem',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                                color: status === 'out_of_stock' ? '#ef4444' : status === 'low_stock' ? '#f59e0b' : 'var(--text-main)'
                              }}>
                                {currentStock} <span style={{ fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ {reorderLevel}</span>
                              </span>
                              {status === 'in_stock' && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(22, 163, 74, 0.12)',
                                  color: '#10b981',
                                  border: '1px solid rgba(22, 163, 74, 0.3)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  IN STOCK
                                </span>
                              )}
                              {status === 'low_stock' && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(245, 158, 11, 0.15)',
                                  color: '#f59e0b',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  LOW STOCK
                                </span>
                              )}
                              {status === 'out_of_stock' && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  OUT
                                </span>
                              )}
                            </div>
                            {damagedStock > 0 && (
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                whiteSpace: 'nowrap'
                              }}
                              title={`${damagedStock} in-store defective / shelf-damaged unit(s) quarantined`}
                              >
                                {damagedStock} damaged
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Complete Actions Column */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {/* Edit Product (Admin only) */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditingProductModal(p)}
                                className="btn-secondary"
                                style={{ padding: '5px 7px', borderRadius: '6px' }}
                                title="Edit product specifications, pricing, and reorder levels"
                              >
                                <Edit2 size={14} style={{ color: '#38bdf8' }} />
                              </button>
                            )}

                            {/* Adjust Stock (Admin and Staff) */}
                            <button
                              type="button"
                              onClick={() => setAdjustmentTarget(p)}
                              className="btn-secondary"
                              style={{ padding: '5px 7px', borderRadius: '6px' }}
                              title="Log In-Store Damage Adjustment (Pre-Sale Defect / Shelf Damage Write-Off)"
                            >
                              <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                            </button>

                            {/* Delete Product (Admin only) */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDelete(p.id, p.product_name || p.name)}
                                className="btn-secondary"
                                style={{ padding: '5px 7px', borderRadius: '6px' }}
                                title="Delete product from catalog"
                              >
                                <Trash2 size={14} style={{ color: '#ef4444' }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Serial Lots Breakdown */}
                      {p.is_serialized && expandedSerials.has(p.id) && (
                        <tr key={`${p.id}_serials_breakdown`} style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                          <td colSpan={6} style={{ padding: '12px 18px 16px 28px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Serial Lots Breakdown for {p.product_name || p.name}
                              </span>
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                (Total Lot Stock: <strong style={{ color: 'var(--text-main)' }}>{currentStock}</strong> units)
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {(p.serials || []).map(s => (
                                <div
                                  key={s.id || s.serial_number}
                                  style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.78rem'
                                  }}
                                >
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>
                                    {s.serial_number}
                                  </span>
                                  <span style={{
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    textTransform: 'capitalize',
                                    background: (s.status === 'available' || !s.status) ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: (s.status === 'available' || !s.status) ? 'var(--success)' : 'var(--danger)',
                                    border: `1px solid ${(s.status === 'available' || !s.status) ? 'rgba(22, 163, 74, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                  }}>
                                    {s.status || 'available'}
                                  </span>
                                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                                    Qty: <strong style={{ color: 'var(--text-main)' }}>{s.quantity}</strong>
                                  </span>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => setAdjustmentTarget({ ...p, serial_id: s.id, serial_number: s.serial_number })}
                                      title={`Adjust lot ${s.serial_number}`}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#f59e0b',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        display: 'inline-flex',
                                        alignItems: 'center'
                                      }}
                                    >
                                      <AlertTriangle size={13} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty-state" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No inventory products match your search or filter criteria. Try adjusting your query or resetting filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>
                Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> - <strong>{Math.min(currentPage * pageSize, filteredCount)}</strong> of <strong>{filteredCount}</strong> products
              </span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="input-premium"
                style={{ padding: '2px 8px', fontSize: '0.75rem', width: 'auto', cursor: 'pointer' }}
                title="Products per page"
              >
                <option value={10}>10 / page</option>
                <option value={15}>15 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => paginate(currentPage - 1)}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.8rem',
                    height: '32px',
                    minHeight: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: currentPage === 1 ? 0.4 : 1,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Prev
                </button>

                {getPageNumbers(currentPage, totalPages).map((pageNum, idx) => (
                  pageNum === '...' ? (
                    <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>...</span>
                  ) : (
                    <button
                      key={`page-${pageNum}`}
                      type="button"
                      onClick={() => paginate(pageNum)}
                      className={currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        minWidth: '32px',
                        height: '32px',
                        minHeight: '32px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontWeight: currentPage === pageNum ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {pageNum}
                    </button>
                  )
                ))}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => paginate(currentPage + 1)}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.8rem',
                    height: '32px',
                    minHeight: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: currentPage === totalPages ? 0.4 : 1,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
        </>
      )}

      {/* =========================================================================
          TAB 2: CATEGORIES & BRANDS MANAGEMENT
         ========================================================================= */}
      {activeTab === 'categories_brands' && (
        <CategoriesBrandsManager onCatalogUpdated={fetchInventory} />
      )}

      {/* =========================================================================
          TAB 3: STOCK MOVEMENTS & AUDIT LEDGER
         ========================================================================= */}
      {isAdmin && activeTab === 'movements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* INLINE STOCK CARD HISTORY (NO MODAL, NO BORDER BOX) */}
          {ledgerTarget !== null && (
            <ItemLedgerDrawer
              isOpen={true}
              asPanel={true}
              onClose={() => setLedgerTarget(null)}
              product={ledgerTarget}
            />
          )}

          {/* Quick Product Movement Ledger Lookup */}
          <div className="glass-panel" style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            background: 'var(--surface)',
            border: 'none',
            borderRadius: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)'
              }}>
                <History size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Inspect Product Stock Movement History (Stock Card)
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Enter any part number or product name to view its complete append-only stock card ledger.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 340px', maxWidth: '480px' }}>
              <input
                type="text"
                placeholder="Enter part # or product name..."
                className="input-premium"
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.84rem' }}
                value={quickLookupSearch}
                onChange={(e) => setQuickLookupSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickLookup();
                }}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.84rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleQuickLookup}
              >
                <History size={14} /> View Stock Card
              </button>
            </div>
          </div>

          {/* Movements Search & Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} color="var(--primary)" /> All Stock Movements & Audit Trail
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Complete chronological ledger of all stock-ins, POS sales, in-store defect quarantines, adjustments, voids, and shrinkage losses.
                </p>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => fetchMovements(movementsPage, movementsLimit)}
                disabled={loadingMovements}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                title="Refresh stock movements"
              >
                <RefreshCw size={13} className={loadingMovements ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Quick Adjustment & Movement Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>
                Quick Filter:
              </span>
              {[
                { key: 'ALL', label: 'All Movements', color: 'var(--text-main)', bg: 'var(--surface-hover)' },
                { key: 'DAMAGE', label: '💥 In-Store Defect / Shelf Damage', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
                { key: 'LOSS', label: '⚠️ Lost / Stolen Shrinkage', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
                { key: 'FOUND', label: '📦 Found Extra Stock', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
                { key: 'STOCK_IN', label: '📥 Stock In', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
                { key: 'SALE', label: '🛒 POS Sales', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
              ].map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setMovementType(chip.key)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: movementType === chip.key ? `1.5px solid ${chip.color}` : '1px solid var(--border)',
                    background: movementType === chip.key ? chip.bg : 'var(--surface)',
                    color: movementType === chip.key ? chip.color : 'var(--text-muted)',
                    boxShadow: movementType === chip.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Filters Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search ref #, part #, product, user..."
                  className="input-premium"
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <select
                  className="input-premium"
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                  style={{ width: '100%', height: '36px', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  <option value="ALL">All Movement Types</option>
                  <option value="STOCK_IN">Stock In (Inward Deliveries)</option>
                  <option value="SALE">POS Sales (Stock Out)</option>
                  <option value="VOID">Sale Voids (+Restore)</option>
                  <option value="DAMAGE">💥 In-Store Defect / Shelf Damage (-Out)</option>
                  <option value="LOSS">⚠️ Lost / Stolen Shrinkage (-Out)</option>
                  <option value="FOUND">📦 Found Extra Stock (+In)</option>
                  <option value="ADJUSTMENT">Stock Adjustments (Audit Count)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  className="input-premium"
                  value={movementStartDate}
                  onChange={(e) => setMovementStartDate(e.target.value)}
                  title="Start Date"
                  style={{ width: '100%', height: '36px', fontSize: '0.80rem' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>-</span>
                <input
                  type="date"
                  className="input-premium"
                  value={movementEndDate}
                  onChange={(e) => setMovementEndDate(e.target.value)}
                  title="End Date"
                  style={{ width: '100%', height: '36px', fontSize: '0.80rem' }}
                />
              </div>

              {(movementSearch || movementType !== 'ALL' || movementStartDate || movementEndDate) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setMovementSearch('');
                    setMovementType('ALL');
                    setMovementStartDate('');
                    setMovementEndDate('');
                  }}
                  style={{ height: '36px', fontSize: '0.80rem', padding: '0 12px' }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Movements Table */}
            <div className="table-container" style={{ marginTop: '16px', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
              {loadingMovements ? (
                <Spinner text="Loading stock movements..." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '145px' }}>Date & Time</th>
                      <th style={{ minWidth: '105px' }}>Reference #</th>
                      <th style={{ minWidth: '240px' }}>Product & Brand</th>
                      <th style={{ minWidth: '75px', textAlign: 'center' }}>Movement Type</th>
                      <th style={{ minWidth: '140px', textAlign: 'center' }}>Stock Change</th>
                      <th style={{ minWidth: '180px' }}>Remarks / Reason</th>
                      <th style={{ minWidth: '85px', textAlign: 'center', paddingRight: '14px', whiteSpace: 'nowrap' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="table-empty-state" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No stock movements match your criteria.
                        </td>
                      </tr>
                    ) : (
                      movements.map((m) => {
                        const changeVal = Number(m.quantity_change ?? m.quantity ?? 0);
                        const isPositive = changeVal > 0;
                        const isZero = changeVal === 0;
                        const qtyAbs = Math.abs(changeVal);
                        const rawRef = m.reference_no || m.transaction_number || `TX-${m.id}`;
                        const cleanRef = formatLedgerReference(rawRef, m.id);
                        const shortBrand = getShortBrand(m.brand);
                        const catCode = getLedgerCategoryCode(m.category);
                        const rawRemarks = m.remarks || m.notes || '';
                        const cleanedRemarks = cleanLedgerRemark(rawRemarks);

                        return (
                          <tr key={m.id}>
                            {/* 1. Date & Time + Staff */}
                            <td>
                              <div style={{ fontSize: '0.80rem', whiteSpace: 'nowrap', color: 'var(--text-main)', fontWeight: 600 }}>
                                {formatAuditDate(m.created_at)}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                by {m.created_by_username || 'Admin'}
                              </div>
                            </td>

                            {/* 2. Clean Reference # */}
                            <td>
                              <span
                                style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', fontSize: '0.84rem' }}
                                title={rawRef}
                              >
                                {cleanRef}
                              </span>
                            </td>

                            {/* 3. Product & Brand (with Part Number • Short Brand • Short Cat) */}
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                                {m.product_name || '—'}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
                                  {m.part_number || '—'}
                                </span>
                                <span>•</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                  {shortBrand}
                                </span>
                                <span>•</span>
                                <span style={{
                                  fontWeight: 700,
                                  fontSize: '0.70rem',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-muted)'
                                }}>
                                  {catCode}
                                </span>
                              </div>
                            </td>

                            {/* 4. Movement Type */}
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {renderMovementTypeBadge(m.transaction_type)}
                            </td>

                            {/* 5. Stock Change (Combines Change + Balance + Unit Cost) */}
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                                <strong style={{ color: isPositive ? '#10b981' : isZero ? 'var(--text-muted)' : '#ef4444' }}>
                                  {isPositive ? `+${qtyAbs}` : isZero ? '0' : `-${qtyAbs}`}
                                </strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                                  ({m.balance_before ?? '0'} → {m.balance_after ?? '0'})
                                </span>
                              </div>
                              {isAdmin && Number(m.unit_cost) > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                  Cost: {formatCurrency(Number(m.unit_cost))}
                                </div>
                              )}
                            </td>

                            {/* 6. Remarks / Reason (Cleaned) */}
                            <td style={{ fontSize: '0.80rem', color: 'var(--text-main)', maxWidth: '220px', wordBreak: 'break-word' }}>
                              <span title={rawRemarks} style={{ color: cleanedRemarks === '—' ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                {cleanedRemarks}
                              </span>
                            </td>

                            {/* 7. Action */}
                            <td style={{ textAlign: 'center', paddingRight: '14px', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => setLedgerTarget({ id: m.product_id, name: m.product_name, part_number: m.part_number })}
                                className="btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                title="View complete stock card history for this item"
                              >
                                <History size={12} /> Card
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {movementsPagination.total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>
                    Showing <strong>{((movementsPagination.page - 1) * movementsPagination.limit) + 1}</strong> - <strong>{Math.min(movementsPagination.page * movementsPagination.limit, movementsPagination.total)}</strong> of <strong>{movementsPagination.total}</strong> movements
                  </span>
                  <select
                    value={movementsLimit}
                    onChange={(e) => {
                      const lim = Number(e.target.value);
                      setMovementsLimit(lim);
                      fetchMovements(1, lim);
                    }}
                    className="input-premium"
                    style={{ padding: '2px 8px', fontSize: '0.78rem', width: 'auto', cursor: 'pointer', height: '30px' }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                {movementsPagination.totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <button
                      type="button"
                      disabled={movementsPagination.page <= 1}
                      onClick={() => fetchMovements(movementsPagination.page - 1, movementsLimit)}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.8rem', height: '30px', opacity: movementsPagination.page <= 1 ? 0.4 : 1 }}
                    >
                      Prev
                    </button>
                    <span style={{ fontSize: '0.8rem', padding: '0 8px', color: 'var(--text-main)', fontWeight: 600 }}>
                      Page {movementsPagination.page} of {movementsPagination.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={movementsPagination.page >= movementsPagination.totalPages}
                      onClick={() => fetchMovements(movementsPagination.page + 1, movementsLimit)}
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.8rem', height: '30px', opacity: movementsPagination.page >= movementsPagination.totalPages ? 0.4 : 1 }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: STOCK COUNT (PHYSICAL INVENTORY AUDIT)
         ========================================================================= */}
      {activeTab === 'physical_audit' && (
        <PhysicalInventoryAudit products={products} onAuditCompleted={fetchInventory} />
      )}

      {/* =========================================================================
          TAB 5: LOW STOCK / REORDER LIST
         ========================================================================= */}
      {isAdmin && activeTab === 'reorder_list' && (
        <LowStockReorderPanel products={products} onRefresh={fetchInventory} />
      )}







      {/* Item Stock Movement Ledger Drawer (Admin only) */}
      {isAdmin && activeTab !== 'movements' && (
        <ItemLedgerDrawer
          isOpen={ledgerTarget !== null}
          onClose={() => setLedgerTarget(null)}
          product={ledgerTarget}
        />
      )}

      {/* Print Stock / Out of Stock Report Modal (Admin only) */}
      {isAdmin && (
        <PrintInventoryModal
          isOpen={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          filterType={printFilterType}
        />
      )}
    </div>
  );
};

export default Inventory;
