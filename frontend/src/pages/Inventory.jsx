import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Search, SlidersHorizontal, BookOpen, Printer, ChevronDown, Layers, History, Package, Building2, Truck, X } from 'lucide-react';
import Spinner from '../components/Spinner';
import { filterProducts, getStockStatus } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { formatCurrency } from '../utils/formatters';
import AdjustmentModal from '../components/AdjustmentModal';
import ItemLedgerDrawer from '../components/ItemLedgerDrawer';
import PrintInventoryModal from '../components/PrintInventoryModal';

const Inventory = () => {
    const { user } = useContext(AuthContext);
    const isAdmin = user?.role === 'admin';
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [printFilterType, setPrintFilterType] = useState('out_of_stock');
    const [loading, setLoading] = useState(true);
    const [navDropdownOpen, setNavDropdownOpen] = useState(false);
    const navDropdownRef = useRef(null);

    // Phase 3 Modal and Drawer state
    const [adjustmentTarget, setAdjustmentTarget] = useState(null);
    const [ledgerTarget, setLedgerTarget] = useState(null);
    const [selectedSerialsModalProduct, setSelectedSerialsModalProduct] = useState(null);
    const [expandedSerials, setExpandedSerials] = useState(new Set());

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
        paginate
    } = useTableFilter({
        items: products,
        initialFilters: { category: 'All', brand: 'All', type: 'All' },
        itemsPerPage: 12,
        filterFn: (items, query, f) => filterProducts(items, query, {
            category: f.category,
            brand: f.brand,
            type: f.type
        })
    });

    const categoryFilter = filters.category;
    const brandFilter = filters.brand;
    const typeFilter = filters.type;

    const fetchInventory = async () => {
        try {
            const res = await api.get('/inventory');
            setProducts(res.data);
        } catch {
            toast.error('Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInventory();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (navDropdownRef.current && !navDropdownRef.current.contains(e.target)) {
                setNavDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const uniqueCategories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];

    const handleOpenPrint = (type) => {
        setPrintFilterType(type);
        setPrintModalOpen(true);
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h1 style={{ margin: 0 }}>Inventory Management</h1>

                {/* Top Action Bar: Dropdown Navigation & Print Stock */}
                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Inventory Navigation Dropdown */}
                    <div style={{ position: 'relative' }} ref={navDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setNavDropdownOpen(prev => !prev)}
                            className="btn-secondary"
                            id="inventory-modules-dropdown-btn"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                fontSize: '0.82rem',
                                padding: '7px 14px',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                fontWeight: 500,
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-main)',
                                transition: 'all 0.2s ease'
                            }}
                            title="Quick navigate to related inventory modules"
                        >
                            <Layers size={15} style={{ color: 'var(--primary)' }} />
                            <span>Inventory Modules</span>
                            <ChevronDown
                                size={14}
                                style={{
                                    transform: navDropdownOpen ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s ease',
                                    color: 'var(--text-muted)'
                                }}
                            />
                        </button>

                        {navDropdownOpen && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 6px)',
                                    right: 0,
                                    minWidth: '220px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
                                    padding: '6px',
                                    zIndex: 1000
                                }}
                            >
                                <div style={{
                                    padding: '6px 10px 4px 10px',
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.6px',
                                    color: 'var(--text-muted)',
                                    fontWeight: 600
                                }}>
                                    Inventory Modules
                                </div>

                                <button
                                    type="button"
                                    onClick={() => { setNavDropdownOpen(false); navigate('/transactions'); }}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '9px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '6px',
                                        color: 'var(--text-main)',
                                        cursor: 'pointer',
                                        fontSize: '0.84rem',
                                        textAlign: 'left',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <History size={16} style={{ color: '#38bdf8' }} />
                                    <span style={{ fontWeight: 500 }}>Transactions</span>
                                </button>

                                {isAdmin && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => { setNavDropdownOpen(false); navigate('/products'); }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '9px 12px',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'var(--text-main)',
                                                cursor: 'pointer',
                                                fontSize: '0.84rem',
                                                textAlign: 'left',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <Package size={16} style={{ color: '#10b981' }} />
                                            <span style={{ fontWeight: 500 }}>Product directory</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { setNavDropdownOpen(false); navigate('/suppliers'); }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '9px 12px',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'var(--text-main)',
                                                cursor: 'pointer',
                                                fontSize: '0.84rem',
                                                textAlign: 'left',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <Building2 size={16} style={{ color: '#f59e0b' }} />
                                            <span style={{ fontWeight: 500 }}>Suppliers</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { setNavDropdownOpen(false); navigate('/stock-receive'); }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '9px 12px',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'var(--text-main)',
                                                cursor: 'pointer',
                                                fontSize: '0.84rem',
                                                textAlign: 'left',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <Truck size={16} style={{ color: '#a855f7' }} />
                                            <span style={{ fontWeight: 500 }}>Stock receive</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Print Stock Actions (Both Admin and Staff) */}
                    <button
                        type="button"
                        onClick={() => handleOpenPrint('out_of_stock')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px', cursor: 'pointer' }}
                        title="Print Stock or Out of Stock Inventory Report"
                    >
                        <Printer size={15} /> Print Stock/Out of Stock
                    </button>
                </div>
            </div>

            {/* Inventory List Table (Full Width) */}
            <div className="glass-panel" style={{ padding: '20px', width: '100%' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>Current Stock Levels</h3>

                    {/* Responsive 4-column filter grid below title */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'center', width: '100%', marginBottom: '14px' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search Part #, Model, Name..."
                                className="input-premium"
                                style={{ paddingLeft: '32px', width: '100%' }}
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>
                        <div style={{ width: '100%' }}>
                            <select className="input-premium" value={brandFilter} onChange={(e) => setFilter('brand', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                                {uniqueBrands.map(brand => (
                                    <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ width: '100%' }}>
                            <select className="input-premium" value={categoryFilter} onChange={(e) => setFilter('category', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                                {uniqueCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ width: '100%' }}>
                            <select className="input-premium" value={typeFilter} onChange={(e) => setFilter('type', e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                                <option value="All">All Types</option>
                                <option value="Non-Serialized">Non-Serialized Only</option>
                                <option value="Serialized">Serialized Only</option>
                            </select>
                        </div>
                    </div>

                    {loading ? <Spinner text="Loading inventory..." /> : (
                        <div className="table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Part Number</th>
                                        <th>Name</th>
                                        <th style={{ minWidth: '170px' }}>Serial Number(s)</th>
                                        <th>Brand</th>
                                        <th>Size</th>
                                        <th>Compatibility</th>
                                        <th style={{ textAlign: 'right' }}>Price</th>
                                        <th>Stock Label</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map(p => (
                                        <React.Fragment key={p.id}>
                                        <tr>
                                            <td style={{ color: 'var(--text-muted)', fontWeight: '600', fontFamily: 'monospace' }}>{p.part_number}</td>
                                            <td style={{ fontWeight: '500' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>{p.product_name}</span>
                                                    {p.is_serialized ? (
                                                        <span className="badge-pill badge-serialized" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                            Serialized
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td>
                                                {p.is_serialized ? (
                                                    p.serials && p.serials.length > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandSerials(p.id)}
                                                            className="btn-secondary"
                                                            style={{
                                                                padding: '3px 8px',
                                                                fontSize: '0.72rem',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Toggle serial lots breakdown"
                                                        >
                                                            <span>{p.serials.length} serial lot{p.serials.length > 1 ? 's' : ''}</span>
                                                            <ChevronDown
                                                                size={13}
                                                                style={{
                                                                    transform: expandedSerials.has(p.id) ? 'rotate(180deg)' : 'none',
                                                                    transition: 'transform 0.15s ease'
                                                                }}
                                                            />
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No serials in stock</span>
                                                    )
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                )}
                                            </td>
                                            <td>{p.brand}</td>
                                            <td>{p.size || '-'}</td>
                                            <td>{p.compatibility_display || '-'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--primary)' }}>{formatCurrency(p.price)}</td>
                                            <td style={{
                                                color: getStockStatus(p) === 'low_stock' || getStockStatus(p) === 'out_of_stock' ? 'var(--danger)' : 'var(--success)',
                                                fontWeight: 'bold',
                                            }}>
                                                {p.stock} in stock
                                                {getStockStatus(p) === 'low_stock' && <span className="badge-pill" style={{marginLeft: '8px', background: 'var(--danger)', color: 'white'}}>LOW</span>}
                                                {getStockStatus(p) === 'out_of_stock' && <span className="badge-pill" style={{marginLeft: '8px', background: 'var(--danger)', color: 'white'}}>OUT</span>}
                                            </td>
                                        </tr>
                                        {p.is_serialized && expandedSerials.has(p.id) && (
                                            <tr key={`${p.id}_serials_breakdown`} style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                                                <td colSpan={8} style={{ padding: '10px 16px 14px 32px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                            Serial Lots Breakdown for {p.product_name}
                                                        </span>
                                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                            (Total Stock: <strong style={{ color: 'var(--text-main)' }}>{p.stock}</strong> units)
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {(p.serials || []).map(s => (
                                                            <div
                                                                key={s.id || s.serial_number}
                                                                style={{
                                                                    background: 'var(--surface-hover)',
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
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    ))}
                                    {filteredProducts.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="table-empty-state">
                                                No inventory stock matches your search or filter criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                                    <button
                                        disabled={currentPage === 1}
                                        onClick={() => paginate(currentPage - 1)}
                                        className="btn-secondary"
                                        style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: currentPage === 1 ? 0.5 : 1 }}
                                    >
                                        Prev
                                    </button>

                                    {[...Array(totalPages)].map((_, index) => (
                                        <button
                                            key={index + 1}
                                            onClick={() => paginate(index + 1)}
                                            className={currentPage === index + 1 ? "btn-primary" : "btn-secondary"}
                                            style={{ padding: '4px 12px', fontSize: '0.9rem' }}
                                        >
                                            {index + 1}
                                        </button>
                                    ))}

                                    <button
                                        disabled={currentPage === totalPages}
                                        onClick={() => paginate(currentPage + 1)}
                                        className="btn-secondary"
                                        style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: currentPage === totalPages ? 0.5 : 1 }}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            {/* Adjustment Modal */}
            <AdjustmentModal
                isOpen={adjustmentTarget !== null}
                onClose={() => setAdjustmentTarget(null)}
                product={adjustmentTarget}
                onSuccess={fetchInventory}
            />

            {/* Item Ledger Drawer */}
            <ItemLedgerDrawer
                isOpen={ledgerTarget !== null}
                onClose={() => setLedgerTarget(null)}
                product={ledgerTarget}
            />

            {/* View All Serial Numbers Modal */}
            {selectedSerialsModalProduct && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--surface, #1e293b)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        padding: '20px',
                        maxWidth: '480px',
                        width: '100%',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                    Serialized Units in Stock ({selectedSerialsModalProduct.serials?.length || 0})
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {selectedSerialsModalProduct.product_name} • <span style={{ fontFamily: 'monospace' }}>{selectedSerialsModalProduct.part_number}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedSerialsModalProduct(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{
                            overflowY: 'auto',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                            gap: '8px',
                            padding: '4px',
                            marginBottom: '14px'
                        }}>
                            {selectedSerialsModalProduct.serials?.map((s, idx) => (
                                <div
                                    key={s.id || idx}
                                    style={{
                                        background: 'rgba(22, 163, 74, 0.08)',
                                        border: '1px solid rgba(22, 163, 74, 0.2)',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        fontFamily: 'monospace',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <span>{s.serial_number}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                        {s.status || 'available'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedSerialsModalProduct(null)}
                                className="btn-secondary"
                                style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Inventory Stock Report Modal */}
            <PrintInventoryModal
                isOpen={printModalOpen}
                onClose={() => setPrintModalOpen(false)}
                products={products}
                initialFilter={printFilterType}
                user={user}
            />
        </div>
    );
};

export default Inventory;
