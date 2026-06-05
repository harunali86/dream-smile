import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smile Solution",
  description: "AI-powered veneer visualization — See your dream smile instantly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
