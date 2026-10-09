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

const Transactions = () => {
    const { user } = useContext(AuthContext);
    const isStaff = user?.role === 'staff';
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    // Reporting State
    const [timeframe, setTimeframe] = useState('Daily');

    const filterTransactionsFn = useCallback((items, debouncedQuery, filters) => {
        const normalizedQuery = normalizeSearchText(debouncedQuery);
        return items.map((transaction, index) => {
            const snapshotMatch = getProductSnapshotMatch(transaction, normalizedQuery);
            const receiptMatch = String(transaction.id).includes(normalizedQuery);
            const cashierMatch = normalizeSearchText(transaction.cashier).includes(normalizedQuery);
            const rank = receiptMatch || cashierMatch ? 6 : snapshotMatch.rank;

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

    const fetchTransactions = async () => {
        try {
            const res = await api.get('/sales');
            setTransactions(res.data);
        } catch {
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
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
                    <button onClick={handlePrint} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Printer size={16} /> Print {timeframe} {isStaff ? 'Self Records' : 'Transactions'}
                    </button>
                </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 280px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search receipt, part number, motorcycle, product, brand, or size..." className="input-premium" style={{ paddingLeft: '36px', width: '100%' }} value={searchQuery} onChange={handleSearchChange} />
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
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Receipt #</th>
                                    <th>Date & Time</th>
                                    <th>Cashier</th>
                                    <th>Parts</th>
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
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>#{t.id}</td>
                                            <td>{formatAuditDate(t.sale_date)}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{t.cashier}</td>
                                            <td>{t.part_numbers || '-'}</td>
                                            <td>
                                                <div>{t.products_included || '-'}</div>
                                                {t.compatibility_display && (
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.compatibility_display}</div>
                                                )}
                                            </td>
                                            <td>{t.payment_method || 'Cash'}</td>
                                            <td className="text-right" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(t.total_amount)}</td>
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
                )}
            </div>
            </div>

            {/* RECEIPT MODAL (Only visible when selectedTransaction is set. Only this prints!) */}
            {selectedTransaction && receiptDetails && (
                <div className="receipt-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel" style={{ background: 'white', color: 'black', padding: '24px', width: '420px', borderRadius: '8px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>

                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>

                        <ReceiptPrint
                            orderNumber={receiptDetails.order_number || `SO-${receiptDetails.id}`}
                            date={receiptDetails.sale_date}
                            cashier={receiptDetails.cashier}
                            items={receiptDetails.items || []}
                            totalAmount={receiptDetails.total_amount}
                            paymentMethod={receiptDetails.payment_method || 'CASH'}
                            amountTendered={receiptDetails.tendered_amount || receiptDetails.total_amount}
                            changeDue={receiptDetails.change_due || 0}
                            gcashReference={receiptDetails.payment_reference || ''}
                            width="80mm"
                        />

                        <div className="no-print" style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                            <button className="btn-primary no-print" style={{ flex: 1, padding: '10px' }} onClick={handlePrint}>
                                <Printer size={18} /> Print
                            </button>
                            <button className="btn-secondary no-print" style={{ flex: 1, padding: '10px' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transactions;
