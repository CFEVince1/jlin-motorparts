import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer, Search, Calendar } from 'lucide-react';
import Spinner from '../components/Spinner';

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    // Filtering State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    
    // Reporting State
    const [timeframe, setTimeframe] = useState('Daily');

    const fetchTransactions = async () => {
        try {
            const res = await api.get('/sales');
            setTransactions(res.data);
        } catch (err) {
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
        } catch (err) {
            toast.error('Failed to load receipt details');
        } finally {
            setLoadingReceipt(false);
        }
    };

    const handlePrint = () => {
        if (selectedTransaction && receiptDetails) {
            // IFrame Print approach to guarantee pagination bypasses all app layouts
            const printContent = document.getElementById('printable-receipt').innerHTML;
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);
            
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <html>
                    <head>
                        <title>Receipt #${receiptDetails.id}</title>
                        <style>
                            @page { margin: 15mm; }
                            body { font-family: sans-serif; color: black; margin: 0; padding: 0; font-size: 14px; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                            th { border-bottom: 2px solid black; text-align: left; padding: 8px 0; }
                            td { border-bottom: 1px dashed #ccc; padding: 8px 0; }
                            .no-print, button, svg { display: none !important; }
                            .glass-panel { background: white; color: black; }
                        </style>
                    </head>
                    <body>
                        <div style="max-width: 400px; margin: 0 auto;">
                            ${printContent}
                        </div>
                    </body>
                </html>
            `);
            doc.close();
            
            // Allow time for render
            setTimeout(() => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                // Clean up iframe after print dialog opens
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            }, 250);
        } else {
            // Main history table uses standard window print
            window.print();
        }
    };

    const closeReceipt = () => {
        setSelectedTransaction(null);
        setReceiptDetails(null);
    };

    const filteredTransactions = transactions.filter(t => {
        const matchSearch = String(t.id).includes(searchQuery) || 
                            String(t.cashier).toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (t.products_included && String(t.products_included).toLowerCase().includes(searchQuery.toLowerCase()));
        let matchDate = true;
        if (filterDate) {
            // Need to handle localized date strings carefully if filtering by YYYY-MM-DD
            const tDateStr = new Date(t.sale_date);
            const offset = tDateStr.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(tDateStr - offset)).toISOString().split('T')[0];
            matchDate = localISOTime === filterDate;
        }
        return matchSearch && matchDate;
    }).sort((a, b) => {
        if (sortBy === 'newest') {
            return new Date(b.sale_date) - new Date(a.sale_date);
        } else if (sortBy === 'oldest') {
            return new Date(a.sale_date) - new Date(b.sale_date);
        } else if (sortBy === 'highest') {
            return Number(b.total_amount) - Number(a.total_amount);
        }
        return 0;
    });

    return (
        <div className={selectedTransaction ? 'receipt-modal-active' : ''} style={{ position: 'relative', height: '100%' }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                    <History size={32} color="var(--primary)" /> Transaction History
                </h1>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select className="input-premium" style={{ height: '44px' }} value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                        <option value="Daily">Daily Report</option>
                        <option value="Monthly">Monthly Report</option>
                        <option value="Yearly">Yearly Report</option>
                    </select>
                    <button onClick={handlePrint} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '44px' }}>
                        <Printer size={18} /> Print {timeframe} Transactions
                    </button>
                </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 300px' }}>
                    <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search by Receipt #, Cashier, or Product Name..." className="input-premium" style={{ paddingLeft: '48px', height: '50px', fontSize: '1rem', width: '100%' }} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                    <Calendar size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="date" className="input-premium" style={{ paddingLeft: '48px', paddingRight: '16px', height: '50px', fontSize: '1rem', width: '100%' }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                </div>
                <div style={{ flex: '0 0 auto' }}>
                    <select className="input-premium" style={{ height: '50px', width: '200px' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="newest">Sort: Newest First</option>
                        <option value="oldest">Sort: Oldest First</option>
                        <option value="highest">Sort: Highest Total</option>
                    </select>
                </div>
                {filterDate && (
                    <button className="btn-secondary" onClick={() => setFilterDate('')} style={{ height: '50px', padding: '0 16px', flex: '0 0 auto' }}>Clear Date</button>
                )}
            </div>

            <div id="print-area">
                <div className={`glass-panel ${selectedTransaction ? 'no-print' : ''}`} style={{ padding: '24px' }}>
                {loading ? <Spinner text="Loading transactions..." /> : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Receipt #</th>
                                    <th>Date & Time</th>
                                    <th>Cashier</th>
                                    <th>Payment Method</th>
                                    <th>Total Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No transactions match your search.</td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>#{t.id}</td>
                                            <td>{new Date(t.sale_date).toLocaleString()}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{t.cashier}</td>
                                            <td>{t.payment_method || 'Cash'}</td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>₱{Number(t.total_amount).toFixed(2)}</td>
                                            <td>
                                                <button 
                                                    onClick={() => handleViewReceipt(t.id)} 
                                                    className="btn-secondary"
                                                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                                    disabled={loadingReceipt}
                                                >
                                                    <Receipt size={16} /> View Receipt
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
                    <div id="printable-receipt" className="glass-panel" style={{ background: 'white', color: 'black', padding: '40px', width: '400px', borderRadius: '8px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        
                        <button className="no-print" onClick={closeReceipt} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
                            <X size={24} />
                        </button>

                        <div style={{ textAlign: 'center', borderBottom: '2px dashed #ccc', paddingBottom: '16px', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0 }}>JLIN Motorparts</h2>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#666' }}>Official Receipt (Reprint)</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '16px' }}>
                                <span>Receipt #: {receiptDetails.id}</span>
                                <span>{new Date(receiptDetails.sale_date).toLocaleDateString()} {new Date(receiptDetails.sale_date).toLocaleTimeString()}</span>
                            </div>
                            <div style={{ textAlign: 'left', fontSize: '0.85rem', marginTop: '8px', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Cashier: <span style={{ textTransform: 'capitalize' }}>{receiptDetails.cashier}</span></span>
                                <span>Payment: <strong>{receiptDetails.payment_method || 'Cash'}</strong></span>
                            </div>
                        </div>

                        <table style={{ width: '100%', marginBottom: '16px', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #eee' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 0', background: 'transparent', color: 'black' }}>Item</th>
                                    <th style={{ textAlign: 'center', padding: '8px 0', background: 'transparent', color: 'black' }}>Qty</th>
                                    <th style={{ textAlign: 'right', padding: '8px 0', background: 'transparent', color: 'black' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receiptDetails.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ padding: '8px 0', borderBottom: 'none' }}>
                                            <div>{item.product_name}</div>
                                            <div style={{ fontSize: '0.8em', color: '#666' }}>{item.brand}</div>
                                        </td>
                                        <td style={{ padding: '8px 0', textAlign: 'center', borderBottom: 'none' }}>{item.quantity}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', borderBottom: 'none' }}>₱{Number(item.subtotal).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ borderTop: '2px dashed #ccc', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.2rem' }}>
                            <span>TOTAL</span>
                            <span>₱{Number(receiptDetails.total_amount).toFixed(2)}</span>
                        </div>

                        <div className="no-print" style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                            <button className="btn-primary no-print" style={{ flex: 1, padding: '12px' }} onClick={handlePrint}>
                                <Printer size={20} /> Print
                            </button>
                            <button className="btn-secondary no-print" style={{ flex: 1, padding: '12px', background: '#eee', color: '#333' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>
                {`
  @media print {
    /* Hide everything globally first */
    body * {
      visibility: hidden;
    }

    /* --- MODE 1: PRINTING MAIN TABLE --- */
    #print-area, #print-area * {
      visibility: visible;
    }
    #print-area {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
    }
    #print-area * { color: black !important; }
    #print-area table { width: 100% !important; border-collapse: collapse !important; }
    #print-area th { border-bottom: 2px solid black !important; text-align: left; }
    #print-area td { border-bottom: 1px solid #ccc !important; }
    #print-area .glass-panel { background: transparent !important; border: none !important; box-shadow: none !important; }
  }
`}
            </style>
        </div>
    );
};

export default Transactions;
