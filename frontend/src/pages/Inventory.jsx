import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ArrowUpCircle, ArrowDownCircle, PlusCircle, Search } from 'lucide-react';
import Spinner from '../components/Spinner';

const formatSKU = (category, id) => {
    if (!category) return `PRT-${String(id).padStart(4, '0')}`;
    return `${category.substring(0, 3).toUpperCase()}-${String(id).padStart(4, '0')}`;
};

const Inventory = () => {
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [quantity, setQuantity] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [brandFilter, setBrandFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const [adjustSearch, setAdjustSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;



    const fetchInventory = async () => {
        try {
            const res = await api.get('/inventory');
            setProducts(res.data);
        } catch (err) {
            toast.error('Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInventory();
    }, []);

    const handleStockAction = async (action) => {
        if (!selectedProduct || !quantity || quantity <= 0) {
            return toast.error('Please select a product and enter valid quantity');
        }

        try {
            await api.post(`/inventory/stock-${action}`, {
                product_id: selectedProduct,
                quantity: Number(quantity)
            });
            toast.success(`Stock ${action === 'in' ? 'added' : 'deducted'} successfully`);
            setQuantity('');
            setAdjustSearch('');
            setSelectedProduct('');
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };



    const uniqueCategories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    const uniqueBrands = ['All', ...new Set(products.map(p => p.brand).filter(Boolean))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              p.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              String(p.id).includes(searchQuery);
        const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
        const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
        
        let matchesType = true;
        if (typeFilter === 'Serialized') matchesType = p.is_serialized === 1 || p.is_serialized === true;
        if (typeFilter === 'Bulk') matchesType = p.is_serialized === 0 || p.is_serialized === false;

        return matchesSearch && matchesCategory && matchesBrand && matchesType;
    });

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    // Filter products for the custom dropdown
    const dropdownFiltered = products.filter(p => 
        p.product_name.toLowerCase().includes(adjustSearch.toLowerCase()) || 
        p.brand?.toLowerCase().includes(adjustSearch.toLowerCase())
    );

    // Handler for selecting a product from the custom dropdown
    const handleSelectProduct = (product) => {
        setSelectedProduct(product.id); // Save the ID for the backend
        setAdjustSearch(`${product.product_name} (${product.brand})`); // Show the name in the input
        setShowDropdown(false); // Hide the dropdown
    };

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Inventory Management</h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                
                {/* Actions & Adding Column */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    


                    {/* Adjust Stock Panel */}
                    <div className="glass-panel" style={{ padding: '24px', height: 'fit-content' }}>
                        <h3 style={{ marginBottom: '16px' }}>Adjust Existing Stock</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Custom Searchable Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text" 
                                    className="input-premium" 
                                    placeholder="Search product to adjust..." 
                                    value={adjustSearch}
                                    onChange={e => {
                                        setAdjustSearch(e.target.value);
                                        setShowDropdown(true);
                                        if (e.target.value === '') setSelectedProduct(''); // clear ID if they delete text
                                    }}
                                    onFocus={() => setShowDropdown(true)}
                                    // Delay onBlur so the onClick event on the dropdown items can fire first
                                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)} 
                                />
                                
                                {/* Floating Dropdown Menu */}
                                {showDropdown && adjustSearch && (
                                    <div style={{ 
                                        position: 'absolute', top: '100%', left: 0, right: 0, 
                                        background: 'var(--surface)', border: '1px solid var(--border)', 
                                        borderRadius: '8px', zIndex: 50, maxHeight: '250px', overflowY: 'auto',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', marginTop: '4px'
                                    }}>
                                        {dropdownFiltered.length > 0 ? (
                                            dropdownFiltered.map(p => (
                                                <div 
                                                    key={p.id} 
                                                    onMouseDown={(e) => {
                                                        // use onMouseDown instead of onClick to fire before onBlur of input
                                                        e.preventDefault(); 
                                                        handleSelectProduct(p);
                                                    }}
                                                    style={{ 
                                                        padding: '12px 16px', 
                                                        cursor: 'pointer', 
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{ fontWeight: '500' }}>{p.product_name}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        {formatSKU(p.category, p.id)} | {p.brand} | <span style={{color: p.stock <= 5 ? 'var(--danger)' : 'var(--success)'}}>Stock: {p.stock}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>No matching products</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <input
                                type="number"
                                placeholder="Quantity to Add/Remove"
                                className="input-premium"
                                min="1"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                            />

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button
                                    className="btn-primary"
                                    style={{ flex: 1, background: 'linear-gradient(135deg, var(--success) 0%, #28a745 100%)' }}
                                    onClick={() => handleStockAction('in')}
                                >
                                    <ArrowUpCircle size={20} /> Stock In
                                </button>
                                <button
                                    className="btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={() => handleStockAction('out')}
                                >
                                    <ArrowDownCircle size={20} /> Stock Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Inventory List Column */}
                <div className="glass-panel" style={{ flex: '2 1 500px', padding: '24px', overflowX: 'auto', minWidth: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                        <h3 style={{ margin: 0 }}>Current Stock Levels</h3>
                        
                        <div className="responsive-filter-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '300px' }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input 
                                    type="text" 
                                    placeholder="Search Parts No., Name or Brand..." 
                                    className="input-premium" 
                                    style={{ paddingLeft: '40px', width: '100%' }} 
                                    value={searchQuery}
                                    onChange={e => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                            <div style={{ flex: '1 1 120px', maxWidth: '200px' }}>
                                <select className="input-premium" value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setCurrentPage(1); }} style={{ width: '100%', cursor: 'pointer' }}>
                                    {uniqueBrands.map(brand => (
                                        <option key={brand} value={brand}>{brand === 'All' ? 'All Brands' : brand}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 120px', maxWidth: '200px' }}>
                                <select className="input-premium" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }} style={{ width: '100%', cursor: 'pointer' }}>
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: '1 1 120px', maxWidth: '200px' }}>
                                <select className="input-premium" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }} style={{ width: '100%', cursor: 'pointer' }}>
                                    <option value="All">All Types</option>
                                    <option value="Bulk">Bulk Only</option>
                                    <option value="Serialized">Serialized Only</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    {loading ? <Spinner text="Loading inventory..." /> : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Parts No.</th>
                                        <th>Name</th>
                                        <th>Brand</th>
                                        <th>Price</th>
                                        <th>Stock Label</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ color: 'var(--text-muted)', fontWeight: '500' }}>{formatSKU(p.category, p.id)}</td>
                                            <td>{p.product_name}</td>
                                            <td>{p.brand}</td>
                                            <td>₱{Number(p.price).toFixed(2)}</td>
                                            <td style={{
                                                color: p.stock <= 5 ? 'var(--danger)' : 'var(--success)',
                                                fontWeight: 'bold',
                                            }}>
                                                {p.stock} in stock
                                                {p.stock <= 5 && <span style={{marginLeft: '8px', fontSize: '0.75rem', padding: '2px 6px', background: 'var(--danger)', color: 'white', borderRadius: '4px'}}>LOW</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredProducts.length === 0 && (
                                        <tr>
                                            <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No products found.</td>
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

            </div>
        </div>
    );
};

export default Inventory;
