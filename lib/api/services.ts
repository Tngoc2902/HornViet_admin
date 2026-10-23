import { http } from "./http";
import type {
  Address,
  AddressInput,
  AuthenticateResult,
  Cart,
  Category,
  CategoryInput,
  ChatConversationListItem,
  ChatConversationQuery,
  ChatIntent,
  ChatIntentInput,
  ChatMessage,
  ChatModel,
  ChatSupportConversation,
  ChatSupportSummary,
  ChatTestResult,
  ChatUnrecognized,
  Collection,
  CollectionInput,
  CreateOrderInput,
  CreateUserInput,
  Dashboard,
  ListResult,
  Material,
  MaterialInput,
  Order,
  OrderListItem,
  OrderQuery,
  OrderStatus,
  PagedResult,
  PageInput,
  Shipment,
  ProductAdminListItem,
  ProductAdminQuery,
  ProductDetail,
  ProductInput,
  ProductListItem,
  ProductListQuery,
  Profile,
  RegisterInput,
  RevenueGroupBy,
  RevenueReport,
  Role,
  RoleName,
  StockReceipt,
  StockReceiptInput,
  StockReceiptUpdateInput,
  TopProduct,
  User,
  UserQuery,
  VariantCost,
} from "./types";

const app = (path: string) => `/api/services/app/${path}`;

export const authApi = {
  /** Đăng nhập trang quản trị: server chỉ cấp token cho Nhân viên / Quản trị viên, Khách hàng nhận 400. */
  authenticate: (userNameOrEmailAddress: string, password: string) =>
    http.post<AuthenticateResult>("/api/TokenAuth/AuthenticateAdmin", { userNameOrEmailAddress, password }),
  register: (input: RegisterInput) => http.post<{ userId: number; userName: string }>(app("Account/Register"), input),
};

export const profileApi = {
  get: () => http.get<Profile>(app("Profile/GetMyProfile")),
  update: (input: { name: string; phoneNumber: string }) => http.put<Profile>(app("Profile/UpdateMyProfile"), input),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post<null>(app("Profile/ChangePassword"), { currentPassword, newPassword }),
  /** Địa chỉ mặc định đứng đầu. */
  getAddresses: () => http.get<ListResult<Address>>(app("Profile/GetMyAddresses")),
  saveAddress: (input: AddressInput) => http.post<Address>(app("Profile/SaveAddress"), input),
  deleteAddress: (id: number) => http.delete<null>(app("Profile/DeleteAddress"), { id }),
};

export const categoryApi = {
  getAll: () => http.get<ListResult<Category>>(app("Category/GetAll")),
  create: (input: CategoryInput) => http.post<Category>(app("Category/Create"), input),
  update: (input: CategoryInput) => http.put<Category>(app("Category/Update"), input),
  delete: (id: number) => http.delete<null>(app("Category/Delete"), { id }),
};

export const materialApi = {
  getAll: () => http.get<ListResult<Material>>(app("Material/GetAll")),
  create: (input: MaterialInput) => http.post<Material>(app("Material/Create"), input),
  update: (input: MaterialInput) => http.put<Material>(app("Material/Update"), input),
  delete: (id: number) => http.delete<null>(app("Material/Delete"), { id }),
};

/** Hỗ trợ khách hàng: nhân viên xem hội thoại, tiếp nhận và trả lời trực tiếp. */
export const chatSupportApi = {
  getConversations: (q: ChatConversationQuery = {}) =>
    http.get<PagedResult<ChatConversationListItem>>(app("ChatSupport/GetConversations"), q),
  /** Người phụ trách (hoặc hội thoại đang chờ) mở xem → đánh dấu đã đọc. */
  getConversation: (id: number) => http.get<ChatSupportConversation>(app("ChatSupport/GetConversation"), { id }),
  claim: (conversationId: number, takeOver = false) => http.post<ChatSupportConversation>(app("ChatSupport/Claim"), { conversationId, takeOver }),
  reply: (conversationId: number, text: string) => http.post<ChatMessage>(app("ChatSupport/Reply"), { conversationId, text }),
  close: (id: number) => http.post<ChatSupportConversation>(app("ChatSupport/Close"), { id }),
  getSummary: () => http.get<ChatSupportSummary>(app("ChatSupport/GetSummary")),
};

