import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import ClientOnly from "@/components/ClientOnly";
import { ConfirmProvider } from "@/components/hsv/confirm-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { CatalogProvider } from "@/contexts/catalog-context";
import { RealtimeProvider } from "@/contexts/realtime-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Quản trị – Hồn Sừng Việt",
  description: "Trang quản trị cửa hàng Hồn Sừng Việt dành cho Nhân viên và Quản trị viên.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body suppressHydrationWarning>
        {/* Phiên đăng nhập (JWT) lưu ở localStorage nên toàn bộ ứng dụng render phía client. */}
        <ClientOnly>
          <AuthProvider>
            <RealtimeProvider>
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
                          "flex items-center whitespace-pre-line rounded-xl bg-brand px-4 py-3 text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,.3)] font-sans",
                      },
                    }}
                  />
                </ConfirmProvider>
              </CatalogProvider>
            </RealtimeProvider>
          </AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
