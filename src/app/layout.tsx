import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* the website's wordmark face */
const grotesk = Space_Grotesk({
  variable: "--font-disp",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resona — free music streaming",
  description:
    "Resona is a free, open-source music app: search, stream, like, playlist, download and import — no account, no ads. An independent reimplementation inspired by OpenSpot.",
  keywords: ["Resona", "music", "open source", "youtube music", "player", "playlists"],
  authors: [{ name: "Resona" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Spotify-style default: dark on first run. Settings → Appearance → Auto/Light still wins once chosen. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!localStorage.getItem('theme'))localStorage.setItem('theme','dark')}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} ${grotesk.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
