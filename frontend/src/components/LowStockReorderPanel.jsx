import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Truck,
  MessageSquare,
  Search,
  PackageCheck,
  Layers
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { getStockStatus } from '../utils/productFilter';
import { getLedgerCategoryCode, getShortBrand, getCategoryBadgeMeta } from '../utils/categoryTaxonomy';

const LowStockReorderPanel = ({ products = [], onRefresh }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [groupBySupplier, setGroupBySupplier] = useState(true);

  // Filter low and out of stock items
  const reorderItems = useMemo(() => {
    return products.filter(p => {
      const status = getStockStatus(p);
      return status === 'low_stock' || status === 'out_of_stock';
    });
  }, [products]);

  // Unique suppliers among reorder items
  const supplierOptions = useMemo(() => {
    const names = new Set(reorderItems.map(p => p.supplier_name || p.default_facebook_supplier).filter(Boolean));
    return ['All', ...Array.from(names)];
  }, [reorderItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return reorderItems.filter(p => {
      const pName = (p.product_name || p.name || '').toLowerCase();
      const pSku = (p.part_number || p.sku || '').toLowerCase();
      const pBrand = (p.brand || '').toLowerCase();
      const suppName = p.supplier_name || p.default_facebook_supplier || '';
      const s = search.toLowerCase();

      const matchesSearch = !search || pName.includes(s) || pSku.includes(s) || pBrand.includes(s) || suppName.toLowerCase().includes(s);
      const matchesSupplier = supplierFilter === 'All' || suppName === supplierFilter;

      return matchesSearch && matchesSupplier;
    });
  }, [reorderItems, search, supplierFilter]);

  // Group filtered items by supplier
  const supplierGroups = useMemo(() => {
    const groups = {};
    filteredItems.forEach(p => {
      const supp = p.default_supplier_fb_page || p.default_facebook_supplier || p.supplier_name || 'Direct / Generic Supplier';
      if (!groups[supp]) {
        groups[supp] = {
          supplierName: supp,
          messengerUrl: p.default_supplier_messenger_url || p.messenger_url || null,
          items: [],
          totalEstimatedCost: 0,
          totalSuggestedUnits: 0
        };
      }
      const curStock = Number(p.stock ?? p.current_stock ?? 0);
      const reorderLvl = Number(p.reorder_level || 5);
      const suggestedOrder = Math.max(1, (reorderLvl * 2) - curStock);
      const costNum = Number(p.cost_price || 0);

      groups[supp].items.push(p);
      groups[supp].totalSuggestedUnits += suggestedOrder;
      groups[supp].totalEstimatedCost += (suggestedOrder * costNum);
      if (!groups[supp].messengerUrl && (p.default_supplier_messenger_url || p.messenger_url)) {
        groups[supp].messengerUrl = p.default_supplier_messenger_url || p.messenger_url;
      }
    });
    return Object.values(groups).sort((a, b) => b.totalEstimatedCost - a.totalEstimatedCost);
  }, [filteredItems]);

  // Statistics
  const outOfStockCount = reorderItems.filter(p => getStockStatus(p) === 'out_of_stock').length;
  const lowStockCount = reorderItems.filter(p => getStockStatus(p) === 'low_stock').length;
  const estimatedRestockValue = reorderItems.reduce((acc, p) => {
    const curStock = Number(p.stock ?? p.current_stock ?? 0);
    const reorderLvl = Number(p.reorder_level || 5);
    const deficit = Math.max(1, (reorderLvl * 2) - curStock);
    const cost = Number(p.cost_price || 0);
    return acc + (deficit * cost);
  }, 0);

  const handleGoToRestock = (p) => {
    // Navigate to Supplier & Stock Receive (Suppliers.jsx tab=receive_orders)
    navigate(`/suppliers?tab=receive_orders&productId=${p.id}`);
  };

  const renderProductRow = (p) => {
    const status = getStockStatus(p);
    const isOut = status === 'out_of_stock';
    const currentStock = Number(p.stock ?? p.current_stock ?? 0);
    const reorderLvl = Number(p.reorder_level || 5);
    const suggestedOrder = Math.max(1, (reorderLvl * 2) - currentStock);
    const costNum = Number(p.cost_price || 0);
    const totalEst = suggestedOrder * costNum;
    const fbPage = p.default_supplier_fb_page || p.default_facebook_supplier || p.supplier_name || 'Direct Supplier';
    const messengerUrl = p.default_supplier_messenger_url || p.messenger_url;
    const catCode = getLedgerCategoryCode(p.category);
    const catMeta = getCategoryBadgeMeta(catCode);
    const shortBrand = getShortBrand(p.brand);

    return (
      <tr key={p.id}>
        {/* 1. Product & Brand (with SKU • Short Brand • Cat Code on line 2) */}
        <td>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.86rem' }}>
            {p.product_name || p.name}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-muted)' }}>
              {p.part_number || p.sku}
            </span>
            <span>•</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
              {shortBrand}
            </span>
            <span>•</span>
            <span style={{
              fontWeight: 700,
              fontSize: '0.68rem',
              padding: '1px 5px',
              borderRadius: '4px',
              background: catMeta.bg,
              border: `1px solid ${catMeta.border}`,
              color: catMeta.color
            }}>
              {catCode}
            </span>
          </div>
        </td>

        {/* 2. Stock / Min (Merged Sellable Stock & Reorder Level) */}
        <td style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{
              fontSize: '0.88rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: isOut ? '#ef4444' : '#f59e0b',
              whiteSpace: 'nowrap'
            }}>
              {currentStock} / {reorderLvl}
            </span>
            <span style={{
              fontSize: '0.64rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              background: isOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: isOut ? '#ef4444' : '#f59e0b',
              border: isOut ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
              whiteSpace: 'nowrap'
            }}>
              {isOut ? 'OUT' : 'LOW'}
            </span>
          </div>
        </td>

        {/* 3. Suggested Order & Estimated Cost (Stacked) */}
        <td style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{
              padding: '2px 7px',
              borderRadius: '5px',
              fontWeight: 700,
              fontSize: '0.78rem',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              whiteSpace: 'nowrap'
            }}>
              +{suggestedOrder} pcs
            </span>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Est: <strong style={{ color: 'var(--text-main)' }}>{formatCurrency(totalEst)}</strong>
              {costNum > 0 && <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginLeft: '3px' }}>(@{formatCurrency(costNum)})</span>}
            </div>
          </div>
        </td>

        {/* 4. Default Facebook Supplier (Single Line, No Duplicate Subtitle) */}
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <span style={{
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              background: '#1877f2',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.70rem',
              fontWeight: 800,
              flexShrink: 0
            }}>
              f
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }} title={fbPage}>
              {fbPage}
            </span>
          </div>
        </td>

        {/* 5. Urgency / Shortage Status */}
        <td style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '6px',
            background: isOut ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            color: isOut ? '#ef4444' : '#f59e0b',
            border: isOut ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
            whiteSpace: 'nowrap'
          }}>
            {isOut ? 'Urgent' : 'Low Stock'}
          </span>
        </td>

        {/* 6. Actions (Always-Aligned Restock & Chat Buttons) */}
        <td style={{ textAlign: 'center', paddingRight: '14px', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleGoToRestock(p)}
              className="btn-primary"
              style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', width: '74px', justifyContent: 'center' }}
              title="Open Supplier & Stock Receive form for this item"
            >
              <Truck size={12} /> Restock
            </button>

            {messengerUrl ? (
              <a
                href={messengerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0ea5e9', whiteSpace: 'nowrap', width: '60px', justifyContent: 'center' }}
                title="Chat with Facebook Supplier on Messenger"
              >
                <MessageSquare size={12} /> Chat
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.35, cursor: 'not-allowed', whiteSpace: 'nowrap', width: '60px', justifyContent: 'center' }}
                title="No Messenger link registered for this supplier"
              >
                <MessageSquare size={12} /> Chat
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{
        padding: '18px 22px',
        borderRadius: '12px',
        background: 'rgba(245, 158, 11, 0.05)',
        border: '1.5px solid rgba(245, 158, 11, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f59e0b'
          }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Low Stock & Reorder Shortage List ({reorderItems.length} items needing restock)
            </div>
            <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Consolidated 6-column reorder sheet grouped by Facebook supplier for streamlined batch messaging and stock replenishment.
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate('/suppliers?tab=receive_orders')}
          style={{ height: '36px', padding: '0 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Truck size={15} /> Open Supplier & Stock Receive
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase' }}>Out of Stock (Urgent)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444', marginTop: '3px' }}>
            {outOfStockCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            0 sellable units remaining
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>Low Stock Alert</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', marginTop: '3px' }}>
            {lowStockCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            At or below reorder threshold
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Restock Puhunan</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)', marginTop: '3px' }}>
            {formatCurrency(estimatedRestockValue)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Calculated to reach 2x safety stock
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flex: '1 1 300px', maxWidth: '560px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search part name, SKU, brand, or FB supplier..."
                className="input-premium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '0.84rem' }}
              />
            </div>

            <select
              className="input-premium"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              style={{ width: '180px', height: '36px', fontSize: '0.82rem' }}
            >
              {supplierOptions.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All Suppliers' : s}</option>
              ))}
            </select>

            <button
              type="button"
              className={groupBySupplier ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setGroupBySupplier(!groupBySupplier)}
              style={{ height: '36px', padding: '0 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
              title="Toggle grouping by Facebook Supplier for batch ordering"
            >
              <Layers size={13} /> {groupBySupplier ? 'Grouped' : 'Flat'}
            </button>
          </div>

          <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredItems.length}</strong> items needing reorder
          </div>
        </div>

        {/* 6-Column Reorder Table */}
        <div className="table-container" style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: '240px' }}>Product & Brand</th>
                <th style={{ textAlign: 'center', minWidth: '95px' }}>Stock / Min</th>
                <th style={{ textAlign: 'center', minWidth: '150px' }}>Suggested Order & Cost</th>
                <th style={{ minWidth: '190px' }}>Default FB Supplier</th>
                <th style={{ textAlign: 'center', minWidth: '85px' }}>Status</th>
                <th style={{ textAlign: 'center', minWidth: '150px', paddingRight: '14px', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No motorparts currently need restock matching your filter.
                  </td>
                </tr>
              ) : groupBySupplier ? (
                supplierGroups.map(group => (
                  <React.Fragment key={`group-${group.supplierName}`}>
                    {/* Supplier Group Header Row */}
                    <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={6} style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '18px', height: '18px', borderRadius: '4px', background: '#1877f2', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.70rem', fontWeight: 800 }}>f</span>
                            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>{group.supplierName}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                              {group.items.length} {group.items.length === 1 ? 'part' : 'parts'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              Batch Units: <strong style={{ color: 'var(--text-main)' }}>+{group.totalSuggestedUnits} pcs</strong>
                            </span>
                            <span style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 700 }}>
                              Batch Est: {formatCurrency(group.totalEstimatedCost)}
                            </span>
                            {group.messengerUrl && (
                              <a
                                href={group.messengerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                                style={{ padding: '2px 8px', fontSize: '0.72rem', color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title={`Open Messenger to message ${group.supplierName} for batch reorder`}
                              >
                                <MessageSquare size={11} /> Batch Chat
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Product Rows in this Group */}
                    {group.items.map(p => renderProductRow(p))}
                  </React.Fragment>
                ))
              ) : (
                filteredItems.map(p => renderProductRow(p))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LowStockReorderPanel;
