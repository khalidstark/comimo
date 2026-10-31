import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import { MoveComics } from "@/components/account/MoveComics";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Comimo: your day, as a comic",
    template: "%s | Comimo",
  },
  description:
    "Talk about your day in Arabic, English or both, and get back a short comic starring your own cast. Your comic book follows your account to every device.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceff2" },
    { media: "(prefers-color-scheme: dark)", color: "#11152e" },
  ],
};

/**
 * Runs before first paint so a saved theme (or ?theme=dark|light for
 * screenshots) never flashes the wrong colours.
 */
const themeScript = `(function(){try{var d=document.documentElement;var q=new URLSearchParams(location.search).get("theme");var t=(q==="dark"||q==="light")?q:localStorage.getItem("comimo-theme");if(t==="dark"||t==="light"){d.dataset.theme=t}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Nav />
        {children}
        <MoveComics />
      </body>
    </html>
  );
}
