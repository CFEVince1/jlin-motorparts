import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { History, Receipt, X, Printer } from 'lucide-react';
import Spinner from '../components/Spinner';

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Receipt Modal State
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [receiptDetails, setReceiptDetails] = useState(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

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
        window.print();
    };

    const closeReceipt = () => {
        setSelectedTransaction(null);
        setReceiptDetails(null);
    };

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            <h1 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <History size={32} color="var(--primary)" /> Transaction History
            </h1>

            <div className="glass-panel no-print" style={{ padding: '24px' }}>
                {loading ? <Spinner text="Loading transactions..." /> : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Receipt #</th>
                                    <th>Date & Time</th>
                                    <th>Cashier</th>
                                    <th>Total Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found.</td>
                                    </tr>
                                ) : (
                                    transactions.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>#{t.id}</td>
                                            <td>{new Date(t.sale_date).toLocaleString()}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{t.cashier}</td>
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
                            <div style={{ textAlign: 'left', fontSize: '0.85rem', marginTop: '8px', color: '#666' }}>
                                Cashier: <span style={{ textTransform: 'capitalize' }}>{receiptDetails.cashier}</span>
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
                            <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={handlePrint}>
                                <Printer size={20} /> Print
                            </button>
                            <button className="btn-secondary" style={{ flex: 1, padding: '12px', background: '#eee', color: '#333' }} onClick={closeReceipt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>
                {`
          @media print {
            body { background: white; color: black; }
            .no-print { display: none !important; }
            #printable-receipt { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%; 
                box-shadow: none; 
                border: none; 
                background: white;
                padding: 0 !important;
            }
            .receipt-overlay { background: transparent !important; }
          }
        `}
            </style>
        </div>
    );
};

export default Transactions;
