import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useGetPricingSettings } from '@workspace/api-client-react';

export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  hsnCode?: string | null;
  // Per-product GST override (percent). NULL/undefined = fall back to HSN slab → default.
  gstRate?: number | null;
}

export interface CouponData {
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrder?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'lineTotal'>) => void;
  removeItem: (productId: string, variantId: string) => void;
  updateQty: (productId: string, variantId: string, qty: number) => void;
  clearCart: () => void;
  loadHeldBill: (payload: { items: Omit<CartItem, 'lineTotal'>[]; customer?: any | null; coupon?: CouponData | null }) => void;
  subtotal: number;
  gst: number;
  discount: number;
  total: number;
  taxRate: number; // effective blended rate for display only
  pricingLoaded: boolean;
  coupon: CouponData | null;
  applyCoupon: (coupon: CouponData | null) => void;
  customer: any | null;
  setCustomer: (customer: any | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

type HsnSlab = { hsn: string; rate: number; active?: boolean };

// Mirror of api-server/src/lib/tax.ts effectiveRate(). Kept in sync so the
// cart UI shows the same total the server will compute at checkout —
// otherwise mixed-rate carts (different HSN slabs / per-product overrides)
// produce TENDER_MISMATCH errors.
function effectiveRate(item: CartItem, cfg: { enabled: boolean; defaultRate: number; hsnRates: HsnSlab[] }): number {
  if (!cfg.enabled) return 0;
  if (typeof item.gstRate === 'number' && Number.isFinite(item.gstRate)) return item.gstRate;
  if (item.hsnCode) {
    const slab = cfg.hsnRates.find(
      (s) => (s.active ?? true) && s.hsn.trim().toLowerCase() === item.hsnCode!.trim().toLowerCase(),
    );
    if (slab) return slab.rate;
  }
  return cfg.defaultRate;
}

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);

  const addItem = (newItem: Omit<CartItem, 'lineTotal'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === newItem.productId && i.variantId === newItem.variantId);
      if (existing) {
        return prev.map(i =>
          (i.productId === newItem.productId && i.variantId === newItem.variantId)
            ? { ...i, qty: i.qty + newItem.qty, lineTotal: (i.qty + newItem.qty) * i.unitPrice }
            : i
        );
      }
      return [...prev, { ...newItem, lineTotal: newItem.qty * newItem.unitPrice }];
    });
  };

  const removeItem = (productId: string, variantId: string) => {
    setItems(prev => prev.filter(i => !(i.productId === productId && i.variantId === variantId)));
  };

  const updateQty = (productId: string, variantId: string, qty: number) => {
    if (qty <= 0) {
      removeItem(productId, variantId);
      return;
    }
    setItems(prev => prev.map(i =>
      (i.productId === productId && i.variantId === variantId)
        ? { ...i, qty, lineTotal: qty * i.unitPrice }
        : i
    ));
  };

  const clearCart = () => {
    setItems([]);
    setCoupon(null);
    setCustomer(null);
  };

  const loadHeldBill: CartContextType['loadHeldBill'] = ({ items: newItems, customer: c, coupon: co }) => {
    setItems(newItems.map(i => ({ ...i, lineTotal: i.qty * i.unitPrice })));
    setCustomer(c ?? null);
    setCoupon(co ?? null);
  };

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  let discount = 0;
  if (coupon) {
    if (coupon.type === 'PERCENT') {
      discount = (subtotal * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }
  }

  // Pricing settings drive the same fallback chain the server uses:
  // gstEnabled → per-product gstRate → HSN slab → defaultGstRate.
  const { data: pricingResp, isSuccess: pricingLoaded } = useGetPricingSettings();
  const pricing = ((pricingResp as any)?.data ?? pricingResp ?? {}) as {
    gstEnabled?: boolean;
    defaultGstRate?: number;
    hsnRates?: HsnSlab[];
    taxRate?: number;
  };
  const cfg = {
    enabled: pricing.gstEnabled === undefined ? true : Boolean(pricing.gstEnabled),
    defaultRate: Number(pricing.defaultGstRate ?? (pricing.taxRate ? Number(pricing.taxRate) * 100 : 18)),
    hsnRates: Array.isArray(pricing.hsnRates) ? pricing.hsnRates : [],
  };

  // Spread the cart-level discount across lines proportionally so each line
  // keeps its own tax rate — exactly mirroring server `computeTax`.
  const factor = subtotal > 0 ? Math.max(0, subtotal - discount) / subtotal : 1;
  let gst = 0;
  let taxableSum = 0;
  for (const item of items) {
    const lineTaxable = item.lineTotal * factor;
    const rate = effectiveRate(item, cfg);
    gst += lineTaxable * (rate / 100);
    taxableSum += lineTaxable;
  }
  const taxRate = taxableSum > 0 ? gst / taxableSum : 0; // blended effective rate for display
  const total = taxableSum + gst;

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQty, clearCart, loadHeldBill,
      subtotal, gst, discount, total, taxRate, pricingLoaded,
      coupon, applyCoupon: setCoupon,
      customer, setCustomer
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
