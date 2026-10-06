// DTO theo swagger của backend (HonSungViet.Web.Host) — xem "Tài liệu API — Website Hồn Sừng Việt".

export const OrderStatus = { Pending: 0, Shipping: 1, Completed: 2, Canceled: 3 } as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = { Cod: 0, BankTransfer: 1 } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const ProductSorting = { Newest: 0, PriceAsc: 1, PriceDesc: 2, NameAsc: 3, BestSelling: 4 } as const;
export type ProductSorting = (typeof ProductSorting)[keyof typeof ProductSorting];

export const RevenueGroupBy = { Day: 0, Month: 1 } as const;
export type RevenueGroupBy = (typeof RevenueGroupBy)[keyof typeof RevenueGroupBy];

export type RoleName = "Admin" | "Staff" | "Customer";

export type PagedResult<T> = { totalCount: number; items: T[] };
export type ListResult<T> = { items: T[] };
export type PageInput = { skipCount?: number; maxResultCount?: number };

// ---------- Auth / Account / Profile
export type AuthenticateResult = {
  accessToken: string;
  expireInSeconds: number;
  userId: number;
  userName: string;
  name: string;
  roles: RoleName[];
};

export type RegisterInput = { name: string; emailAddress: string; phoneNumber: string; password: string; userName?: string };

export type Profile = {
  id: number;
  userName: string;
  name: string;
  emailAddress: string;
  phoneNumber: string | null;
  roleNames: RoleName[];
};

export type Address = { id: number; receiverName: string; phoneNumber: string; address: string; isDefault: boolean };
export type AddressInput = Omit<Address, "id"> & { id?: number };

// ---------- Catalog
export type Category = { id: number; name: string; description: string | null; productCount: number; creationTime: string };
export type CategoryInput = { id?: number; name: string; description?: string | null };

export type Material = { id: number; name: string; origin: string | null; description: string | null };
export type MaterialInput = { id?: number; name: string; origin?: string | null; description?: string | null };

export type ProductListItem = {
  id: number;
  name: string;
  price: number;
  mainImage: string | null;
  categoryId: number;
  categoryName: string;
  materialId: number;
  materialName: string;
  totalStock: number;
  inStock: boolean;
  creationTime: string;
};

export type ProductListQuery = PageInput & {
  keyword?: string;
  categoryIds?: number[];
  materialIds?: number[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sorting?: ProductSorting;
};

export type ProductVariant = {
  id: number;
  size: string | null;
  style: string | null;
  displayName: string;
  stockQuantity: number;
  inStock: boolean;
  isLowStock: boolean;
};

export type ProductDetail = {
  id: number;
  name: string;
  price: number;
  mainImage: string | null;
  description: string | null;
  isActive: boolean;
  categoryId: number;
  categoryName: string;
  material: Material;
  images: string[];
  variants: ProductVariant[];
  totalStock: number;
  creationTime: string;
};

export type ProductAdminListItem = {
  id: number;
  name: string;
  mainImage: string | null;
  price: number;
  categoryName: string;
  materialName: string;
  variantCount: number;
  totalStock: number;
  isLowStock: boolean;
  isActive: boolean;
  creationTime: string;
};

export type ProductAdminQuery = PageInput & { keyword?: string; categoryId?: number; isActive?: boolean; lowStockOnly?: boolean };

export type ProductInput = {
  id?: number;
  categoryId: number;
  materialId: number;
  name: string;
  price: number;
  mainImage: string;
  description?: string | null;
  isActive: boolean;
  variants: { id?: number; size?: string | null; style?: string | null; stockQuantity: number }[];
  images: string[];
};

// ---------- Cart
export type CartItem = {
  id: number;
  productVariantId: number;
  productId: number;
  productName: string;
  mainImage: string | null;
  variantName: string;
  size: string | null;
  style: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stockQuantity: number;
  isAvailable: boolean;
};

export type Cart = { items: CartItem[]; totalQuantity: number; subTotal: number; canCheckout: boolean };

// ---------- Orders
export type CreateOrderInput = {
  receiverName: string;
  phoneNumber: string;
  shippingAddress: string;
  paymentMethod: PaymentMethod;
  note?: string;
};

export type OrderListItem = {
  id: number;
  code: string;
  creationTime: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  itemCount: number;
  receiverName: string;
  canCancel: boolean;
};

export type OrderItem = {
  id: number;
  productVariantId: number;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Order = OrderListItem & {
  userId: number;
  userName: string | null;
  phoneNumber: string;
  shippingAddress: string;
  note: string | null;
  lastStatusChangeTime: string | null;
  items: OrderItem[];
};

export type OrderQuery = PageInput & { status?: OrderStatus; keyword?: string; fromDate?: string; toDate?: string };

// ---------- Users (Admin)
export type User = {
  id: number;
  userName: string;
  name: string;
  emailAddress: string;
  phoneNumber: string | null;
  isActive: boolean;
  creationTime: string;
  roleNames: RoleName[];
};

export type Role = { id: number; name: RoleName; displayName: string };

export type UserQuery = PageInput & { keyword?: string; roleName?: RoleName; isActive?: boolean };

export type CreateUserInput = {
  name: string;
  emailAddress: string;
  userName?: string;
  phoneNumber?: string;
  password: string;
  roleNames: RoleName[];
};

// ---------- Statistics
export type LowStockVariant = { productId: number; productName: string; variantId: number; variantName: string; stockQuantity: number };

export type Dashboard = {
  pendingOrderCount: number;
  shippingOrderCount: number;
  todayOrderCount: number;
  customerCount: number;
  /** null khi Nhân viên gọi. */
  todayRevenue: number | null;
  monthRevenue: number | null;
  lowStockVariants: LowStockVariant[];
};

export type RevenuePoint = { period: string; revenue: number; orderCount: number };
export type RevenueReport = { fromDate: string; toDate: string; totalRevenue: number; orderCount: number; items: RevenuePoint[] };
export type TopProduct = { productId: number; productName: string; quantitySold: number; revenue: number };
