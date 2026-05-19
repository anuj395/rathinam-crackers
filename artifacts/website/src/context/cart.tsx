import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { resolveBulkTier } from '@/lib/bulk-tiers';

export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  retailOnline?: number;
  wholesaleBulk?: number;
  bulkTier?: string;
  savePerUnit?: number;
}

function repriceItem(item: CartItem, qty: number): CartItem {
  const r = Number(item.retailOnline ?? item.unitPrice) || 0;
  const w = Number(item.wholesaleBulk ?? 0) || 0;
  if (r <= 0) return { ...item, qty };
  const tier = resolveBulkTier(r, w, qty);
  return {
    ...item,
    qty,
    unitPrice: tier.unitPrice || item.unitPrice,
    bulkTier: tier.label,
    savePerUnit: tier.savePerUnit,
  };
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string) => void;
  updateQty: (productId: string, variantId: string, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('website_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('website_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === newItem.productId && i.variantId === newItem.variantId);
      if (existing) {
        return prev.map(i => {
          if (i.productId !== newItem.productId || i.variantId !== newItem.variantId) return i;
          const merged: CartItem = {
            ...i,
            retailOnline: newItem.retailOnline ?? i.retailOnline,
            wholesaleBulk: newItem.wholesaleBulk ?? i.wholesaleBulk,
          };
          return repriceItem(merged, i.qty + newItem.qty);
        });
      }
      return [...prev, repriceItem(newItem, newItem.qty)];
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
      (i.productId === productId && i.variantId === variantId) ? repriceItem(i, qty) : i
    ));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
