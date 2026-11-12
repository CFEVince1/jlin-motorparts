import React from 'react';
import { Printer, Check, X, ArrowLeftRight } from 'lucide-react';
import { formatCurrency, formatAuditDate } from '../utils/formatters';

const ExchangeSlipModal = ({ isOpen, onClose, swap }) => {
    if (!isOpen || !swap) return null;

    const handlePrint = () => {
        window.print();
    };

    const isUpgrade = Number(swap.customer_top_up_paid || 0) > 0;
    const replacementItems = Array.isArray(swap.replacement_items) ? swap.replacement_items : [];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
        }}>
            <div className="glass-panel" style={{
                maxWidth: '460px',
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                maxHeight: '92vh',
                overflowY: 'auto'
            }}>
                {/* Close X */}
                <button
                    type="button"
                    onClick={onClose}
                    className="no-print"
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px'
                    }}
                >
                    <X size={20} />
                </button>

                {/* Printable Slip Container */}
                <div id="swap-slip-print">
                    <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border)', paddingBottom: '14px', marginBottom: '14px' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
                            JLIN MOTO PARTS
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '2px' }}>
                            Item Replacement &amp; Exchange Slip
                        </div>
                        <div style={{ fontSize: '0.92rem', fontFamily: 'monospace', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>
                            {swap.swap_code}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {formatAuditDate(swap.created_at || new Date().toISOString())}
                        </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                            <strong style={{ color: 'var(--text-main)' }}>{swap.customer_name || 'Walk-in Customer'}</strong>
                        </div>
                        {swap.order_number && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Original Receipt:</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{swap.order_number}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Reason:</span>
                            <span>{swap.reason || 'Item exchange / replacement'}</span>
                        </div>
                        {swap.processed_by && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Cashier:</span>
                                <span>{swap.processed_by}</span>
                            </div>
                        )}
                    </div>

                    {/* Item Comparison Section */}
                    <div style={{
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '12px',
                        background: 'var(--surface-hover)',
                        fontSize: '0.78rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginBottom: '14px'
                    }}>
                        {/* Returned Item */}
                        <div>
                            <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '2px' }}>
                                Returned Part (Trade-In Credit):
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-main)' }}>
                                <span>{swap.returned_product_name || 'Returned Motorpart'}</span>
                                <span style={{ fontFamily: 'monospace', color: '#ef4444', fontWeight: 800 }}>
                                    -{formatCurrency(swap.returned_credit_total || swap.returned_unit_price || 0)}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                                ✓ Inspected, Unused &amp; Restocked (+1 Stock)
                            </div>
                        </div>

                        {/* Replacement Item(s) */}
                        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                            <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Replacement Parts Issued ({replacementItems.length > 0 ? replacementItems.length : 1}):
                            </div>
                            {replacementItems.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {replacementItems.map((rep, rIdx) => (
                                        <div key={rIdx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.76rem' }}>
                                            <span>{rep.name || rep.product_name || 'Part'} <strong style={{ color: 'var(--text-muted)' }}>x{rep.qty}</strong></span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                +{formatCurrency(rep.total_price || (rep.unit_price * rep.qty))}
                                            </span>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '2px' }}>
                                        <span>Total Replacement Value:</span>
                                        <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(swap.new_total_price || 0)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.78rem', fontWeight: 600 }}>
                                    <span>{swap.new_product_name}</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>
                                        +{formatCurrency(swap.new_total_price || swap.new_unit_price || 0)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment / Top-Up Breakdown */}
                    <div style={{
                        borderTop: '1px dashed var(--border)',
                        paddingTop: '10px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Exchange Type:</span>
                            <strong style={{ color: isUpgrade ? '#3b82f6' : '#10b981' }}>
                                {isUpgrade ? 'UPGRADE EXCHANGE (+TOP-UP)' : 'EQUAL-VALUE EXCHANGE (₱0.00)'}
                            </strong>
                        </div>

                        {isUpgrade && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#10b981' }}>
                                    <span>Top-Up Paid ({swap.payment_method || 'Cash'}):</span>
                                    <span style={{ fontFamily: 'monospace' }}>+{formatCurrency(swap.customer_top_up_paid)}</span>
                                </div>
                                {swap.payment_method === 'Cash' && Number(swap.amount_tendered) > 0 && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                            <span>Amount Tendered:</span>
                                            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(swap.amount_tendered)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                            <span>Change Returned:</span>
                                            <span style={{ fontFamily: 'monospace' }}>{formatCurrency(swap.change_amount || 0)}</span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* Slip Footer */}
                    <div style={{
                        textAlign: 'center',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        borderTop: '1px dashed var(--border)',
                        paddingTop: '10px',
                        marginTop: '12px'
                    }}>
                        <div>Official Counter Exchange Slip • Thank you for your business!</div>
                        <div style={{ marginTop: '2px' }}>Parts inspected and verified prior to exchange</div>
                    </div>
                </div>

                {/* Buttons (Screen only) */}
                <div className="no-print" style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="btn-primary"
                        style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                        <Printer size={16} /> Print Slip
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                        style={{ flex: 1, padding: '10px' }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExchangeSlipModal;
