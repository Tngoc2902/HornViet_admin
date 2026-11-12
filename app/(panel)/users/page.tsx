"use client";

import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Plus, Users } from "lucide-react";
import { Badge, Chip, Drawer, EmptyState, ErrorBox, FieldError, FormAlert, LoadingRows, notify, PageHeader, Pager, SearchInput } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { userApi } from "@/lib/api/services";
import type { RoleName, User } from "@/lib/api/types";
import { formatDate, initialOf, ROLE_LABEL } from "@/lib/hsv/format";
import { isStrongPassword, isValidEmail, isValidPhone, normalizePhone, type FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const COLS = "grid-cols-[minmax(0,1.8fr)_130px_100px_150px_100px_190px]";
const ROLES: RoleName[] = ["Customer", "Staff", "Admin"];

type CreateKey = "name" | "emailAddress" | "userName" | "phoneNumber" | "password";

function CreateUserDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<Record<CreateKey, string>>({ name: "", emailAddress: "", userName: "", phoneNumber: "", password: "" });
  const [role, setRole] = useState<RoleName>("Staff");
  const [errors, setErrors] = useState<FieldErrors<CreateKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: FieldErrors<CreateKey> = {};
    if (!form.name.trim()) e.name = "Vui lòng nhập họ tên";
    if (!isValidEmail(form.emailAddress)) e.emailAddress = "Email không hợp lệ";
    if (form.phoneNumber.trim() && !isValidPhone(form.phoneNumber)) e.phoneNumber = "Số điện thoại không hợp lệ";
    if (!isStrongPassword(form.password)) e.password = "Mật khẩu tối thiểu 6 ký tự, gồm cả chữ và số";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await userApi.create({
        name: form.name.trim(),
        emailAddress: form.emailAddress.trim(),
        userName: form.userName.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() ? normalizePhone(form.phoneNumber) : undefined,
        password: form.password,
        roleNames: [role],
      });
      notify("Đã tạo tài khoản");
      onCreated();
      onClose();
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors() as FieldErrors<CreateKey>;
      if (!Object.keys(f).length && /sử dụng/i.test(api.message)) f.emailAddress = api.message;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const fields: { key: CreateKey; label: string; type?: string; placeholder?: string }[] = [
    { key: "name", label: "Họ và tên *" },
    { key: "emailAddress", label: "Email *", type: "email" },
    { key: "userName", label: "Tên đăng nhập", placeholder: "Bỏ trống để dùng email" },
    { key: "phoneNumber", label: "Số điện thoại" },
    { key: "password", label: "Mật khẩu *", type: "password", placeholder: "Tối thiểu 6 ký tự, gồm chữ và số" },
  ];

  return (
    <Drawer
      open
      width={460}
      onClose={onClose}
      header={<p className="text-sm font-semibold">Thêm tài khoản</p>}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <button onClick={onClose} className="hsv-btn-secondary">
            Hủy
          </button>
          <button onClick={save} disabled={busy} className="hsv-btn-primary">
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={formError} />
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`cu-${f.key}`} className="hsv-label">{f.label}</label>
            <input
              id={`cu-${f.key}`}
              type={f.type ?? "text"}
              autoComplete={f.type === "password" ? "new-password" : "off"}
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className={cn("hsv-input", errors[f.key] && "hsv-input-error")}
            />
            <FieldError message={errors[f.key]} />
          </div>
        ))}
        <div>
          <label htmlFor="cu-role" className="hsv-label">
            Vai trò
          </label>
          <select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as RoleName)} className="hsv-input">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Drawer>
  );
}

type ResetKey = "newPassword" | "confirmPassword";

function ResetPasswordDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const [form, setForm] = useState<Record<ResetKey, string>>({ newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<ResetKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: FieldErrors<ResetKey> = {};
    if (!isStrongPassword(form.newPassword)) e.newPassword = "Mật khẩu tối thiểu 6 ký tự, gồm cả chữ và số";
    if (form.confirmPassword !== form.newPassword) e.confirmPassword = "Mật khẩu nhập lại không khớp";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await userApi.resetPassword(user.id, form.newPassword);
      notify(`Đã đặt lại mật khẩu cho ${user.name}`);
      onClose();
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors() as FieldErrors<ResetKey>;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const fields: { key: ResetKey; label: string }[] = [
    { key: "newPassword", label: "Mật khẩu mới *" },
    { key: "confirmPassword", label: "Nhập lại mật khẩu mới *" },
  ];

  return (
    <Drawer
      open
      width={460}
      onClose={onClose}
      header={<p className="text-sm font-semibold">Đặt lại mật khẩu</p>}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <button onClick={onClose} className="hsv-btn-secondary">
            Hủy
          </button>
          <button onClick={save} disabled={busy} className="hsv-btn-primary">
            {busy ? "Đang lưu…" : "Đặt lại mật khẩu"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted2">
          Tài khoản: <span className="font-semibold text-ink-2">{user.name}</span> ({user.emailAddress || user.userName})
        </p>
        <FormAlert message={formError} />
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`rp-${f.key}`} className="hsv-label">{f.label}</label>
            <input
              id={`rp-${f.key}`}
              type="password"
              autoComplete="new-password"
              value={form[f.key]}
              placeholder={f.key === "newPassword" ? "Tối thiểu 6 ký tự, gồm chữ và số" : undefined}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className={cn("hsv-input", errors[f.key] && "hsv-input-error")}
            />
            <FieldError message={errors[f.key]} />
          </div>
        ))}
        <p className="rounded-lg bg-surface px-4 py-3 text-xs text-muted2">
          Báo mật khẩu mới cho người dùng qua kênh riêng. Mọi phiên đăng nhập hiện có của tài khoản này sẽ bị đăng xuất ngay.
        </p>
      </div>
    </Drawer>
  );
}

