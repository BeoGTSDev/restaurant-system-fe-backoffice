import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maison Lucas · Dish Up",
  description: "Kitchen station and dish coordination display"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
