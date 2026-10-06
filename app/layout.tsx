import type { Metadata } from "next";
import { Be_Vietnam_Pro, Literata } from "next/font/google";
import { Toaster } from "sonner";
import ClientOnly from "@/components/ClientOnly";
import { ConfirmProvider } from "@/components/hsv/confirm-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { CatalogProvider } from "@/contexts/catalog-context";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam",
});

const literata = Literata({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-literata",
});

export const metadata: Metadata = {
  title: "Quản trị – Hồn Sừng Việt",
  description: "Trang quản trị cửa hàng Hồn Sừng Việt dành cho Nhân viên và Quản trị viên.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${beVietnam.variable} ${literata.variable}`}>
      <body suppressHydrationWarning>
        {/* Phiên đăng nhập (JWT) lưu ở localStorage nên toàn bộ ứng dụng render phía client. */}
        <ClientOnly>
          <AuthProvider>
            <CatalogProvider>
              <ConfirmProvider>
                {children}
                <Toaster
                  position="bottom-center"
                  duration={2600}
                  toastOptions={{
                    unstyled: true,
                    classNames: {
                      toast:
                        "flex items-center whitespace-pre-line rounded-lg bg-[#111] px-[22px] py-[13px] text-sm font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,.25)] font-sans",
                    },
                  }}
                />
              </ConfirmProvider>
            </CatalogProvider>
          </AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
