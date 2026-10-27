import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Averiq Chat — пространство для общения",
  description: "Личные разговоры, близкие люди. Мессенджер Averiq Chat.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
