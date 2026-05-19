import { useState } from "react";
import { Link } from "wouter";
import { useCart } from "@/context/cart";
import { useValidateCoupon } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  ArrowRight,
  Ticket,
  AlertCircle
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

export default function Cart() {
  const { items, updateQty, removeItem, subtotal } = useCart();
  const { toast } = useToast();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);

  const validateCoupon = useValidateCoupon();

  const handleApplyCoupon = async () => {
    if (!couponCode) return;

    try {
      const res = await validateCoupon.mutateAsync({
        data: {
          code: couponCode,
          cartTotal: subtotal,
        },
      });

      const payload = res.data;
      if (payload?.valid) {
        setAppliedCoupon({ ...payload, code: couponCode });
        toast({
          title: "Coupon applied!",
          description: `You saved ₹${(payload.discountAmount ?? 0).toLocaleString("en-IN")}.`,
        });
      } else {
        toast({
          title: "Invalid coupon",
          description: payload?.error || "This coupon cannot be used.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to validate coupon. Please try again.",
        variant: "destructive",
      });
    }
  };

  const discount = appliedCoupon?.discountAmount || 0;
  const gst = Math.round((subtotal - discount) * 0.18);
  const total = subtotal - discount + gst;

  if (items.length === 0) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-32 text-center">
          <div className="bg-gray-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <ShoppingBag className="h-10 w-10 text-gray-300" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <p className="text-gray-500 mb-10 max-w-md mx-auto">
            Looks like you haven't added any fireworks yet. Start shopping to celebrate your next occasion!
          </p>
          <Link href="/catalogue">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground h-14 px-10 rounded-full text-lg font-bold shadow-lg shadow-[hsl(197,65%,12%)]/10">
              Start Shopping
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-gray-50 min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-10">Shopping Cart</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Items List */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div key={`${item.productId}-${item.variantId}`} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary/5 to-amber-50 rounded-2xl flex items-center justify-center text-4xl">
                    🎆
                  </div>
                  <div className="flex-grow text-center sm:text-left">
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{item.productName}</h3>
                    <p className="text-sm text-gray-500 mb-4">{item.variantLabel}</p>
                    <div className="flex items-center justify-center sm:justify-start space-x-4">
                      <div className="flex items-center bg-gray-50 border border-gray-100 rounded-full p-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateQty(item.productId, item.variantId, item.qty - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-10 text-center font-bold">{item.qty}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateQty(item.productId, item.variantId, item.qty + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-gray-400 hover:text-primary"
                        onClick={() => removeItem(item.productId, item.variantId)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">₹{item.unitPrice * item.qty}</p>
                    <p className="text-xs text-gray-400">₹{item.unitPrice} / unit</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Panel */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 sticky top-28">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
                
                {/* Coupon Section */}
                <div className="mb-8">
                  <div className="flex space-x-2">
                    <div className="relative flex-grow">
                      <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input 
                        placeholder="Coupon code" 
                        className="pl-10 h-12 bg-gray-50 border-gray-100 rounded-2xl"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <Button 
                      className="h-12 rounded-2xl bg-gray-900 hover:bg-black px-6"
                      onClick={handleApplyCoupon}
                      disabled={validateCoupon.isPending || !couponCode}
                    >
                      {validateCoupon.isPending ? "..." : "Apply"}
                    </Button>
                  </div>
                  {appliedCoupon && (
                    <p className="text-xs text-green-600 font-bold mt-2 flex items-center">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Coupon "{appliedCoupon.code}" applied
                    </p>
                  )}
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span className="font-medium">-₹{discount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>GST (18%)</span>
                    <span className="font-medium">₹{gst.toLocaleString('en-IN')}</span>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="flex justify-between text-2xl font-extrabold text-gray-900">
                    <span>Total</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <Link href="/checkout">
                  <Button className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-bold text-xl shadow-lg shadow-[hsl(197,65%,12%)]/10">
                    Checkout <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                </Link>

                <div className="mt-6 flex items-start space-x-3 text-xs text-gray-400 bg-gray-50 p-4 rounded-2xl">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p>Shipping costs and delivery date will be confirmed during checkout or via call.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Simple CheckCircle2 icon if not available from lucide-react directly
function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
