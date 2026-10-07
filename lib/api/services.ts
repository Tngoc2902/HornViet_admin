import { http } from "./http";
import type {
  Address,
  AddressInput,
  AuthenticateResult,
  Cart,
  Category,
  CategoryInput,
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
  TopProduct,
  User,
  UserQuery,
} from "./types";

const app = (path: string) => `/api/services/app/${path}`;

export const authApi = {
  /** Đăng nhập trang quản trị: server chỉ cấp token cho Nhân viên / Quản trị viên, Khách hàng nhận 400. */
  authenticate: (userNameOrEmailAddress: string, password: string) =>
    http.post<AuthenticateResult>("/api/TokenAuth/AuthenticateAdmin", { userNameOrEmailAddress, password }),
  register: (input: RegisterInput) => http.post<{ userId: number; userName: string }>(app("Account/Register"), input),
  /** Gửi email chứa link đặt lại mật khẩu; luôn thành công dù email có tồn tại hay không. */
  forgotPassword: (emailAddress: string) => http.post<null>(app("Account/ForgotPassword"), { emailAddress }),
  /** Đặt mật khẩu mới bằng mã trong link email (?token=...). */
  resetPassword: (token: string, newPassword: string) => http.post<null>(app("Account/ResetPassword"), { token, newPassword }),
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
