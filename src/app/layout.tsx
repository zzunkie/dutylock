import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DutyLock: charge US import duties exactly",
  description:
    "AI finds every tariff code US customs could apply, PayPal holds the highest duty, and the seller captures only what customs actually charges.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-4 text-sm sm:gap-8">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-base">
              <Logo />
              DutyLock
            </Link>
            <div className="flex gap-4 whitespace-nowrap text-muted sm:gap-6">
              <Link href="/shop" className="hover:text-ink">
                <span className="sm:hidden">Shop</span>
                <span className="hidden sm:inline">Demo shop</span>
              </Link>
              <Link href="/try" className="hover:text-ink">
                <span className="sm:hidden">Classify</span>
                <span className="hidden sm:inline">Classify your product</span>
              </Link>
              <Link href="/seller" className="hover:text-ink">
                <span className="sm:hidden">Seller</span>
                <span className="hidden sm:inline">Seller console</span>
              </Link>
            </div>
            <span className="ml-auto hidden text-xs text-muted sm:block">PayPal sandbox · no real money</span>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-6 text-xs leading-relaxed text-muted">
            Demo for the PayPal AI Hackathon. Payments run in the PayPal sandbox. Tariff data: USITC HTSUS 2026 Revision 23; additional
            duties as of 2026-11-11 (see the Sources section of the README). Estimates are not customs advice.
          </div>
        </footer>
      </body>
    </html>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="1" y="9" width="20" height="12" rx="3" fill="var(--ink)" />
      <path d="M6 9V6.5a5 5 0 0 1 10 0V9" stroke="var(--ink)" strokeWidth="2" fill="none" />
      <rect x="5" y="13" width="7" height="4" rx="1" fill="var(--hold)" />
      <rect x="12" y="13" width="5" height="4" rx="1" fill="var(--release)" />
    </svg>
  );
}
