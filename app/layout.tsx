import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { DataProvider } from '@/lib/data';
import { DialogProvider } from '@/components/ui';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Stokai',
  description: 'Vendas, gastos, estoque e encomendas do seu negócio.',
  manifest: '/manifest.json',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Stokai', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F1117',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes de pintar a página */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <DataProvider>
            <DialogProvider>{children}</DialogProvider>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
