import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContextValue';
import {
  Building2,
  Truck,
  Plus,
  Trash2,
  CheckCircle,
  Search,
  History,
  Eye,
  Calendar,
  Printer,
  X,
  FileText,
  ChevronRight,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Edit3,
  UserCheck,
  UserX,
  PackagePlus,
  RotateCcw,
  Layers,
  ArrowRight,
  ShieldAlert,
  MessageSquare,
  ExternalLink,
  CreditCard,
  Copy,
  AlertTriangle,
  User,
  ChevronDown,
  ChevronUp,
  Package
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatCurrency, formatAuditDate } from '../utils/formatters';
import { getShortBrand, getLedgerCategoryCode } from '../utils/categoryTaxonomy';
import QuickAddSupplierModal from '../components/QuickAddSupplierModal';
import EditSupplierModal from '../components/EditSupplierModal';
import AddProductModal from '../components/AddProductModal';

const formatReceivingRef = (rawRef, dateStr, id) => {
  if (!rawRef) return id ? `RCV-${String(id).padStart(4, '0')}` : '-';
  const str = String(rawRef).trim();
  if (/^RCV-\d{6}$/i.test(str)) return str;

  // Timestamps or legacy DR/FB codes
  const tsMatch = str.match(/17\d{11}/);
  if (tsMatch && dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const seq = id ? String(id).padStart(2, '0').slice(-2) : '01';
      return `RCV-${mm}${dd}-${seq}`;
    }
  }

  if (str.startsWith('DR-') || str.startsWith('FB-') || str === 'FB') {
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const seq = id ? String(id).padStart(2, '0').slice(-2) : '01';
        return `RCV-${mm}${dd}-${seq}`;
      }
    }
  }

  return str;
};
import PurchaseOrdersManager from '../components/PurchaseOrdersManager';
import SupplierProofGallery from '../components/SupplierProofGallery';
import SupplierLedgerView from '../components/SupplierLedgerView';

/**
 * Common Defect / Rejection Reasons for Motorcycle Parts (Returned to Driver)
 */
const COMMON_REJECTION_REASONS = [
  'Cracked / Broken in Transit (Handed back to driver)',
  'Deep Scratches / Damaged Anodized Coating',
  'Bent / Deformed Bracket or Housing',
  'Stripped Thread / Defective Machining',
  'Wrong Part / Incompatible Motorcycle Spec Shipped by FB Seller',
  'Broken Packaging / Leaking Fluid Container',
  'Defective Electrical / Damaged Wire Harness',
  'Missing Components / Incomplete Hardware Set',
  'Other / Custom Defect'
];

/**
 * Common Courier Services used by Philippine Facebook Suppliers
 */
const COURIER_OPTIONS = [
  'Lalamove',
  'J&T Express',
  'Toktok',
  'Grab Express',
  'Supplier In-House Rider / Van',
  'Victory Liner Cargo / Bus',
  'AP Cargo',
  'Other Courier'
];

/**
 * Suppliers & Stock Receive (Unified Supplier Management Module)
 * 
 * Tailored for Facebook Suppliers & Rigorous Shop Pre-Acceptance Inspection:
 * - Tab 1: Receive Stock (Multi-Item Delivery Inward Intake with Mandatory Mechanic Physical Inspection)
 * - Tab 2: Restock Orders / Receiving History (Full inspection audit & Driver Return Slips)
 * - Tab 3: Facebook Supplier Directory (Messenger links, GCash accounts, Seller contacts)
 */
