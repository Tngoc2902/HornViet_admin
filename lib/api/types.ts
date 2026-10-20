// DTO theo swagger của backend (HonSungViet.Web.Host) — xem "Tài liệu API — Website Hồn Sừng Việt".

/** ReadyForPickup: chỉ đơn nhận tại cửa hàng — hàng đã chuẩn bị xong, chờ khách đến nhận. */
export const OrderStatus = { Pending: 0, Shipping: 1, Completed: 2, Canceled: 3, ReadyForPickup: 4 } as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = { Cod: 0, BankTransfer: 1 } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Giao tận nơi (Giao Hàng Nhanh) hoặc nhận tại cửa hàng (không phí ship, không vận đơn). */
export const DeliveryMethod = { Shipping: 0, StorePickup: 1 } as const;
export type DeliveryMethod = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

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

export type Material = { id: number; name: string; origin: string | null; description: string | null; image?: string | null };
export type MaterialInput = { id?: number; name: string; origin?: string | null; description?: string | null; image?: string | null };

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
  /** Backend cũ chưa trả trường này (coi như giao tận nơi). */
  deliveryMethod?: DeliveryMethod;
  totalAmount: number;
  itemCount: number;
  receiverName: string;
  canCancel: boolean;
  /** Sản phẩm trong đơn. Backend cũ chưa trả trường này. */
  items?: OrderLineSummary[];
};

export type OrderLineSummary = { productName: string; variantName: string; quantity: number };

export type OrderItem = {
  id: number;
  productVariantId: number;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Order = Omit<OrderListItem, "items"> & {
  userId: number;
  userName: string | null;
  phoneNumber: string;
  shippingAddress: string;
  note: string | null;
  lastStatusChangeTime: string | null;
  items: OrderItem[];
  /** Phí giao hàng; totalAmount là tiền hàng, payableAmount = totalAmount + shippingFee. Backend cũ chưa trả. */
  shippingFee?: number;
  payableAmount?: number;
  ghnOrderCode?: string | null;
  ghnStatus?: string | null;
  ghnExpectedDeliveryTime?: string | null;
  ghnStatusTime?: string | null;
};

/** Tiến trình giao hàng của một đơn (GET Shipment/Get). */
export type Shipment = {
  orderId: number;
  orderCode: string;
  trackingCode: string | null;
  status: string | null;
  expectedDeliveryTime: string | null;
  statusTime: string | null;
  shippingFee: number;
};

export type OrderQuery = PageInput & { status?: OrderStatus; deliveryMethod?: DeliveryMethod; keyword?: string; fromDate?: string; toDate?: string };

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
  /** Đơn nhận tại cửa hàng đã chuẩn bị xong, chờ khách đến lấy. Backend cũ chưa trả. */
  readyForPickupOrderCount?: number;
  todayOrderCount: number;
  customerCount: number;
  /** null khi Nhân viên gọi. */
  todayRevenue: number | null;
  monthRevenue: number | null;
  /** Lợi nhuận gộp tháng này — null khi Nhân viên gọi. */
  monthProfit: number | null;
  lowStockVariants: LowStockVariant[];
};

/** cost / profit chỉ tính trên sản phẩm có giá vốn; uncostedQuantity = số sp đã bán chưa có giá vốn (đơn cũ). */
export type RevenuePoint = { period: string; revenue: number; orderCount: number; cost: number; profit: number; uncostedQuantity: number };
export type RevenueReport = {
  fromDate: string;
  toDate: string;
  totalRevenue: number;
  orderCount: number;
  totalCost: number;
  totalProfit: number;
  /** % — null nếu chưa có sản phẩm nào có giá vốn. */
  profitMargin: number | null;
  uncostedQuantity: number;
  items: RevenuePoint[];
};
export type TopProduct = { productId: number; productName: string; quantitySold: number; revenue: number; profit: number; uncostedQuantity: number };

// ---------- Nhập kho & giá vốn (chỉ Quản trị viên)
export type StockReceipt = {
  id: number;
  creationTime: string;
  productId: number;
  productName: string;
  productVariantId: number;
  variantName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  note: string | null;
  creatorUserName: string | null;
  lastModificationTime: string | null;
  /** Phiếu mới nhất của biến thể → được sửa / hủy. */
  canEdit: boolean;
};

export type VariantCost = {
  productVariantId: number;
  productId: number;
  productName: string;
  variantName: string;
  salePrice: number;
  stockQuantity: number;
  /** null = chưa có phiếu nhập. */
  averageCost: number | null;
  stockValue: number | null;
  unitProfit: number | null;
  lastReceiptTime: string | null;
};

export type StockReceiptInput = { productVariantId: number; quantity: number; unitCost: number; note?: string };
export type StockReceiptUpdateInput = { id: number; quantity: number; unitCost: number; note?: string };

// ---------- Bộ sưu tập
export type CollectionProduct = { id: number; name: string; mainImage: string; price: number; isActive: boolean };
export type Collection = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  isActive: boolean;
  displayOrder: number;
  /** Số sản phẩm trong bộ (trang quản trị: kể cả sản phẩm đang ẩn). */
  productCount: number;
  /** Ảnh vài sản phẩm đầu — ảnh bìa dự phòng. */
  previewImages: string[];
  /** Chỉ có khi xem chi tiết (Collection/Get). */
  productIds?: number[] | null;
  products?: CollectionProduct[] | null;
  creationTime: string;
};
export type CollectionInput = {
  id?: number;
  name: string;
  /** Để trống thì máy chủ tạo từ tên. */
  slug?: string | null;
  description?: string | null;
  coverImage?: string | null;
  isActive: boolean;
  displayOrder: number;
  /** Theo thứ tự hiển thị trong bộ. */
  productIds: number[];
};