export default function AdminUsers() {
  const { session } = useAuth();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [roleFilter, setRoleFilter] = useState<RoleName | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const list = useApi(
    () => userApi.getAll({ keyword: keyword || undefined, roleName: roleFilter, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    [keyword, roleFilter, page]
  );

  const run = async (u: User, fn: () => Promise<User>, done: string) => {
    setBusyId(u.id);
    try {
      const updated = await fn();
      list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === u.id ? updated : x)) } : d!));
      notify(done);
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  const onRole = async (u: User, role: RoleName) => {
    if (u.id === session?.userId) return notify("Không thể thay đổi quyền của chính mình");
    if (u.roleNames.length === 1 && u.roleNames[0] === role) return;
    const ok = await confirm({ title: `Đổi quyền cho ${u.name}?`, body: `Vai trò mới: ${ROLE_LABEL[role]}. Người dùng sẽ bị đăng xuất và cần đăng nhập lại để nhận quyền mới.`, okLabel: "Xác nhận" });
    if (ok) await run(u, () => userApi.setRoles(u.id, [role]), "Đã cập nhật quyền");
  };

  const onLock = async (u: User) => {
    if (u.id === session?.userId) return notify("Bạn không thể khóa tài khoản của chính mình.");
    const ok = await confirm({
      title: `${u.isActive ? "Khóa" : "Mở khóa"} tài khoản ${u.name}?`,
      body: u.isActive
        ? "Người dùng sẽ không đăng nhập được nữa và phiên đang dùng bị từ chối ngay ở thao tác kế tiếp."
        : "Người dùng có thể đăng nhập lại.",
      okLabel: u.isActive ? "Khóa tài khoản" : "Mở khóa",
      danger: u.isActive,
    });
    if (ok) await run(u, () => userApi.setActive(u.id, !u.isActive), u.isActive ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
  };

  const rows = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Người dùng"
        subtitle="Tài khoản khách hàng, nhân viên và quản trị viên của cửa hàng."
        actions={
          <button onClick={() => setCreating(true)} className="hsv-btn-primary">
            <Plus className="h-4 w-4" />
            Thêm tài khoản
          </button>
        }
      />

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className="hsv-index">
          <div className="hsv-toolbar">
            <div className="flex flex-wrap gap-1">
              <Chip active={!roleFilter} onClick={() => (setRoleFilter(undefined), setPage(1))}>
                Mọi vai trò
              </Chip>
              {ROLES.map((r) => (
                <Chip key={r} active={roleFilter === r} onClick={() => (setRoleFilter(r), setPage(1))}>
                  {ROLE_LABEL[r]}
                </Chip>
              ))}
            </div>
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Tên, email, tên đăng nhập, số điện thoại"
              label="Tìm người dùng"
              className="ml-auto sm:max-w-[340px]"
            />
          </div>
          <div className={cn("overflow-x-auto", list.loading && list.data && "opacity-70")}>
            <div className="min-w-[940px]">
              <div className={cn("hsv-thead grid gap-3", COLS)}>
                <span>Người dùng ({list.data?.totalCount ?? "…"})</span>
                <span>Điện thoại</span>
                <span>Ngày tạo</span>
                <span>Vai trò</span>
                <span>Trạng thái</span>
                <span className="text-right">Thao tác</span>
              </div>
              {!list.data ? (
                <LoadingRows rows={6} />
              ) : rows.length === 0 ? (
                <EmptyState icon={Users} title="Không có người dùng phù hợp" body="Thử đổi từ khóa hoặc vai trò đang lọc." />
              ) : (
                rows.map((u) => {
                  const isMe = u.id === session?.userId;
                  const role: RoleName = u.roleNames.includes("Admin") ? "Admin" : u.roleNames.includes("Staff") ? "Staff" : "Customer";
                  return (
                    <div key={u.id} className={cn("hsv-trow grid items-center gap-3", COLS, busyId === u.id && "opacity-50")}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-active text-xs font-semibold text-ink-2">
                          {initialOf(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {u.name}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-muted2">(bạn)</span>}
                          </p>
                          <p className="truncate text-xs text-muted2">{u.emailAddress || u.userName}</p>
                        </div>
                      </div>
                      <span>{u.phoneNumber || "—"}</span>
                      <span className="text-muted2">{formatDate(u.creationTime)}</span>
                      <select
                        value={role}
                        onChange={(e) => onRole(u, e.target.value as RoleName)}
                        disabled={isMe || busyId === u.id}
                        title={isMe ? "Không thể thay đổi quyền của chính mình" : undefined}
                        aria-label={`Vai trò của ${u.name}`}
                        className="hsv-input"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <span>
                        <Badge tone={u.isActive ? "ok" : "danger"}>{u.isActive ? "Hoạt động" : "Đã khóa"}</Badge>
                      </span>
                      <div className="flex justify-end gap-3 whitespace-nowrap">
                        <button
                          onClick={() => setResetting(u)}
                          disabled={isMe || busyId === u.id}
                          title={isMe ? "Không thể đặt lại mật khẩu của chính mình" : undefined}
                          className="hsv-link"
                        >
                          Đặt lại mật khẩu
                        </button>
                        <button
                          onClick={() => onLock(u)}
                          disabled={isMe || busyId === u.id}
                          title={isMe ? "Không thể khóa tài khoản của chính mình" : undefined}
                          className={u.isActive ? "hsv-link-danger" : "hsv-link"}
                        >
                          {u.isActive ? "Khóa" : "Mở khóa"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />

      {creating && <CreateUserDrawer onClose={() => setCreating(false)} onCreated={() => void list.reload()} />}
      {resetting && <ResetPasswordDrawer user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
