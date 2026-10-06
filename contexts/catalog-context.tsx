"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { categoryApi, materialApi } from "@/lib/api/services";
import type { Category, Material } from "@/lib/api/types";

// Danh mục và nguyên liệu: đọc công khai, dùng chung cho header, bộ lọc và form quản trị.
// Trang quản trị gọi reload() sau khi thêm / sửa / xóa.

type CatalogValue = {
  categories: Category[];
  materials: Material[];
  loaded: boolean;
  reload: () => Promise<void>;
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [c, m] = await Promise.allSettled([categoryApi.getAll(), materialApi.getAll()]);
    if (c.status === "fulfilled") setCategories(c.value.items ?? []);
    if (m.status === "fulfilled") setMaterials(m.value.items ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ categories, materials, loaded, reload }), [categories, materials, loaded, reload]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