export const Purchasing = ({ defaultTab }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const initialTab = useMemo(() => {
    if (!isAdmin) return 'receive_orders';
    const qTab = searchParams.get('tab');
    if (qTab === 'receive_orders' || qTab === 'receive' || defaultTab === 'receive_orders') {
      return 'receive_orders';
    }
    // Default for Admin when clicking Purchasing is Purchase Orders
    return 'purchase_orders';
  }, [searchParams, defaultTab, isAdmin]);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isIntakeExpanded, setIsIntakeExpanded] = useState(true);

  // Section 6: Supplier Command Center (Directory, Proofs, Ledger) subtab states
  const [supplierSubTab, setSupplierSubTab] = useState('list'); // 'list' | 'proofs' | 'ledger'
  const [selectedSupplierForLedgerId, setSelectedSupplierForLedgerId] = useState(null);
  const [selectedSupplierForProofsId, setSelectedSupplierForProofsId] = useState(null);

  // Modals for adding products and suppliers
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [addProductRowIndex, setAddProductRowIndex] = useState(null);

  // Keep state synced if URL changes
  useEffect(() => {
    if (!isAdmin) {
      setActiveTab('receive_orders');
      return;
    }
    const qTab = searchParams.get('tab');
    if (qTab === 'receive_orders' || qTab === 'receive') {
      setActiveTab('receive_orders');
    } else {
      setActiveTab('purchase_orders');
    }
  }, [searchParams, isAdmin]);

  const handleTabChange = (tab) => {
    if (!isAdmin && tab !== 'receive_orders') return;
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Shared Data States
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------
  // TAB 1: RECEIVE STOCK FORM STATE (WITH MECHANIC INSPECTION & DRIVER RETURN)
  // -------------------------------------------------------------
  const [supplierId, setSupplierId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [deliveryPersonnel, setDeliveryPersonnel] = useState('');
  const [courierService, setCourierService] = useState('Lalamove');
  const [mechanicName, setMechanicName] = useState(user?.username || 'Staff');
  const [receiverName, setReceiverName] = useState(user?.username || 'Admin');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [mechanicVerified, setMechanicVerified] = useState(false);

  // Active selected supplier object
  const selectedSupplierObj = useMemo(() => {
    return suppliers.find(s => String(s.id) === String(supplierId)) || null;
  }, [suppliers, supplierId]);

  // Line items state supporting Delivered, Accepted (stock-in), and Rejected (returned to driver)
  const [lineItems, setLineItems] = useState([
    {
      optionValue: '',
      itemId: '',
      targetType: '',
      serialId: null,
      serialNumber: '',
      newSerialNumber: '',
      deliveredQuantity: '',
      quantity: '',
      rejectedQuantity: 0,
      rejectionReason: '',
      costPrice: '',
      lotStock: 0
    }
  ]);

  // Modal for Driver Rejection / Return Slip after intake
  const [driverRejectionModalData, setDriverRejectionModalData] = useState(null);

  // -------------------------------------------------------------
  // LOW STOCK / CATALOG RESTOCK SHORTCUTS STATE & FILTER
  // -------------------------------------------------------------
  const [showLowStockShortcuts, setShowLowStockShortcuts] = useState(true);
  const [restockSearchTerm, setRestockSearchTerm] = useState('');

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const stock = Number(p.stock ?? p.current_stock ?? 0);
      const reorder = Number(p.reorder_level ?? 0);
      return reorder > 0 ? stock <= reorder : stock <= 5;
    }).length;
  }, [products]);

  const [filterBySupplierOnly, setFilterBySupplierOnly] = useState(false);

  const restockShortcutProducts = useMemo(() => {
    const term = restockSearchTerm.trim().toLowerCase();
    let baseList = products;

    // Filter by selected supplier if active
    if (filterBySupplierOnly && supplierId) {
      const suppMatches = products.filter(p => 
        String(p.supplier_id) === String(supplierId) || 
        (selectedSupplierObj && (p.supplier_name === selectedSupplierObj.name || p.default_facebook_supplier === selectedSupplierObj.name))
      );
      if (suppMatches.length > 0) {
        baseList = suppMatches;
      }
    }

    if (!term) {
      // By default: items that are at or below reorder level
      return baseList.filter(p => {
        const stock = Number(p.stock ?? p.current_stock ?? 0);
        const reorder = Number(p.reorder_level ?? 0);
        return reorder > 0 ? stock <= reorder : stock <= 5;
      }).sort((a, b) => {
        const stockA = Number(a.stock ?? a.current_stock ?? 0);
        const stockB = Number(b.stock ?? b.current_stock ?? 0);
        return stockA - stockB; // Critically low or 0 stock first
      });
    }

    // When admin types any term, dynamically search the ENTIRE product catalog (including healthy stock)
    return baseList.filter(p => {
      const name = String(p.name || p.product_name || '').toLowerCase();
      const brand = String(p.brand || '').toLowerCase();
      const sku = String(p.sku || p.part_number || '').toLowerCase();
      const cat = String(p.category || '').toLowerCase();
      const size = String(p.size || '').toLowerCase();
      const spec = String(p.measurement || '').toLowerCase();
      const thread = String(p.thread_type || '').toLowerCase();
      return name.includes(term) || brand.includes(term) || sku.includes(term) || cat.includes(term) || size.includes(term) || spec.includes(term) || thread.includes(term);
    }).slice(0, 30);
  }, [products, restockSearchTerm, filterBySupplierOnly, supplierId, selectedSupplierObj]);

  // -------------------------------------------------------------
  // TAB 2: RECEIVING HISTORY STATE
  // -------------------------------------------------------------
  const [receivingHistory, setReceivingHistory] = useState([]);
  const [historySummary, setHistorySummary] = useState({
    total_batches: 0,
    total_units_received: 0,
    total_units_rejected: 0,
    total_received_value: 0,
    total_rejected_value: 0
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySupplier, setHistorySupplier] = useState('ALL');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [activeModalSlipView, setActiveModalSlipView] = useState('receiving'); // 'receiving' | 'rejection'

  // -------------------------------------------------------------
  // TAB 3: SUPPLIER DIRECTORY STATE
  // -------------------------------------------------------------
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive' | 'facebook'
  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState(null);

  // -------------------------------------------------------------
  // DATA FETCHING
  // -------------------------------------------------------------
  const fetchSuppliersAndProducts = async () => {
    try {
      setLoading(true);
      const [suppRes, prodRes] = await Promise.all([
        api.get('/suppliers?includeInactive=true'),
        api.get('/products')
      ]);
      const suppData = suppRes.data || [];
      setSuppliers(suppData);
      setProducts(prodRes.data || []);

      // If active supplierId not selected yet, pick first active supplier
      const activeSupp = suppData.filter(s => s.is_active);
      if (activeSupp.length > 0 && !supplierId) {
        setSupplierId(activeSupp[0].id);
      }
    } catch (err) {
      console.error('Failed to load suppliers or products', err);
      toast.error('Failed to load suppliers or products catalog');
    } finally {
      setLoading(false);
    }
  };

  const fetchReceivingHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = {};
      if (historySupplier !== 'ALL') params.supplierId = historySupplier;
      if (historyStartDate) params.startDate = historyStartDate;
      if (historyEndDate) params.endDate = historyEndDate;
      if (historySearch.trim()) params.search = historySearch.trim();

      const res = await api.get('/inventory/receiving-history', { params });
      const raw = res.data;
      const records = Array.isArray(raw) ? raw : (raw?.data || raw?.records || []);
      setReceivingHistory(records);
      if (raw?.summary) {
        setHistorySummary(raw.summary);
      }
    } catch (err) {
      console.error('Failed to load receiving history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historySupplier, historyStartDate, historyEndDate, historySearch]);

  useEffect(() => {
    fetchSuppliersAndProducts();
    fetchReceivingHistory();
  }, [fetchReceivingHistory]);

  // Callback when a brand-new product is registered via "+ Put New Product" modal
  const handleProductCreated = (newProd) => {
    fetchSuppliersAndProducts();

    if (addProductRowIndex !== null && addProductRowIndex >= 0 && addProductRowIndex < lineItems.length) {
      setLineItems(prev => {
        const next = [...prev];
        next[addProductRowIndex] = {
          ...next[addProductRowIndex],
          optionValue: newProd.is_serialized ? `ns:${newProd.id}` : `p:${newProd.id}`,
          itemId: newProd.id,
          targetType: newProd.is_serialized ? 'new_serial' : 'non_serialized',
          costPrice: newProd.cost_price || '',
          lotStock: 0,
          deliveredQuantity: '',
          quantity: '',
          rejectedQuantity: 0,
          rejectionReason: ''
        };
        return next;
      });
      setAddProductRowIndex(null);
    } else {
      setLineItems(prev => {
        if (prev.length === 1 && !prev[0].optionValue) {
          return [{
            optionValue: newProd.is_serialized ? `ns:${newProd.id}` : `p:${newProd.id}`,
            itemId: newProd.id,
            targetType: newProd.is_serialized ? 'new_serial' : 'non_serialized',
            serialId: null,
            serialNumber: '',
            newSerialNumber: '',
            deliveredQuantity: '',
            quantity: '',
            rejectedQuantity: 0,
            rejectionReason: '',
            costPrice: newProd.cost_price || '',
            lotStock: 0
          }];
        }
        return [
          ...prev,
          {
            optionValue: newProd.is_serialized ? `ns:${newProd.id}` : `p:${newProd.id}`,
            itemId: newProd.id,
            targetType: newProd.is_serialized ? 'new_serial' : 'non_serialized',
            serialId: null,
            serialNumber: '',
            newSerialNumber: '',
            deliveredQuantity: '',
            quantity: '',
            rejectedQuantity: 0,
            rejectionReason: '',
            costPrice: newProd.cost_price || '',
            lotStock: 0
          }
        ];
      });
    }

    setIsIntakeExpanded(true);
    toast.success(`Brand-new part "${newProd.name}" registered and added to delivery!`);
  };

  // Options for receiving select dropdown
  const receiveOptions = useMemo(() => {
    const list = [];
    if (isAdmin) {
      list.push({
        value: '__NEW_PRODUCT__',
        targetType: '__NEW_PRODUCT__',
        productId: '__NEW__',
        label: '✨ + Put New Product (Register to Catalog)...',
        lotStock: 0,
        costPrice: 0
      });
    }
    products.forEach(p => {
      if (p.is_serialized) {
        if (p.serials && p.serials.length > 0) {
          p.serials.forEach(s => {
            list.push({
              value: `s:${p.id}:${s.id}`,
              targetType: 'existing_serial',
              productId: p.id,
              serialId: s.id,
              serialNumber: s.serial_number,
              label: `[Lot: ${s.serial_number}] ${p.product_name || p.name} (${p.brand}) • Current: ${s.quantity || 0} units`,
              lotStock: Number(s.quantity || 0),
              costPrice: p.cost_price || 0
            });
          });
        }
        list.push({
          value: `ns:${p.id}`,
          targetType: 'new_serial',
          productId: p.id,
          serialId: null,
          serialNumber: '',
          label: `+ [New Lot/Serial] ${p.product_name || p.name} (${p.brand}) - Register new batch`,
          lotStock: 0,
          costPrice: p.cost_price || 0
        });
      } else {
        list.push({
          value: `p:${p.id}`,
          targetType: 'non_serialized',
          productId: p.id,
          serialId: null,
          serialNumber: '',
          label: `${p.product_name || p.name} (${p.brand}) • Current: ${p.stock ?? 0} units`,
          lotStock: Number(p.stock ?? 0),
          costPrice: p.cost_price || 0
        });
      }
    });
    return list;
  }, [products]);

  // -------------------------------------------------------------
  // TAB 1 ACTIONS (RECEIVING FORM WITH INSPECTION & DRIVER RETURN)
  // -------------------------------------------------------------
  // Handler when clicking "Inspect Delivery" on a Purchase Order
  const handleReceiveOrderFromPO = (po) => {
    if (!po) return;
    if (po.supplier_id) setSupplierId(po.supplier_id);
    if (po.po_number) setReferenceNo(po.po_number);
    if (po.courier_name) setCourierService(po.courier_name);
    if (po.tracking_number) setDeliveryPersonnel(`Rider (${po.courier_name} #${po.tracking_number})`);

    if (po.items && po.items.length > 0) {
      const mapped = po.items.map(item => ({
        optionValue: `prod_${item.product_id}`,
        itemId: item.product_id,
        targetType: 'non_serialized',
        serialId: null,
        serialNumber: '',
        newSerialNumber: '',
        deliveredQuantity: item.quantity,
        quantity: item.quantity,
        rejectedQuantity: 0,
        rejectionReason: '',
        costPrice: item.unit_cost,
        lotStock: 0
      }));
      setLineItems(mapped);
    }
    setIsIntakeExpanded(true);
    handleTabChange('receive_orders');
    toast.success(`PO ${po.po_number} loaded into Pre-Acceptance Inspection Gate! Inspect each piece before accepting.`);
  };

  const addRow = () => {
    setLineItems(prev => [
      ...prev,
      {
        optionValue: '',
        itemId: '',
        targetType: '',
        serialId: null,
        serialNumber: '',
        newSerialNumber: '',
        deliveredQuantity: '',
        quantity: '',
        rejectedQuantity: 0,
        rejectionReason: '',
        costPrice: '',
        lotStock: 0
      }
    ]);
  };

  /**
   * One-Click Low Stock Restock Shortcut handler:
   * Appends a new line item, pre-selects the product, sets its unit cost,
   * and focuses the "Sent by Supplier" input field.
   */
  const handleQuickRestock = (product) => {
    const foundOpt = receiveOptions.find(o => o.productId === product.id && o.targetType !== '__NEW_PRODUCT__');
    const optionValue = foundOpt ? foundOpt.value : (product.is_serialized ? `ns:${product.id}` : `p:${product.id}`);
    const targetType = foundOpt ? foundOpt.targetType : (product.is_serialized ? 'new_serial' : 'non_serialized');
    const serialId = foundOpt ? foundOpt.serialId : null;
    const serialNumber = foundOpt ? foundOpt.serialNumber : '';
    const lotStock = foundOpt ? foundOpt.lotStock : Number(product.stock ?? product.current_stock ?? 0);

    const newRow = {
      optionValue,
      itemId: product.id,
      targetType,
      serialId,
      serialNumber,
      newSerialNumber: '',
      deliveredQuantity: '',
      quantity: '',
      rejectedQuantity: 0,
      rejectionReason: '',
      costPrice: product.cost_price || '',
      lotStock
    };

    let targetIndex = 0;
    setLineItems(prev => {
      if (prev.length === 1 && !prev[0].optionValue) {
        targetIndex = 0;
        return [newRow];
      }
      targetIndex = prev.length;
      return [...prev, newRow];
    });

    setIsIntakeExpanded(true);
    toast.success(`Added "${product.product_name || product.name}" to delivery check!`);

    setTimeout(() => {
      const input = document.getElementById(`delivered-qty-${targetIndex}`);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 120);
  };

  const removeRow = (index) => {
    if (lineItems.length === 1) {
      toast.error('Receiving record must contain at least one line item');
      return;
    }
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    setLineItems(prev => {
      const next = [...prev];
      const row = { ...next[index] };

      if (field === 'optionValue') {
        if (value === '__NEW_PRODUCT__') {
          if (!isAdmin) {
            toast.error('Only Admin/Owner can register new products into the catalog.');
            return prev;
          }
          setAddProductRowIndex(index);
          setIsAddProductOpen(true);
          return prev;
        }
        const selected = receiveOptions.find(o => o.value === value);
        if (selected) {
          row.optionValue = value;
          row.itemId = selected.productId;
          row.targetType = selected.targetType;
          row.serialId = selected.serialId;
          row.serialNumber = selected.serialNumber;
          row.newSerialNumber = selected.targetType === 'new_serial' ? (row.newSerialNumber || '') : '';
          row.lotStock = selected.lotStock;
          row.costPrice = row.costPrice || selected.costPrice || '';
        } else {
          row.optionValue = '';
          row.itemId = '';
          row.targetType = '';
          row.serialId = null;
          row.serialNumber = '';
          row.newSerialNumber = '';
          row.lotStock = 0;
        }
      } else if (field === 'deliveredQuantity') {
        const deliv = Math.max(0, parseInt(value, 10) || 0);
        row.deliveredQuantity = value;
        const currentRej = Math.max(0, parseInt(row.rejectedQuantity, 10) || 0);
        row.quantity = Math.max(0, deliv - currentRej);
      } else if (field === 'quantity') {
        const acc = Math.max(0, parseInt(value, 10) || 0);
        row.quantity = value;
        const deliv = Math.max(0, parseInt(row.deliveredQuantity, 10) || 0);
        if (deliv > 0) {
          row.rejectedQuantity = Math.max(0, deliv - acc);
          if (row.rejectedQuantity > 0 && !row.rejectionReason) {
            row.rejectionReason = COMMON_REJECTION_REASONS[0];
          }
        }
      } else if (field === 'rejectedQuantity') {
        const rej = Math.max(0, parseInt(value, 10) || 0);
        row.rejectedQuantity = value;
        const deliv = Math.max(0, parseInt(row.deliveredQuantity, 10) || 0);
        if (deliv > 0) {
          row.quantity = Math.max(0, deliv - rej);
        }
        if (rej > 0 && !row.rejectionReason) {
          row.rejectionReason = COMMON_REJECTION_REASONS[0];
        }
      } else {
        row[field] = value;
      }

      next[index] = row;
      return next;
    });
  };

  const totalsSummary = useMemo(() => {
    let shippedTotal = 0;
    let acceptedTotal = 0;
    let rejectedTotal = 0;
    let totalDeliveredUnits = 0;
    let totalAcceptedUnits = 0;
    let totalRejectedUnits = 0;

    lineItems.forEach(row => {
      const cost = Math.max(0, parseFloat(row.costPrice) || 0);
      const deliv = Math.max(0, parseInt(row.deliveredQuantity, 10) || 0);
      const acc = Math.max(0, parseInt(row.quantity, 10) || 0);
      const rej = Math.max(0, parseInt(row.rejectedQuantity, 10) || 0);

      shippedTotal += deliv * cost;
      acceptedTotal += acc * cost;
      rejectedTotal += rej * cost;
      totalDeliveredUnits += deliv;
      totalAcceptedUnits += acc;
      totalRejectedUnits += rej;
    });

    return {
      shippedTotal,
      acceptedTotal,
      rejectedTotal,
      totalDeliveredUnits,
      totalAcceptedUnits,
      totalRejectedUnits
    };
  }, [lineItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!mechanicVerified) {
      toast.error('Please check the verification box confirming physical inspection.');
      return;
    }

    const activeSupp = suppliers.find(s => s.is_active);
    const finalSupplierId = Number(supplierId) || (activeSupp ? activeSupp.id : 1);
    const finalRefNo = referenceNo.trim() || `RCV-${Date.now().toString().slice(-6)}`;
    const cleanDriver = (deliveryPersonnel.trim() || 'Direct Restock / Courier Rider');
    const cleanCourier = (courierService || 'Lalamove');
    const cleanReceiver = receiverName.trim() || user?.username || 'Admin';
    const cleanMechanic = cleanReceiver;

    // Validate rows
    const seenExistingSerialIds = new Set();
    const seenNewSerials = new Set();
    const seenNonSerialized = new Set();
    const formattedItems = [];

    for (let i = 0; i < lineItems.length; i++) {
      const row = lineItems[i];
      if (!row.optionValue || !row.itemId) {
        toast.error(`Line item #${i + 1} has no product selected`);
        return;
      }

      const prod = products.find(p => String(p.id) === String(row.itemId));
      const prodName = prod?.product_name || prod?.name || `Item #${row.itemId}`;

      if (row.targetType === 'existing_serial') {
        if (seenExistingSerialIds.has(Number(row.serialId))) {
          toast.error(`Duplicate serial lot selected at row #${i + 1}. Consolidate quantity into a single row.`);
          return;
        }
        seenExistingSerialIds.add(Number(row.serialId));
      } else if (row.targetType === 'new_serial') {
        const cleanSn = String(row.newSerialNumber || '').trim();
        if (!cleanSn) {
          toast.error(`Please enter a serial number for "${prodName}" at row #${i + 1}.`);
          return;
        }
        if (seenNewSerials.has(cleanSn)) {
          toast.error(`Duplicate serial number "${cleanSn}" detected in delivery batch at row #${i + 1}.`);
          return;
        }
        seenNewSerials.add(cleanSn);
      } else if (row.targetType === 'non_serialized') {
        if (seenNonSerialized.has(Number(row.itemId))) {
          toast.error(`Product duplicate detected at row #${i + 1}. Consolidate quantities into a single row.`);
          return;
        }
        seenNonSerialized.add(Number(row.itemId));
      }

      const deliv = parseInt(row.deliveredQuantity, 10);
      if (isNaN(deliv) || deliv <= 0) {
        toast.error(`Invalid delivered quantity for "${prodName}" at row #${i + 1}. Must be at least 1 unit.`);
        return;
      }

      const acc = parseInt(row.quantity, 10);
      const rej = parseInt(row.rejectedQuantity, 10) || 0;
      if (acc + rej !== deliv) {
        toast.error(`Row #${i + 1} count mismatch: Good (${acc}) + Damaged (${rej}) must equal Sent by Supplier (${deliv}).`);
        return;
      }

      const cost = Number(row.costPrice);
      if (isNaN(cost) || cost < 0) {
        toast.error(`Invalid cost price at row #${i + 1}`);
        return;
      }

      formattedItems.push({
        itemId: Number(row.itemId),
        product_id: Number(row.itemId),
        delivered_quantity: deliv,
        quantity: acc,
        accepted_quantity: acc,
        rejected_quantity: rej,
        rejection_reason: rej > 0 ? (row.rejectionReason || COMMON_REJECTION_REASONS[0]) : null,
        costPrice: cost,
        serial_id: row.targetType === 'existing_serial' ? Number(row.serialId) : null,
        serial_number: row.targetType === 'new_serial' ? String(row.newSerialNumber || '').trim().toUpperCase() : null
      });
    }

    setSubmitting(true);
    try {
      await api.post('/inventory/receive', {
        supplierId: finalSupplierId,
        referenceNo: finalRefNo,
        deliveryPersonnel: cleanDriver,
        courierService: cleanCourier,
        mechanicName: cleanMechanic,
        receiverName: cleanReceiver,
        receivedDate: receivedDate || new Date().toISOString().slice(0, 10),
        notes: deliveryNotes.trim() || undefined,
        items: formattedItems
      });

      if (totalsSummary.totalRejectedUnits > 0) {
        toast.success(`Pre-acceptance inspection recorded! ${totalsSummary.totalAcceptedUnits} good units added to inventory. ${totalsSummary.totalRejectedUnits} damaged units rejected & claim opened.`);
        // Open Driver Rejection modal view
        setSelectedHistoryRecord({
          reference_number: finalRefNo,
          supplier_name: selectedSupplierObj?.name || 'Facebook Supplier',
          seller_contact_name: selectedSupplierObj?.seller_contact_name || selectedSupplierObj?.contact_person || 'Seller',
          courier_service: cleanCourier,
          delivery_personnel: cleanDriver,
          mechanic_name: cleanMechanic,
          receiver_name: cleanReceiver,
          received_date: receivedDate,
          total_quantity: totalsSummary.totalAcceptedUnits,
          total_rejected_qty: totalsSummary.totalRejectedUnits,
          total_cost: totalsSummary.acceptedTotal,
          total_rejected_amount: totalsSummary.rejectedTotal,
          items: formattedItems.map(it => {
            const p = products.find(x => x.id === it.product_id);
            return {
              product_name: p?.product_name || p?.name,
              brand: p?.brand,
              delivered_quantity: it.delivered_quantity,
              quantity: it.quantity,
              rejected_quantity: it.rejected_quantity,
              rejection_reason: it.rejection_reason,
              cost_price: it.costPrice
            };
          })
        });
        setActiveModalSlipView('rejection');
      } else {
        toast.success(`Delivery accepted! ${totalsSummary.totalAcceptedUnits} units verified 100% good and stocked into inventory.`);
      }

      setLineItems([{
        optionValue: '',
        itemId: '',
        targetType: '',
        serialId: null,
        serialNumber: '',
        newSerialNumber: '',
        deliveredQuantity: '',
        quantity: '',
        rejectedQuantity: 0,
        rejectionReason: '',
        costPrice: '',
        lotStock: 0
      }]);
      setReferenceNo('');
      setDeliveryNotes('');
      await fetchSuppliersAndProducts();
      await fetchReceivingHistory();
    } catch (err) {
      console.error('Failed to submit receiving record', err);
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Failed to submit stock receiving';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to copy FB Messenger rejection summary to clipboard
  const handleCopyMessengerSummary = (data) => {
    if (!data) return;
    const itemsText = data.rejectedItems?.map(it => 
      `• ${it.product_name} (${it.brand}): ${it.rejected_quantity} pcs - Reason: ${it.reason}`
    ).join('\n') || '';

    const text = 
`Hi ${data.sellerContact || data.supplierName || 'Boss'},
Regarding our order Ref #${data.referenceNo} delivered by ${data.driverName} via ${data.courierService}:

Our receiving staff physically inspected the box upon arrival before your driver departed:
✅ Accepted into Store Stock: ${data.totalAcceptedUnits} good units (₱${data.totalAcceptedAmount.toLocaleString()})
❌ REJECTED & RETURNED TO DRIVER: ${data.totalRejectedUnits} damaged units (-₱${data.totalRejectedAmount.toLocaleString()})

Items Handed Back to Driver on the Spot:
${itemsText}

Deduction from payment: -₱${data.totalRejectedAmount.toLocaleString()}
Net Approved Payable: ₱${data.totalAcceptedAmount.toLocaleString()}

Please confirm the returned items with your rider. Thank you! - JLIN Moto Parts`;

    navigator.clipboard.writeText(text);
    toast.success('Driver return summary copied! Ready to paste into FB Messenger.');
  };

  // -------------------------------------------------------------
  // TAB 3 ACTIONS (SUPPLIER DIRECTORY)
  // -------------------------------------------------------------
  const handleSupplierCreated = (newSupplier) => {
    setSuppliers(prev => [newSupplier, ...prev]);
    setSupplierId(newSupplier.id);
  };

  const handleSupplierUpdated = (updatedSupplier) => {
    setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
  };

  const handleToggleStatus = async (supplier) => {
    const nextStatus = !supplier.is_active;
    const actionLabel = nextStatus ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} supplier "${supplier.name}"?`)) {
      return;
    }

    try {
      await api.put(`/suppliers/${supplier.id}`, { is_active: nextStatus });
      toast.success(`Supplier "${supplier.name}" marked as ${nextStatus ? 'active' : 'inactive'}`);
      fetchSuppliersAndProducts();
    } catch (err) {
      console.error('Failed to toggle supplier status', err);
      toast.error(err.response?.data?.message || 'Failed to update supplier status');
    }
  };

  const handleDirectReceiveFromSupplier = (supplier) => {
    setSupplierId(supplier.id);
    handleTabChange('receive');
  };

  // Filtered Suppliers for Directory
  const filteredSuppliers = suppliers.filter(s => {
    const term = supplierSearchTerm.toLowerCase();
    const matchesSearch = (
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.fb_page_name && s.fb_page_name.toLowerCase().includes(term)) ||
      (s.seller_contact_name && s.seller_contact_name.toLowerCase().includes(term)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.phone && s.phone.toLowerCase().includes(term)) ||
      (s.gcash_account_number && s.gcash_account_number.toLowerCase().includes(term)) ||
      (s.address && s.address.toLowerCase().includes(term))
    );

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return Boolean(s.is_active);
    if (statusFilter === 'inactive') return !s.is_active;
    if (statusFilter === 'facebook') return Boolean(s.messenger_url || s.fb_page_name);
    return true;
  });

  if (!isAdmin) {
    return (
      <div className="glass-panel" style={{ maxWidth: '480px', margin: '48px auto', padding: '36px 24px', textAlign: 'center', borderRadius: '16px' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <ShieldAlert size={24} />
        </div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
          Admin Access Required
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
          Purchasing and inventory delivery receiving are restricted to Owner / Admin accounts.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minWidth: 0, paddingBottom: '32px' }}>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-receiving-slip-modal, #print-receiving-slip-modal *,
          #print-driver-rejection-modal, #print-driver-rejection-modal * {
            visibility: visible !important;
          }
          #print-receiving-slip-modal, #print-driver-rejection-modal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Title & Top Navigation Tabs */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.75rem', fontWeight: 'bold' }}>
            <Building2 size={28} style={{ color: 'var(--primary)' }} />
            {isAdmin ? 'Purchasing & Restock Orders' : 'Receive Delivery (Parcel Inspection Gate)'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            {isAdmin ? 'Manage Facebook Purchase Orders, inward deliveries, and inventory restock receiving.' : 'Physical parcel counting: count and record Qty Checked & Good vs. Qty Damaged on Arrival.'}
          </p>
        </div>

        {/* View Switcher Tabs & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              id="put-new-product-header-btn"
              onClick={() => {
                setAddProductRowIndex(null);
                setIsAddProductOpen(!isAddProductOpen);
              }}
              style={{
                height: '38px',
                padding: '0 16px',
                fontSize: '0.84rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
              title="Register new motorcycle part in catalog"
            >
              <Package size={16} />
              <span>{isAddProductOpen ? '✕ Close' : '+ New Part'}</span>
            </button>
          )}

          <div style={{ display: 'inline-flex', background: 'var(--surface-hover)', padding: '4px', borderRadius: '10px', gap: '6px', flexWrap: 'wrap' }}>
            {isAdmin && (
              <button
                type="button"
                id="tab-purchase-orders-btn"
                className={activeTab === 'purchase_orders' ? 'btn-primary' : 'btn-secondary'}
                style={{
                  height: '36px',
                  padding: '0 14px',
                  fontSize: '0.82rem',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: activeTab === 'purchase_orders' ? 'var(--primary)' : 'transparent',
                  color: activeTab === 'purchase_orders' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none'
                }}
                onClick={() => handleTabChange('purchase_orders')}
              >
                <FileText size={15} /> Purchase Orders
              </button>
            )}

            <button
              type="button"
              id="tab-receive-delivery-btn"
              className={activeTab === 'receive_orders' ? 'btn-primary' : 'btn-secondary'}
              style={{
                height: '36px',
                padding: '0 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                background: activeTab === 'receive_orders' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'receive_orders' ? '#ffffff' : 'var(--text-muted)',
                border: 'none'
              }}
              onClick={() => handleTabChange('receive_orders')}
            >
              <Truck size={15} /> Receive Delivery
            </button>

          </div>
        </div>
      </div>



      {/* =========================================================================
          TAB 1: PURCHASE ORDERS (FB MESSENGER ORDERS)
         ========================================================================= */}
      {activeTab === 'purchase_orders' && isAdmin && (
        <PurchaseOrdersManager
          suppliers={suppliers}
          products={products}
          onReceiveOrder={handleReceiveOrderFromPO}
        />
      )}

      {/* =========================================================================
          TAB 2: RECEIVE DELIVERY (PRE-ACCEPTANCE INSPECTION GATE) & RESTOCK HISTORY
         ========================================================================= */}
      {activeTab === 'receive_orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          
          {/* INLINE FORM: PUT NEW PRODUCT / REGISTER NEW PART (ADMIN ONLY, NO MODAL, NO GLASS PANEL) */}
          {isAdmin && isAddProductOpen && (
            <AddProductModal
              isOpen={true}
              asPanel={true}
              onClose={() => {
                setIsAddProductOpen(false);
                setAddProductRowIndex(null);
              }}
              onSuccess={(newProduct) => {
                handleProductCreated(newProduct);
                setIsAddProductOpen(false);
              }}
            />
          )}

          {/* Section 1: Delivery Intake & Physical Inspection Panel (Image 1 Pre-Acceptance Gate) */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div
              style={{
                padding: '14px 20px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: isIntakeExpanded ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)'
                  }}
                >
                  <PackagePlus size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Receive Incoming Delivery & Inspect Items
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Open package, check parts while the driver waits, and add good items to inventory.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsIntakeExpanded(!isIntakeExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    padding: '6px 12px'
                  }}
                  title={isIntakeExpanded ? 'Collapse Intake Form' : 'Open Delivery Intake'}
                >
                  {isIntakeExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  <span>{isIntakeExpanded ? 'Hide Delivery Form' : '+ Receive New Delivery'}</span>
                </button>
              </div>
            </div>

            {isIntakeExpanded && (
              <div style={{ padding: '20px' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Delivery Source & Reference Information */}
                  <div className="glass-panel" style={{ padding: '18px 20px', border: '1px solid var(--border)', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                      <Building2 size={18} color="var(--primary)" />
                      <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Delivery Source & Reference Information
                      </h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', width: '100%' }}>
                      {/* 1. Supplier / FB Source */}
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                          Supplier / FB Source <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <select
                          id="delivery-supplier-select"
                          className="input-premium"
                          value={supplierId}
                          onChange={(e) => setSupplierId(e.target.value)}
                          required
                          disabled={submitting}
                          style={{ width: '100%', height: '40px', fontSize: '0.84rem', maxWidth: '100%', textOverflow: 'ellipsis' }}
                        >
                          <option value="">-- Select Supplier --</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.fb_page_name ? `${s.fb_page_name} • ${s.name}` : s.name}
                            </option>
                          ))}
                        </select>
                        {selectedSupplierObj && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {selectedSupplierObj.fb_page_name && <span>FB: <strong style={{ color: 'var(--text-main)' }}>{selectedSupplierObj.fb_page_name}</strong></span>}
                            {selectedSupplierObj.contact_person && <span> • Contact: <strong style={{ color: 'var(--text-main)' }}>{selectedSupplierObj.contact_person}</strong></span>}
                          </div>
                        )}
                      </div>

                      {/* 2. Invoice / OR Reference No. */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                          Invoice / OR Reference No. <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          id="delivery-reference-no-input"
                          className="input-premium"
                          placeholder="e.g. INV-2026-0041, OR-5512, Waybill #"
                          value={referenceNo}
                          onChange={(e) => setReferenceNo(e.target.value)}
                          required
                          disabled={submitting}
                          style={{ width: '100%', height: '40px', fontSize: '0.86rem', fontFamily: 'monospace', fontWeight: 600 }}
                        />
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Official Receipt (OR), Supplier Invoice, or Courier Waybill reference #
                        </div>
                      </div>

                      {/* 3. Courier / Delivery Service */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                          Courier / Delivery Service
                        </label>
                        <select
                          id="delivery-courier-select"
                          className="input-premium"
                          value={courierService}
                          onChange={(e) => setCourierService(e.target.value)}
                          disabled={submitting}
                          style={{ width: '100%', height: '40px', fontSize: '0.86rem' }}
                        >
                          {COURIER_OPTIONS.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* 4. Delivery Rider / Driver Name */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                          Delivery Rider / Driver Name
                        </label>
                        <input
                          type="text"
                          id="delivery-rider-input"
                          className="input-premium"
                          placeholder="e.g. Kuya Nico (Lalamove Rider)"
                          value={deliveryPersonnel}
                          onChange={(e) => setDeliveryPersonnel(e.target.value)}
                          disabled={submitting}
                          style={{ width: '100%', height: '40px', fontSize: '0.86rem' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Needs Restock / Low Stock Items Panel */}
                  <div className="glass-panel" style={{ padding: '16px 20px', border: '1px solid rgba(245, 158, 11, 0.25)', background: 'rgba(245, 158, 11, 0.02)', borderRadius: '10px', maxWidth: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#d97706',
                          flexShrink: 0
                        }}>
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                              Needs Restock / Low Stock Items
                            </h3>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: restockSearchTerm ? 'rgba(59, 130, 246, 0.15)' : (lowStockCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                              color: restockSearchTerm ? '#3b82f6' : (lowStockCount > 0 ? '#d97706' : '#10b981')
                            }}>
                              {restockSearchTerm ? `${restockShortcutProducts.length} results found` : `${lowStockCount} items need attention`}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {restockSearchTerm
                              ? `Searching across entire product catalog for "${restockSearchTerm}". Click "+ Restock This" to add any item.`
                              : 'Quickly add parts that are at or below reorder levels directly into this delivery check table with one click.'}
                          </p>
                        </div>
                      </div>

                      {/* Search & Collapse Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', justifyContent: 'flex-end', minWidth: '300px', flexWrap: 'wrap' }}>
                        {supplierId && selectedSupplierObj && (
                          <button
                            type="button"
                            onClick={() => setFilterBySupplierOnly(prev => !prev)}
                            className={filterBySupplierOnly ? 'btn-primary' : 'btn-secondary'}
                            style={{
                              fontSize: '0.74rem',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Filter cards to the supplier chosen above"
                          >
                            <Building2 size={12} />
                            {filterBySupplierOnly ? `Only ${selectedSupplierObj.name}` : 'All Suppliers'}
                          </button>
                        )}

                        <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            id="restock-catalog-search-input"
                            className="input-premium"
                            placeholder="Search any product to restock (e.g. part name, brand, SKU)..."
                            value={restockSearchTerm}
                            onChange={(e) => {
                              setRestockSearchTerm(e.target.value);
                              if (!showLowStockShortcuts) setShowLowStockShortcuts(true);
                            }}
                            style={{
                              paddingLeft: '32px',
                              paddingRight: restockSearchTerm ? '30px' : '10px',
                              fontSize: '0.8rem',
                              paddingTop: '6px',
                              paddingBottom: '6px',
                              width: '100%'
                            }}
                          />
                          {restockSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setRestockSearchTerm('')}
                              style={{
                                position: 'absolute',
                                right: '8px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Clear search"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn-secondary"
                          id="toggle-low-stock-shortcuts-btn"
                          onClick={() => setShowLowStockShortcuts(prev => !prev)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.78rem',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {showLowStockShortcuts ? (
                            <>
                              <ChevronUp size={15} /> Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown size={15} /> Show
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {showLowStockShortcuts && (
                      <div style={{ marginTop: '14px', maxWidth: '100%', overflow: 'hidden' }}>
                        {restockShortcutProducts.length === 0 ? (
                          <div style={{
                            padding: '16px',
                            textAlign: 'center',
                            background: 'var(--surface)',
                            borderRadius: '8px',
                            border: '1px dashed var(--border)',
                            fontSize: '0.82rem',
                            color: 'var(--text-muted)'
                          }}>
                            {restockSearchTerm
                              ? `No products found matching "${restockSearchTerm}". Try another part name, SKU, or brand.`
                              : '✓ All catalog products currently have healthy inventory levels above their reorder thresholds.'}
                          </div>
                        ) : (
                          <div style={{
                            display: 'flex',
                            gap: '12px',
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            padding: '4px 2px 10px 2px',
                            width: '100%',
                            maxWidth: '100%',
                            scrollSnapType: 'x mandatory'
                          }}>
                            {restockShortcutProducts.map(prod => {
                              const currentStock = Number(prod.stock ?? prod.current_stock ?? 0);
                              const reorderLevel = Number(prod.reorder_level || 5);
                              const isOutOfStock = currentStock <= 0;
                              const isLowStock = currentStock > 0 && currentStock <= reorderLevel;
                              const isHealthyStock = currentStock > reorderLevel;
                              const shortBrand = getShortBrand(prod.brand);
                              const shortCat = getLedgerCategoryCode(prod.category);
                              const specsText = `${shortBrand} • ${shortCat}`;

                              let badgeStyle = {
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                whiteSpace: 'nowrap',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                flexShrink: 0
                              };
                              let badgeText = '0 units left (Out)';

                              if (isLowStock) {
                                badgeStyle = {
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  whiteSpace: 'nowrap',
                                  background: 'rgba(245, 158, 11, 0.15)',
                                  color: '#d97706',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  flexShrink: 0
                                };
                                badgeText = `${currentStock} ${currentStock === 1 ? 'unit' : 'units'} left (Low)`;
                              } else if (isHealthyStock) {
                                badgeStyle = {
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  whiteSpace: 'nowrap',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#10b981',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  flexShrink: 0
                                };
                                badgeText = `${currentStock} units in stock`;
                              }

                              return (
                                <div
                                  key={prod.id}
                                  className="low-stock-quick-card"
                                  data-product-id={prod.id}
                                  style={{
                                    flex: '0 0 240px',
                                    minWidth: '240px',
                                    maxWidth: '240px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                    scrollSnapAlign: 'start',
                                    overflow: 'hidden'
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px', minWidth: 0 }}>
                                      <h4 style={{
                                        margin: 0,
                                        fontSize: '0.86rem',
                                        fontWeight: 700,
                                        color: 'var(--text-main)',
                                        lineHeight: '1.25',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        minWidth: 0,
                                        flex: 1
                                      }} title={prod.name || prod.product_name}>
                                        {prod.name || prod.product_name}
                                      </h4>
                                      <span style={badgeStyle}>
                                        {badgeText}
                                      </span>
                                    </div>

                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={specsText}>
                                      <strong style={{ color: 'var(--text-main)' }}>{shortBrand}</strong>
                                      {' • '}
                                      <span style={{
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid var(--border)'
                                      }}>
                                        {shortCat}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '4px' }}>
                                      <span>Reorder alert: <strong style={{ color: 'var(--text-main)' }}>{reorderLevel}</strong></span>
                                      <span>Cost: <strong style={{ color: 'var(--text-main)' }}>₱{Number(prod.cost_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className="btn-primary restock-this-btn"
                                    onClick={() => handleQuickRestock(prod)}
                                    disabled={submitting}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      fontSize: '0.8rem',
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      width: '100%',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <PackagePlus size={15} /> + Restock This
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Check Items in the Delivery Table */}
                  <div className="glass-panel" style={{ padding: '20px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={18} style={{ color: 'var(--primary)' }} /> Check Items in the Delivery
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Enter total delivered in box. If damaged parts are found, type rejected quantity to return to driver immediately.
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={addRow}
                          disabled={submitting}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                        >
                          <Plus size={15} /> Add Line Item
                        </button>
                      </div>
                    </div>

                    <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflowX: 'auto', width: '100%' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '8px 10px', minWidth: '180px' }}>Part / Product</th>
                            <th style={{ padding: '8px 10px', width: '95px', textAlign: 'right' }}>Unit Cost</th>
                            <th style={{ padding: '8px 6px', width: '85px', textAlign: 'center' }}>Sent Qty</th>
                            <th style={{ padding: '8px 6px', width: '85px', textAlign: 'center', color: 'var(--primary)' }}>Good Qty</th>
                            <th style={{ padding: '8px 6px', width: '90px', textAlign: 'center', color: 'var(--danger)' }}>Damaged Qty</th>
                            <th style={{ padding: '8px 10px', minWidth: '140px' }}>Defect Reason</th>
                            <th style={{ padding: '8px 10px', width: '100px', textAlign: 'right' }}>Total to Pay</th>
                            <th style={{ padding: '8px 6px', width: '35px', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((row, index) => {
                            const deliv = Math.max(0, parseInt(row.deliveredQuantity, 10) || 0);
                            const acc = Math.max(0, parseInt(row.quantity, 10) || 0);
                            const rej = Math.max(0, parseInt(row.rejectedQuantity, 10) || 0);
                            const cost = Math.max(0, parseFloat(row.costPrice) || 0);
                            const netSubtotal = acc * cost;
                            const rejSubtotal = rej * cost;

                            return (
                              <tr key={index} style={{ borderBottom: '1px solid var(--border)', background: rej > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                                {/* Product / Lot Selection */}
                                <td style={{ padding: '8px 10px' }}>
                                  <select
                                    className="input-premium"
                                    value={row.optionValue || ''}
                                    onChange={(e) => updateRow(index, 'optionValue', e.target.value)}
                                    required
                                    disabled={submitting}
                                    style={{ width: '100%', fontSize: '0.8rem' }}
                                  >
                                    <option value="">-- Select Motorcycle Part --</option>
                                    {receiveOptions.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>

                                  {row.targetType === 'new_serial' && (
                                    <div style={{ marginTop: '4px' }}>
                                      <input
                                        type="text"
                                        className="input-premium"
                                        placeholder="Enter New Serial No. (e.g. RS8-9921) *"
                                        value={row.newSerialNumber || ''}
                                        onChange={(e) => updateRow(index, 'newSerialNumber', e.target.value)}
                                        required
                                        disabled={submitting}
                                        style={{ fontSize: '0.78rem', padding: '4px 8px', width: '100%', borderColor: 'var(--primary)' }}
                                      />
                                    </div>
                                  )}
                                </td>

                                {/* Unit Cost */}
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Cost"
                                    className="input-premium"
                                    style={{ textAlign: 'right', width: '95px', fontSize: '0.82rem' }}
                                    value={row.costPrice}
                                    onKeyDown={(e) => {
                                      if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault();
                                    }}
                                    onChange={(e) => updateRow(index, 'costPrice', e.target.value)}
                                    required
                                    disabled={submitting}
                                  />
                                </td>

                                {/* Delivered Quantity (Box Total) */}
                                <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                  <input
                                    id={`delivered-qty-${index}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Sent"
                                    className="input-premium"
                                    style={{ textAlign: 'center', width: '100%', maxWidth: '80px', padding: '6px 4px', fontSize: '0.85rem', fontWeight: 600 }}
                                    value={row.deliveredQuantity}
                                    onKeyDown={(e) => {
                                      if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault();
                                    }}
                                    onChange={(e) => updateRow(index, 'deliveredQuantity', e.target.value)}
                                    required
                                    disabled={submitting}
                                  />
                                </td>

                                {/* Accepted Good Quantity (Enters Inventory) */}
                                <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="Good"
                                      className="input-premium"
                                      style={{
                                        textAlign: 'center',
                                        width: '100%',
                                        maxWidth: '80px',
                                        padding: '6px 4px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        color: 'var(--primary)',
                                        borderColor: 'rgba(16, 185, 129, 0.4)'
                                      }}
                                      value={row.quantity}
                                      onKeyDown={(e) => {
                                        if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault();
                                      }}
                                      onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                                      required
                                      disabled={submitting}
                                    />
                                    {acc > 0 && (
                                      <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 600 }}>
                                        +{acc} stock in
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Rejected Quantity (Returned to Driver) */}
                                <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      className="input-premium"
                                      style={{
                                        textAlign: 'center',
                                        width: '100%',
                                        maxWidth: '80px',
                                        padding: '6px 4px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        color: rej > 0 ? 'var(--danger)' : 'var(--text-muted)',
                                        borderColor: rej > 0 ? 'var(--danger)' : 'var(--border)',
                                        background: rej > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--input-bg)'
                                      }}
                                      value={row.rejectedQuantity}
                                      onKeyDown={(e) => {
                                        if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault();
                                      }}
                                      onChange={(e) => updateRow(index, 'rejectedQuantity', e.target.value)}
                                      disabled={submitting}
                                    />
                                    {rej > 0 && (
                                      <span style={{ fontSize: '0.68rem', color: 'var(--danger)', fontWeight: 700 }}>
                                        -{rej} to driver
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Defect / Rejection Reason */}
                                <td style={{ padding: '8px 10px' }}>
                                  {rej > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <select
                                        className="input-premium"
                                        value={row.rejectionReason || COMMON_REJECTION_REASONS[0]}
                                        onChange={(e) => updateRow(index, 'rejectionReason', e.target.value)}
                                        style={{ width: '100%', fontSize: '0.74rem', borderColor: 'var(--danger)' }}
                                        required
                                      >
                                        {COMMON_REJECTION_REASONS.map(r => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                      </select>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>
                                        Handed back before driver departs
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Passed 100% (No defects)
                                    </span>
                                  )}
                                </td>

                                {/* Net Payable Subtotal */}
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.88rem' }}>
                                    {formatCurrency(netSubtotal)}
                                  </div>
                                  {rej > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--danger)', textDecoration: 'line-through' }}>
                                      -{formatCurrency(rejSubtotal)}
                                    </div>
                                  )}
                                </td>

                                {/* Remove Action */}
                                <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => removeRow(index)}
                                    disabled={submitting || lineItems.length === 1}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: lineItems.length === 1 ? 'var(--text-muted)' : 'var(--danger)',
                                      cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                                      padding: '4px'
                                    }}
                                    title="Remove line item"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Reconciliation Financial Summary Cards */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      marginTop: '18px',
                      padding: '16px',
                      background: 'var(--surface-hover)',
                      borderRadius: '10px',
                      border: '1px solid var(--border)'
                    }}>
                      {/* Total Shipped Value */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                          Total Shipped Value (Box Total)
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                          {formatCurrency(totalsSummary.shippedTotal)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {totalsSummary.totalDeliveredUnits} total units in shipment
                        </div>
                      </div>

                      {/* Driver Rejection (Deduction) */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldAlert size={13} /> Driver Return Deduction (Damaged)
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)', marginTop: '2px' }}>
                          -{formatCurrency(totalsSummary.rejectedTotal)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px' }}>
                          {totalsSummary.totalRejectedUnits} damaged units returned to driver on the spot
                        </div>
                      </div>

                      {/* Net Payable */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={13} /> Net Payable (Accepted Stock-In)
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)', marginTop: '2px' }}>
                          {formatCurrency(totalsSummary.acceptedTotal)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginTop: '2px' }}>
                          {totalsSummary.totalAcceptedUnits} good units entering store stock
                        </div>
                      </div>
                    </div>

                    {/* Submit Bar with Mechanic Verification Checkbox */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', flexWrap: 'wrap', gap: '14px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: (totalsSummary.totalAcceptedUnits > 0 && !submitting) ? 'pointer' : 'not-allowed',
                        fontSize: '0.84rem',
                        color: (totalsSummary.totalAcceptedUnits > 0) ? 'var(--text-main)' : 'var(--text-muted)'
                      }}>
                        <input
                          type="checkbox"
                          id="mechanic-verify-checkbox"
                          checked={totalsSummary.totalAcceptedUnits > 0 && mechanicVerified}
                          disabled={totalsSummary.totalAcceptedUnits <= 0 || submitting}
                          onChange={(e) => setMechanicVerified(e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: 'var(--primary)',
                            cursor: (totalsSummary.totalAcceptedUnits > 0) ? 'pointer' : 'not-allowed'
                          }}
                        />
                        <span>All delivered units physically inspected and verified in good sellable condition.</span>
                      </label>

                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={submitting}
                        style={{
                          padding: '10px 24px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          opacity: submitting ? 0.7 : 1
                        }}
                      >
                        <CheckCircle size={16} />
                        <span>{submitting ? 'Confirming Delivery...' : 'Confirm & Accept Delivery'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Section 2: Restock Orders History & Inflow Audit Ledger */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} style={{ color: 'var(--primary)' }} />
                  <span>Past Deliveries & Restock Orders History</span>
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Past records of deliveries received, physical inspections, and returned damaged parts.
                </p>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={fetchReceivingHistory}
                disabled={loadingHistory}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
              >
                <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
                <span>Refresh Orders</span>
              </button>
            </div>
          {/* History KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'rgba(5, 150, 105, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Deliveries
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {historySummary.total_batches || receivingHistory.length}
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Good Units Accepted
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {historySummary.total_units_received || receivingHistory.reduce((sum, r) => sum + Number(r.total_quantity || 0), 0)}
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)', textTransform: 'uppercase' }}>
                  Damaged Returned to Driver
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--danger)' }}>
                  {historySummary.total_units_rejected || receivingHistory.reduce((sum, r) => sum + Number(r.total_rejected_qty || 0), 0)} units
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'rgba(234, 179, 8, 0.15)', width: '42px', height: '42px', borderRadius: '10px', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Net Accepted Value
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {formatCurrency(historySummary.total_received_value || receivingHistory.reduce((sum, r) => sum + Number(r.total_cost || 0), 0))}
                </div>
              </div>
            </div>
          </div>

          {/* History Search & Filter Panel */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search DR, item, driver, rider..."
                  className="input-premium"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', fontSize: '0.84rem' }}
                />
              </div>

              <div>
                <select
                  className="input-premium"
                  value={historySupplier}
                  onChange={(e) => setHistorySupplier(e.target.value)}
                  style={{ width: '100%', fontSize: '0.84rem' }}
                >
                  <option value="ALL">All Suppliers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="date"
                  className="input-premium"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  title="Start Date"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>-</span>
                <input
                  type="date"
                  className="input-premium"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                  title="End Date"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setHistorySearch('');
                    setHistorySupplier('ALL');
                    setHistoryStartDate('');
                    setHistoryEndDate('');
                    fetchReceivingHistory();
                  }}
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={fetchReceivingHistory}
                  disabled={loadingHistory}
                  style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
                  Filter
                </button>
              </div>
            </div>
          </div>

          {/* History Records Table */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', width: '100%' }}>
            <div className="table-container" style={{ border: 'none', overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 10px', whiteSpace: 'nowrap', minWidth: '130px' }}>REFERENCE & DATE</th>
                    <th style={{ padding: '8px 10px', whiteSpace: 'nowrap', minWidth: '150px' }}>SUPPLIER</th>
                    <th style={{ padding: '8px 10px', minWidth: '220px' }}>ITEMS RESTOCKED</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: '110px' }}>TOTAL COST</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', minWidth: '95px' }}>STATUS</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', minWidth: '90px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading restock orders history...
                      </td>
                    </tr>
                  ) : receivingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No receiving records found.
                      </td>
                    </tr>
                  ) : (
                    receivingHistory.map((rec) => {
                      const accCount = Number(rec.total_accepted_qty || rec.total_quantity || 0);

                      return (
                        <tr key={rec.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          {/* 1. REFERENCE NO. & DATE */}
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.86rem' }}>
                              {formatReceivingRef(rec.reference_no || rec.reference_number, rec.received_at || rec.created_at, rec.id)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {formatAuditDate(rec.received_at || rec.created_at)}
                            </div>
                          </td>

                          {/* 2. SUPPLIER */}
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {rec.fb_page_name ? (
                                <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#1877F2', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900 }}>f</span>
                              ) : null}
                              <span>{String(rec.supplier_name || 'Generic Supplier').replace(/\s*\((?:FB\s*Supplier|FB)\)/gi, '').trim()}</span>
                            </div>
                          </td>

                          {/* 3. ITEMS RESTOCKED */}
                          <td style={{ padding: '8px 10px' }}>
                            {rec.items && rec.items.length > 0 ? (
                              <div style={{ fontSize: '0.80rem', color: 'var(--text-main)', maxWidth: '280px', lineHeight: 1.4 }}>
                                {rec.items.map((it, idx) => (
                                  <span key={idx}>
                                    <strong>{it.product_name}</strong>{' '}
                                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>x{it.accepted_quantity ?? it.quantity}</span>
                                    {idx < rec.items.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                                {rec.items.length > 1 && (
                                  <span style={{
                                    display: 'inline-block',
                                    marginLeft: '6px',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.70rem',
                                    fontWeight: 700,
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: 'var(--primary)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)'
                                  }}>
                                    +{accCount} pcs
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.80rem', color: 'var(--text-main)', maxWidth: '280px' }}>
                                {rec.items_summary || `${accCount} units stocked`}
                              </div>
                            )}
                          </td>

                          {/* 4. TOTAL COST (PUHUNAN) */}
                          <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.88rem' }}>
                              {formatCurrency(rec.total_cost || 0)}
                            </div>
                          </td>

                          {/* 5. STATUS */}
                          <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              whiteSpace: 'nowrap'
                            }}>
                              <CheckCircle size={12} /> Stocked In
                            </span>
                          </td>

                          {/* 6. ACTIONS */}
                          <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                              onClick={() => {
                                setSelectedBatch(rec);
                                setActiveModalSlipView('receiving');
                              }}
                              title="View batch and print receiving slip"
                            >
                              <Eye size={12} /> View Slip
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* =========================================================================
          MODAL 1: DRIVER ON-THE-SPOT REJECTION & RETURN SLIP (TRIGGERED ON REJECTIONS)
         ========================================================================= */}
      {driverRejectionModalData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div
            id="print-driver-rejection-modal"
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '780px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              borderRadius: '12px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--danger)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <ShieldAlert size={26} style={{ color: 'var(--danger)' }} />
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--danger)', fontWeight: 800 }}>
                    IMMEDIATE DRIVER REJECTION & RETURN SLIP
                  </h2>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  JLIN Moto Parts • Pre-Acceptance Physical Inspection Damage Dispatch Note
                </div>
              </div>

              <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleCopyMessengerSummary(driverRejectionModalData)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem', color: '#1877F2' }}
                  title="Copy formatted message to paste in FB Messenger"
                >
                  <Copy size={15} /> Copy for Messenger
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  <Printer size={15} /> Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => setDriverRejectionModalData(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Warning Alert Note */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '0.82rem',
              color: 'var(--text-main)',
              marginBottom: '16px'
            }}>
              <strong>HANDED BACK TO DRIVER BEFORE DEPARTURE:</strong> The damaged/defective items below were inspected upon physical unboxing in front of the courier driver and <strong>REJECTED</strong>. These items were handed directly back to the delivery rider before leaving JLIN Moto Parts. <strong>Zero units were accepted into inventory</strong> and <strong>₱{driverRejectionModalData.totalRejectedAmount?.toLocaleString()}</strong> was deducted from the invoice payment.
            </div>

            {/* Meta Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.84rem', marginBottom: '18px', background: 'var(--surface-hover)', padding: '14px', borderRadius: '8px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Facebook Supplier</span>
                <strong style={{ fontSize: '0.92rem' }}>{driverRejectionModalData.supplierName}</strong>
                {driverRejectionModalData.sellerContact && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contact: {driverRejectionModalData.sellerContact}</div>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Order / Waybill Reference</span>
                <strong style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.95rem' }}>
                  {driverRejectionModalData.referenceNo}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Delivery Driver & Courier</span>
                <strong>{driverRejectionModalData.driverName}</strong> ({driverRejectionModalData.courierService})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Received & Inspected By</span>
                <strong style={{ color: '#d97706' }}>{driverRejectionModalData.receiverName || 'Staff'}</strong>
              </div>
            </div>

            {/* Rejected Items Table */}
            <h4 style={{ fontSize: '0.88rem', marginBottom: '10px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldAlert size={15} /> Damaged Parts Handed Back to Driver
            </h4>
            <div className="table-container" style={{ border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', marginBottom: '18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <th style={{ padding: '8px 12px' }}>Product / Part Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Rejected Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Deducted Amount</th>
                    <th style={{ padding: '8px 12px' }}>Damage Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRejectionModalData.rejectedItems?.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                        {it.product_name} {it.brand ? `(${it.brand})` : ''}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', color: 'var(--danger)' }}>
                        -{it.rejected_quantity} pcs
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {formatCurrency(it.cost_price || 0)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                        -{formatCurrency(it.subtotal || (it.rejected_quantity * it.cost_price))}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--danger)' }}>
                        {it.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-hover)', fontWeight: 'bold' }}>
                    <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right' }}>Total Deducted from Invoice:</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--danger)', fontSize: '1rem' }}>
                      -{formatCurrency(driverRejectionModalData.totalRejectedAmount || 0)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signature Acknowledgment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--border)', height: '32px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Receiver & Inspector ({driverRejectionModalData.receiverName || 'Staff'})</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--border)', height: '32px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Driver Acknowledgment (Items Received Back)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: VIEW BATCH DETAILS & OFFICIAL RECEIVING SLIP
         ========================================================================= */}
      {selectedBatch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div
            id="print-receiving-slip-modal"
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '780px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              borderRadius: '12px'
            }}
          >
            {/* Slip Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Building2 size={24} style={{ color: 'var(--primary)' }} />
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                    {activeModalSlipView === 'rejection' ? 'DRIVER ON-THE-SPOT REJECTION SLIP' : 'OFFICIAL RECEIVING SLIP'}
                  </h2>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  JLIN Moto Parts • Facebook Supplier Delivery & Physical Quality Inspection Voucher
                </div>
              </div>

              <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {Number(selectedBatch.total_rejected_qty || 0) > 0 && (
                  <div style={{ display: 'flex', background: 'var(--surface-hover)', borderRadius: '6px', padding: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveModalSlipView('receiving')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: activeModalSlipView === 'receiving' ? 'var(--primary)' : 'transparent',
                        color: activeModalSlipView === 'receiving' ? '#fff' : 'var(--text-muted)',
                        fontWeight: 600
                      }}
                    >
                      Receiving Slip
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveModalSlipView('rejection')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: activeModalSlipView === 'rejection' ? 'var(--danger)' : 'transparent',
                        color: activeModalSlipView === 'rejection' ? '#fff' : 'var(--text-muted)',
                        fontWeight: 600
                      }}
                    >
                      Driver Return
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  <Printer size={15} /> Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBatch(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Slip Meta Information Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.85rem', marginBottom: '20px', background: 'var(--surface-hover)', padding: '14px', borderRadius: '8px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Facebook Supplier</span>
                <strong style={{ fontSize: '0.95rem' }}>{selectedBatch.supplier_name || 'Generic Vendor'}</strong>
                {selectedBatch.fb_page_name && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Page: {selectedBatch.fb_page_name}</div>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>FB Order / Waybill Ref No.</span>
                <strong style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.95rem' }}>
                  {selectedBatch.reference_no || selectedBatch.reference_number || `BATCH-${selectedBatch.id}`}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Delivery Date & Time</span>
                <span>{formatAuditDate(selectedBatch.received_at)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Inspection Team</span>
                <span>{selectedBatch.inspected_by || (selectedBatch.mechanic_name ? `Staff: ${selectedBatch.mechanic_name}` : 'Staff Verified')}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>
              {activeModalSlipView === 'rejection' ? 'Items Rejected and Handed Back to Driver' : 'Delivered Items Breakdown'}
            </h4>
            <div className="table-container" style={{ border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px' }}>Product / Part Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Delivered</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--primary)' }}>Accepted</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--danger)' }}>Rejected to Driver</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Net Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBatch.items && selectedBatch.items.length > 0 ? (
                    selectedBatch.items.map((it, idx) => {
                      const isRej = Number(it.rejected_quantity || 0) > 0;
                      if (activeModalSlipView === 'rejection' && !isRej) return null;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{it.product_name || it.item_name || `Item #${it.product_id}`}</div>
                            {it.serials && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--primary)', fontFamily: 'monospace' }}>
                                Lot / Serial: {it.serials}
                              </div>
                            )}
                            {isRej && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px' }}>
                                ⚠️ Rejected: {it.rejection_reason || 'Defective on arrival'}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {it.delivered_quantity || it.quantity}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)' }}>
                            +{it.quantity}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', color: isRej ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {it.rejected_quantity ? `-${it.rejected_quantity}` : '0'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {formatCurrency(it.cost_price || 0)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {formatCurrency(it.subtotal || (it.quantity * (it.cost_price || 0)))}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Batch total: {selectedBatch.total_quantity || 0} units received.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-hover)', fontWeight: 'bold' }}>
                    <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'right' }}>Total Net Approved Payable:</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)', fontSize: '1rem' }}>
                      {formatCurrency(selectedBatch.total_cost || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signatures & Warehouse Verification */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--border)', height: '32px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Delivery Driver ({selectedBatch.delivery_personnel || 'Courier'})</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--border)', height: '32px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Receiving Staff / Inspector</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid var(--border)', height: '32px', marginBottom: '4px' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shop Receiver / Owner</span>
              </div>
            </div>
          </div>
        </div>
      )}





      {/* =========================================================================
          MODAL 4: EDIT SUPPLIER MODAL
         ========================================================================= */}
      <EditSupplierModal
        isOpen={Boolean(selectedSupplierForEdit)}
        onClose={() => setSelectedSupplierForEdit(null)}
        supplier={selectedSupplierForEdit}
        onSupplierUpdated={handleSupplierUpdated}
      />
    </div>
  );
};

export default Purchasing;
