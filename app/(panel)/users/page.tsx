"use client";

import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Chip, Drawer, ErrorBox, FieldError, FormAlert, LoadingRows, notify, Pager } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { userApi } from "@/lib/api/services";
import type { RoleName, User } from "@/lib/api/types";
import { formatDate, initialOf, ROLE_LABEL } from "@/lib/hsv/format";
import { isStrongPassword, isValidEmail, isValidPhone, normalizePhone, type FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const COLS = "grid-cols-[minmax(0,1.6fr)_120px_100px_minmax(0,2.1fr)_100px_90px]";
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
      header={<p className="font-serif text-[22px]">Thêm tài khoản</p>}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <button onClick={onClose} className="px-[18px] py-[11px] text-sm">
            Hủy
          </button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-navy px-6 py-[11px] text-sm font-semibold text-white disabled:opacity-60">
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
              className={cn("hsv-input h-11 text-sm", errors[f.key] && "hsv-input-error")}
            />
            <FieldError message={errors[f.key]} />
          </div>
        ))}
        <div>
          <p className="hsv-label mb-2">Vai trò</p>
          <div className="flex gap-1.5">
            {ROLES.map((r) => (
              <Chip key={r} active={role === r} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </Chip>
            ))}
          </div>
        </div>
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
    const ok = await confirm({ title: `Đổi quyền cho ${u.name}?`, body: `Vai trò mới: ${ROLE_LABEL[role]}.`, okLabel: "Xác nhận" });
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
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Tên, email, tên đăng nhập, số điện thoại"
          aria-label="Tìm người dùng"
          className="h-10 w-[300px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!roleFilter} onClick={() => (setRoleFilter(undefined), setPage(1))} className="px-3 py-[7px] text-[12.5px]">
            Mọi vai trò
          </Chip>
          {ROLES.map((r) => (
            <Chip key={r} active={roleFilter === r} onClick={() => (setRoleFilter(r), setPage(1))} className="px-3 py-[7px] text-[12.5px]">
              {ROLE_LABEL[r]}
            </Chip>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="ml-auto rounded-lg bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white">
          + Thêm tài khoản
        </button>
      </div>

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[900px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COLS)}>
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
              <p className="px-5 py-8 text-center text-sm text-subtle">Không có người dùng phù hợp.</p>
            ) : (
              rows.map((u) => {
                const isMe = u.id === session?.userId;
                return (
                  <div key={u.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-[13px]", COLS, busyId === u.id && "opacity-50")}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface-active text-[13px] font-bold">
                        {initialOf(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold">
                          {u.name}
                          {isMe && <span className="ml-1.5 text-[11px] font-semibold text-gold">(bạn)</span>}
                        </p>
                        <p className="truncate text-xs text-subtle">{u.emailAddress || u.userName}</p>
                      </div>
                    </div>
                    <span className="text-[13px]">{u.phoneNumber || "—"}</span>
                    <span className="text-[12.5px] text-subtle">{formatDate(u.creationTime)}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.map((r) => (
                        <Chip
                          key={r}
                          active={u.roleNames.includes(r)}
                          disabled={busyId === u.id}
                          onClick={() => onRole(u, r)}
                          className={cn("px-2.5 py-[5px] text-xs", isMe && !u.roleNames.includes(r) && "opacity-50")}
                        >
                          {ROLE_LABEL[r]}
                        </Chip>
                      ))}
                    </div>
                    <span
                      className={cn(
                        "justify-self-start rounded-lg px-2.5 py-[3px] text-xs font-semibold",
                        u.isActive ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
                      )}
                    >
                      {u.isActive ? "Hoạt động" : "Đã khóa"}
                    </span>
                    <button
                      onClick={() => onLock(u)}
                      disabled={isMe || busyId === u.id}
                      title={isMe ? "Không thể khóa tài khoản của chính mình" : undefined}
                      className={cn("text-right text-[13px] font-semibold", u.isActive ? "text-danger" : "text-ok", isMe && "cursor-not-allowed opacity-40")}
                    >
                      {u.isActive ? "Khóa" : "Mở khóa"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />

      {creating && <CreateUserDrawer onClose={() => setCreating(false)} onCreated={() => void list.reload()} />}
    </div>
  );
}
