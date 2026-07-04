import type { Metadata, Viewport } from 'next';
import { Inter, Manrope, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/providers/query-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import './globals.css';

// Brand typography — Inter (body/UI), Manrope (headings), IBM Plex Sans Arabic
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Umrah Connect',
    template: '%s | Umrah Connect',
  },
  description: 'The connected operating system for Umrah journeys — travelers, operators, hotels, transport, visas, and finance in one ecosystem.',
  keywords: ['umrah', 'hajj', 'operator', 'platform', 'saas', 'umrah connect'],
  icons: { icon: '/favicon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0F3D37',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} ${arabic.variable}`}
    >
      <body className={inter.className}>
        <AuthProvider>
          <QueryProvider>
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
