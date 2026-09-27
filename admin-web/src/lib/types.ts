export type Role = 'owner' | 'admin' | 'cashier';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  opening_hours: Record<string, DayHours>;
  order_number_format: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
  is_active: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface Modifier {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
  is_active: boolean;
}

export interface OutletProduct {
  outlet_id: string;
  product_id: string;
  price_override: number | null;
  is_listed: boolean;
  is_available: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  is_active: boolean;
}

export interface InventoryItem {
  id: string;
  outlet_id: string;
  ingredient_id: string;
  current_stock: number;
  min_stock: number;
}

export interface Discount {
  id: string;
  outlet_id: string | null;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  is_active: boolean;
}

export interface BusinessSettings {
  business_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  receipt_header: string | null;
  receipt_footer: string;
  payment_methods: string[];
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  timezone: string;
  opening_hours: Record<string, DayHours>;
  block_negative_stock: boolean;
}

export interface OrderRow {
  id: string;
  outlet_id: string;
  order_number: string;
  cashier_id: string | null;
  cashier_name: string;
  status: 'completed' | 'void' | 'refunded';
  subtotal: number;
  discount_name: string | null;
  discount_total: number;
  tax_name: string | null;
  tax_rate: number;
  tax_total: number;
  total: number;
  payment_method: string | null;
  note: string | null;
  is_offline: boolean;
  created_at: string;
  void_reason: string | null;
  voided_by_name: string | null;
  voided_at: string | null;
}

export interface ReceiptData {
  order_number: string;
  status: string;
  created_at: string;
  cashier_name: string;
  outlet: { name: string; code: string; address: string | null; phone: string | null };
  subtotal: number;
  discount_name: string | null;
  discount_total: number;
  tax_name: string | null;
  tax_rate: number;
  tax_total: number;
  total: number;
  payment_method: string | null;
  payment: { method: string; amount: number; received: number; change: number } | null;
  note: string | null;
  items: {
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    note: string | null;
    modifiers: { group_name: string; name: string; price_delta: number }[];
  }[];
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  user_name: string | null;
  outlet_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Summary {
  orders_count: number;
  gross: number;
  discount: number;
  tax: number;
  net_sales: number;
  avg_order: number;
  refund_count: number;
  refund_total: number;
  void_count: number;
  void_total: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  orders_count: number;
  quantity: number;
  gross: number;
  discount: number;
  net: number;
}
