"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, toApiError } from "@/lib/api/http";

type State<T> = { data: T | undefined; error: ApiError | null; loading: boolean };

/**
 * Gọi API khi deps đổi; giữ dữ liệu cũ trong lúc tải lại và bỏ qua
 * response về trễ của lần gọi trước.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[], enabled = true) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: enabled });
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, error: toApiError(e), loading: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    else setState({ data: undefined, error: null, loading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reload, ...deps]);

  const setData = useCallback((data: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({ ...s, data: typeof data === "function" ? (data as (p: T | undefined) => T)(s.data) : data }));
  }, []);

  return { ...state, reload, setData };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