/** Huấn luyện chatbot: ý định, câu mẫu, model, câu bot chưa hiểu. */
export const chatTrainingApi = {
  getIntents: () => http.get<ListResult<ChatIntent>>(app("ChatTraining/GetIntents")),
  getIntent: (id: number) => http.get<ChatIntent>(app("ChatTraining/GetIntent"), { id }),
  createIntent: (input: ChatIntentInput) => http.post<ChatIntent>(app("ChatTraining/CreateIntent"), input),
  updateIntent: (input: ChatIntentInput) => http.put<ChatIntent>(app("ChatTraining/UpdateIntent"), input),
  deleteIntent: (id: number) => http.delete<null>(app("ChatTraining/DeleteIntent"), { id }),
  train: () => http.post<ChatModel>(app("ChatTraining/Train")),
  /** null = chưa huấn luyện lần nào. */
  getModel: () => http.get<ChatModel | null>(app("ChatTraining/GetModel")),
  test: (text: string) => http.post<ChatTestResult>(app("ChatTraining/Test"), { text }),
  getUnrecognized: (q: PageInput = {}) => http.get<PagedResult<ChatUnrecognized>>(app("ChatTraining/GetUnrecognized"), q),
  label: (messageId: number, intentId: number) => http.post<null>(app("ChatTraining/Label"), { messageId, intentId }),
  dismiss: (id: number) => http.post<null>(app("ChatTraining/Dismiss"), { id }),
};

export const collectionApi = {
  /** Quản lý: mọi bộ sưu tập (kể cả đang ẩn), sắp theo thứ tự hiển thị. */
  getAll: () => http.get<ListResult<Collection>>(app("Collection/GetAll")),
  /** Kèm danh sách sản phẩm trong bộ theo thứ tự. */
  get: (id: number) => http.get<Collection>(app("Collection/Get"), { id }),
  create: (input: CollectionInput) => http.post<Collection>(app("Collection/Create"), input),
  update: (input: CollectionInput) => http.put<Collection>(app("Collection/Update"), input),
  delete: (id: number) => http.delete<null>(app("Collection/Delete"), { id }),
};

export const productApi = {
  getAll: (q: ProductListQuery = {}) => http.get<PagedResult<ProductListItem>>(app("Product/GetAll"), q),
  /** Khách: chỉ sản phẩm đang bán (404 nếu ẩn/xóa). Quản lý: cả sản phẩm đang ẩn. */
  get: (id: number) => http.get<ProductDetail>(app("Product/Get"), { id }),
  getAdminList: (q: ProductAdminQuery = {}) => http.get<PagedResult<ProductAdminListItem>>(app("Product/GetAdminList"), q),
  create: (input: ProductInput) => http.post<ProductDetail>(app("Product/Create"), input),
  update: (input: ProductInput) => http.put<ProductDetail>(app("Product/Update"), input),
  setActive: (id: number, isActive: boolean) => http.put<null>(app("Product/SetActive"), { id, isActive }),
  delete: (id: number) => http.delete<null>(app("Product/Delete"), { id }),
};

export const fileApi = {
  /** JPG, PNG, WEBP, tối đa 5 MB → { url: "/uploads/..." }. */
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.upload<{ url: string }>(app("File/UploadImage"), form);
  },
};

export const cartApi = {
  get: () => http.get<Cart>(app("Cart/GetMyCart")),
  addItem: (productVariantId: number, quantity: number) => http.post<Cart>(app("Cart/AddItem"), { productVariantId, quantity }),
  updateItem: (cartItemId: number, quantity: number) => http.put<Cart>(app("Cart/UpdateItem"), { cartItemId, quantity }),
  deleteItem: (cartItemId: number) => http.delete<Cart>(app("Cart/DeleteItem"), { id: cartItemId }),
};

