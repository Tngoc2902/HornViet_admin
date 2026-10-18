"use client";

import { isReturnFlow, SHIPMENT_FLOW, shipmentLabel, shipmentStepIndex } from "@/lib/hsv/shipping";
import { cn } from "@/lib/utils";

/** Tiến trình vận đơn theo từng bước; giao thất bại / hoàn hàng hiện thêm dòng cảnh báo. */
export function ShipmentProgress({ status }: { status: string | null | undefined }) {
  const current = shipmentStepIndex(status);
  const returning = isReturnFlow(status);
  const failed = status === "delivery_fail";
  return (
    <div className="mt-3">
      <ol className="grid grid-cols-6 gap-1">
        {SHIPMENT_FLOW.map((step, i) => {
          const done = !returning && i <= current;
          return (
            <li key={step.key} className="flex flex-col gap-1.5">
              <span className={cn("h-1 rounded-full", done ? (failed && i === current ? "bg-[#c0841a]" : "bg-navy") : "bg-line")} />
              <span className={cn("text-[11px] leading-tight", i === current && !returning ? "font-semibold text-ink" : "text-muted2")}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {(failed || returning) && (
        <p className="mt-2 text-[12.5px] font-semibold text-[#8a5a12]">
          {failed ? "Giao hàng thất bại — đang chờ giao lại hoặc hoàn hàng." : `Hoàn hàng: ${shipmentLabel(status)}`}
        </p>
      )}
    </div>
  );
}
