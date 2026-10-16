import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ULTRA PHONE ERP", description: "Gestão de aparelhos, vendas e recebimentos ULTRA PHONE.", icons: {icon:"/favicon.svg"} };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}