export const orderApi = {
  create: (input: CreateOrderInput) => http.post<Order>(app("Order/Create"), input),
  getMine: (q: PageInput & { status?: OrderStatus } = {}) => http.get<PagedResult<OrderListItem>>(app("Order/GetMyOrders"), q),
  get: (id: number) => http.get<Order>(app("Order/Get"), { id }),
  cancel: (id: number) => http.post<Order>(app("Order/Cancel"), { id }),
  getAll: (q: OrderQuery = {}) => http.get<PagedResult<OrderListItem>>(app("Order/GetAll"), q),
  updateStatus: (id: number, status: OrderStatus) => http.put<Order>(app("Order/UpdateStatus"), { id, status }),
};

export const shipmentApi = {
  create: (id: number) => http.post<Shipment>(app("Shipment/Create"), { id }),
  cancel: (id: number) => http.post<Shipment>(app("Shipment/Cancel"), { id }),
  get: (orderId: number, refresh = false) => http.get<Shipment>(app("Shipment/Get"), { orderId, refresh }),
  getLabelUrl: (orderId: number) => http.get<string>(app("Shipment/GetLabelUrl"), { orderId }),
  /** Chỉ môi trường thử GHN: giả lập vận đơn đổi trạng thái. */
  simulate: (orderId: number, status: string) => http.post<Shipment>(app("Shipment/Simulate"), { orderId, status }),
};

export const shippingApi = {
  getStatus: () => http.get<{ isEnabled: boolean; isSandbox?: boolean }>(app("Shipping/GetStatus")),
};

export const userApi = {
  getAll: (q: UserQuery = {}) => http.get<PagedResult<User>>(app("User/GetAll"), q),
  getRoles: () => http.get<ListResult<Role>>(app("User/GetRoles")),
  create: (input: CreateUserInput) => http.post<User>(app("User/Create"), input),
  setRoles: (userId: number, roleNames: RoleName[]) => http.put<User>(app("User/SetRoles"), { userId, roleNames }),
  setActive: (userId: number, isActive: boolean) => http.put<User>(app("User/SetActive"), { userId, isActive }),
  /** Đặt lại mật khẩu cho tài khoản khác (không dùng cho chính mình). */
  resetPassword: (userId: number, newPassword: string) => http.put<null>(app("User/ResetPassword"), { userId, newPassword }),
};

export const statisticApi = {
  getDashboard: () => http.get<Dashboard>(app("Statistic/GetDashboard")),
  getRevenue: (q: { fromDate?: string; toDate?: string; groupBy?: RevenueGroupBy }) =>
    http.get<RevenueReport>(app("Statistic/GetRevenue"), q),
  getTopProducts: (q: { fromDate?: string; toDate?: string; top?: number }) =>
    http.get<ListResult<TopProduct>>(app("Statistic/GetTopProducts"), q),
};

/** Nhập kho & giá vốn — chỉ Quản trị viên. */
export const stockReceiptApi = {
  getAll: (q: PageInput & { productVariantId?: number; keyword?: string } = {}) =>
    http.get<PagedResult<StockReceipt>>(app("StockReceipt/GetAll"), q),
  getVariantCosts: (q: PageInput & { keyword?: string } = {}) => http.get<PagedResult<VariantCost>>(app("StockReceipt/GetVariantCosts"), q),
  create: (input: StockReceiptInput) => http.post<StockReceipt>(app("StockReceipt/Create"), input),
  /** Chỉ phiếu mới nhất của biến thể; giá vốn các đơn bán sau phiếu được tính lại. */
  update: (input: StockReceiptUpdateInput) => http.put<StockReceipt>(app("StockReceipt/Update"), input),
  delete: (id: number) => http.delete<null>(app("StockReceipt/Delete"), { id }),
};
