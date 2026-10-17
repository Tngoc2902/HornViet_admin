"use client";

import { useEffect, useRef } from "react";
import { subscribeRealtime, type RealtimeEventName, type RealtimeEvents } from "@/lib/realtime";

/** Nghe một sự kiện thời gian thực do RealtimeProvider phát lại (handler luôn là bản mới nhất, không cần useCallback). */
export function useRealtime<K extends RealtimeEventName>(type: K, handler: (payload: RealtimeEvents[K]) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      subscribeRealtime((d) => {
        if (d.type === type) ref.current(d.payload as RealtimeEvents[K]);
      }),
    [type]
  );
}

/**
 * Tải lại dữ liệu khi có một trong các sự kiện; gom các sự kiện đến dồn dập (VD đơn có nhiều biến thể)
 * thành một lần tải sau <paramref name="delayMs"/>.
 */
export function useRealtimeRefresh(types: RealtimeEventName[], refresh: () => unknown, delayMs = 400) {
  const ref = useRef(refresh);
  ref.current = refresh;
  const key = types.join(",");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const names = key.split(",");
    const off = subscribeRealtime((d) => {
      if (!names.includes(d.type)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void ref.current(), delayMs);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [key, delayMs]);
}
