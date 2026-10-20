import { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContextValue';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer, Search, Calendar } from 'lucide-react';
import Spinner from '../components/Spinner';
import { getProductSnapshotMatch, normalizeSearchText } from '../utils/productFilter';
import useTableFilter from '../hooks/useTableFilter';
import { calculateSalesSummary } from '../utils/calculations';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import ReceiptPrint from '../components/ReceiptPrint';
import PrintTransactionsReportModal from '../components/PrintTransactionsReportModal';

const Transactions = () => {
    const { user } = useContext(AuthContext);
    const isStaff = user?.role === 'staff';
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [receiptWidth, setReceiptWidth] = useState('80mm');

    // Reporting State
    const [timeframe, setTimeframe] = useState('Daily');
    const [showPrintModal, setShowPrintModal] = useState(false);

    const filterTransactionsFn = useCallback((items, debouncedQuery, filters) => {
        const normalizedQuery = normalizeSearchText(debouncedQuery);
        return items.map((transaction, index) => {
            const snapshotMatch = getProductSnapshotMatch(transaction, normalizedQuery);
            const orderMatch = String(transaction.id).includes(normalizedQuery) ||
                normalizeSearchText(transaction.order_number).includes(normalizedQuery);
            const cashierMatch = normalizeSearchText(transaction.cashier).includes(normalizedQuery);
            const rank = orderMatch || cashierMatch ? 6 : snapshotMatch.rank;

            return {
                transaction,
                index,
                matchRank: rank
            };
        }).filter(({ transaction, matchRank }) => {
            const matchSearch = !normalizedQuery || Number.isFinite(matchRank);
            let matchDate = true;
            if (filters.date) {
                const tDateStr = new Date(transaction.sale_date);
                const offset = tDateStr.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(tDateStr - offset)).toISOString().split('T')[0];
                matchDate = localISOTime === filters.date;
            }
            return matchSearch && matchDate;
        }).sort((a, b) => {
            if (normalizedQuery && a.matchRank !== b.matchRank) {
                return a.matchRank - b.matchRank;
            }

            if (filters.sortBy === 'newest') {
                return new Date(b.transaction.sale_date) - new Date(a.transaction.sale_date);
            } else if (filters.sortBy === 'oldest') {
                return new Date(a.transaction.sale_date) - new Date(b.transaction.sale_date);
            } else if (filters.sortBy === 'highest') {
                return Number(b.transaction.total_amount) - Number(a.transaction.total_amount);
            }
            return a.index - b.index;
        }).map(({ transaction }) => transaction);
    }, []);

    const {
        searchQuery,
        handleSearchChange,
        filters,
        setFilter,
        filteredItems: filteredTransactions
    } = useTableFilter({
        items: transactions,
        initialFilters: { date: '', sortBy: 'newest' },
        filterFn: filterTransactionsFn
    });

    const filterDate = filters.date;
    const sortBy = filters.sortBy;

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });

    const fetchTransactions = async (page = 1) => {
        try {
            const res = await api.get('/sales', {
                params: {
                    page,
                    limit: 20
                }
            });
            const rawData = res.data;
            const salesList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setTransactions(salesList);
            if (rawData?.pagination) {
                setPagination(rawData.pagination);
            }
        } catch {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchTransactions(newPage);
        }
    };

    const getPageNumbers = () => {
        const pages = [];
        const maxButtons = 5;
        let start = Math.max(1, pagination.page - 2);
        let end = Math.min(pagination.totalPages, start + maxButtons - 1);
        if (end - start + 1 < maxButtons) {
            start = Math.max(1, end - maxButtons + 1);
        }
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    const handleViewReceipt = async (saleId) => {
        setLoadingReceipt(true);
        try {
            const res = await api.get(`/sales/${saleId}`);
            setReceiptDetails(res.data);
            setSelectedTransaction(saleId);
        } catch {
            toast.error('Failed to load receipt details');
        } finally {
            setLoadingReceipt(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const closeReceipt = () => {
        setSelectedTransaction(null);
        setReceiptDetails(null);
    };

    return (
        <div className={selectedTransaction ? 'receipt-modal-active' : ''} style={{ position: 'relative', height: '100%' }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <History size={32} color="var(--primary)" /> {isStaff ? 'Self History' : 'Transaction History'}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 44px' }}>
                        {isStaff
                            ? `Personal sales and checkout records for ${user?.username || 'your cashier account'}.`
                            : 'Complete audit log of all store sales transactions and cashier records.'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select className="input-premium" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                        <option value="Daily">Daily Report</option>
                        <option value="Monthly">Monthly Report</option>
                        <option value="Yearly">Yearly Report</option>
                    </select>
                    <button onClick={() => setShowPrintModal(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Printer size={16} /> Print {timeframe} {isStaff ? 'Self Records' : 'Transactions'}
                    </button>
                </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 280px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search order #, part number, motorcycle, product, brand, or size..." className="input-premium" style={{ paddingLeft: '36px', width: '100%' }} value={searchQuery} onChange={handleSearchChange} />
                </div>
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                    <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="date" className="input-premium" style={{ paddingLeft: '36px', paddingRight: '12px' }} value={filterDate} onChange={(e) => setFilter('date', e.target.value)} />
                </div>
                <div style={{ flex: '0 0 auto' }}>
                    <select className="input-premium" style={{ width: '180px' }} value={sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}>
                        <option value="newest">Sort: Newest First</option>
                        <option value="oldest">Sort: Oldest First</option>
                        <option value="highest">Sort: Highest Total</option>
                    </select>
                </div>
                {filterDate && (
                    <button className="btn-secondary" onClick={() => setFilter('date', '')} style={{ flex: '0 0 auto' }}>Clear Date</button>
                )}
            </div>

            <div id="print-area" className="printable-report">
                <div className={`glass-panel ${selectedTransaction ? 'no-print' : ''}`} style={{ padding: '24px' }}>
                {loading ? <Spinner text="Loading transactions..." /> : (
                    <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Order No.</th>
                                    <th>Date & Time</th>
                                    <th>Cashier</th>
                                    <th>Part Number</th>
                                    <th>Products</th>
                                    <th>Payment Method</th>
                                    <th className="text-right">Total Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="table-empty-state">No transactions match your search.</td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 'bold', color: t.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--primary)', fontFamily: 'monospace' }}>
                                                {t.order_number || `SO-${t.id}`}
                                                {t.status === 'VOIDED' && (
                                                    <span style={{
                                                        marginLeft: '6px',
                                                        display: 'inline-block',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 'bold',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)'
                                                    }}>
                                                        VOIDED
                                                    </span>
                                                )}
                                            </td>
                                            <td>{formatAuditDate(t.sale_date)}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{t.cashier}</td>
                                            <td>
                                                {t.part_numbers || t.part_number ? (
                                                    (t.part_numbers || t.part_number).split(',').map((pn, i) => {
                                                        const clean = pn.trim();
                                                        if (!clean) return null;
                                                        return (
                                                            <span
                                                                key={i}
                                                                style={{
                                                                    display: 'inline-block',
                                                                    padding: '2px 6px',
                                                                    margin: '2px 4px 2px 0',
                                                                    borderRadius: '4px',
                                                                    background: 'var(--surface-hover)',
                                                                    border: '1px solid var(--border)',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '600',
                                                                    color: 'var(--text-main)'
                                                                }}
                                                            >
                                                                {clean}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                )}
                                            </td>
                                            <td>
                                                <div>{t.products_included || '-'}</div>
                                                {t.compatibility_display && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.compatibility_display}</div>
                                                )}
                                            </td>
                                            <td>
                                                {t.payment_method === 'Split' ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        background: 'rgba(168, 85, 247, 0.15)',
                                                        color: '#c084fc',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        border: '1px solid rgba(168, 85, 247, 0.3)'
                                                    }}>
                                                        Split (Cash + GCash)
                                                    </span>
                                                ) : (
                                                    t.payment_method || 'Cash'
                                                )}
                                            </td>
                                            <td className="text-right" style={{
                                                fontWeight: 'bold',
                                                color: t.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--primary)',
                                                textDecoration: t.status === 'VOIDED' ? 'line-through' : 'none'
                                            }}>
                                                {formatCurrency(t.total_amount)}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleViewReceipt(t.id)}
                                                    className="btn-secondary"
                                                    style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}
                                                    disabled={loadingReceipt}
                                                >
                                                    <Receipt size={14} /> View Receipt
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {pagination.totalPages > 1 && (
                        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '8px' }}>
                                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                            </span>
                            <button
                                disabled={pagination.page <= 1}
                                onClick={() => handlePageChange(pagination.page - 1)}
                                className="btn-secondary"
                                style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: pagination.page <= 1 ? 0.5 : 1 }}
                            >
                                Prev
                            </button>

                            {getPageNumbers().map(pageNum => (
                                <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={pagination.page === pageNum ? "btn-primary" : "btn-secondary"}
                                    style={{ padding: '4px 12px', fontSize: '0.9rem' }}
                                >
                                    {pageNum}
                                </button>
                            ))}

                            <button
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => handlePageChange(pagination.page + 1)}
                                className="btn-secondary"
                                style={{ padding: '4px 12px', fontSize: '0.9rem', opacity: pagination.page >= pagination.totalPages ? 0.5 : 1 }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                    </>
                )}
            </div>
            </div>

            {/* RECEIPT MODAL (Only visible when selectedTransaction is set. Only this prints!) */}
            {selectedTransaction && receiptDetails && (
                <div className="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '40px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ background: 'white', color: 'black', padding: '24px', width: '420px', borderRadius: '8px', position: 'relative', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>

                        {/* Format selector (Screen only) */}
                        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: '#666', fontWeight: 600 }}>Paper:</span>
                            <button
                                type="button"
                                className={receiptWidth === '80mm' ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto', borderRadius: '4px' }}
                                onClick={() => setReceiptWidth('80mm')}
                            >
                                Standard 80mm
                            </button>
                            <button
                                type="button"
                                className={receiptWidth === '58mm' ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto', borderRadius: '4px' }}
                                onClick={() => setReceiptWidth('58mm')}
                            >
                                Compact 58mm
                            </button>
                        </div>

                        {receiptDetails.status === 'VOIDED' && (
                            <div className="no-print" style={{
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                color: '#ef4444',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 'bold',
                                marginBottom: '14px',
                                textAlign: 'center',
                                width: '100%'
                            }}>
                                THIS TRANSACTION HAS BEEN VOIDED / REOPENED
                            </div>
                        )}

                        <div className="receipt-container" style={{ display: 'block', width: '100%' }}>
                            <ReceiptPrint
                                orderNumber={receiptDetails.order_number || `SO-${receiptDetails.id}`}
                                date={receiptDetails.sale_date}
                                cashier={receiptDetails.cashier}
                                customerName={receiptDetails.customer_name || ''}
                                customerAddress={receiptDetails.customer_address || ''}
                                items={receiptDetails.items || []}
                                totalAmount={receiptDetails.total_amount}
                                paymentMethod={receiptDetails.payment_method || 'CASH'}
                                amountTendered={receiptDetails.tendered_amount || receiptDetails.total_amount}
                                changeDue={receiptDetails.change_due || 0}
                                gcashReference={receiptDetails.payment_reference || ''}
                                cashAmount={receiptDetails.cash_amount}
                                gcashAmount={receiptDetails.gcash_amount}
                                width={receiptWidth}
                            />
                        </div>

                        <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '10px', width: '100%' }}>
                            <button className="btn-primary no-print" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handlePrint}>
                                <Printer size={16} /> Print Receipt
                            </button>
                            <button className="btn-secondary no-print" style={{ flex: 1, padding: '10px 14px' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <PrintTransactionsReportModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                initialTimeframe={timeframe}
                user={user}
                transactions={filteredTransactions}
                currentFilterDate={filterDate}
                searchQuery={searchQuery}
            />
        </div>
    );
};

export default Transactions;
