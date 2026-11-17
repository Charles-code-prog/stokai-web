'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IoFileTrayFull, IoFileTrayFullOutline, IoHome, IoHomeOutline, IoCube, IoCubeOutline,
  IoBarChart, IoBarChartOutline, IoPersonCircle, IoPersonCircleOutline, IoCloudOfflineOutline, IoClose,
} from 'react-icons/io5';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';

const TABS = [
  { href: '/encomendas', label: 'Encomendas', on: IoFileTrayFull, off: IoFileTrayFullOutline },
  { href: '/inicio',     label: 'Início',     on: IoHome,         off: IoHomeOutline },
  { href: '/estoque',    label: 'Estoque',    on: IoCube,         off: IoCubeOutline },
  { href: '/relatorios', label: 'Relatórios', on: IoBarChart,     off: IoBarChartOutline },
  { href: '/conta',      label: 'Conta',      on: IoPersonCircle, off: IoPersonCircleOutline },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, error: authError } = useAuth();
  const { loaded, syncError, clearError } = useData();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user && !authError) router.replace('/login');
  }, [ready, user, authError, router]);

  if (ready && !user && authError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">Stokai</div>
          <div className="auth-error" role="alert" style={{ marginTop: 16 }}>{authError}</div>
          <button className="confirm-btn" onClick={() => window.location.reload()}>Tentar de novo</button>
        </div>
      </div>
    );
  }

  if (!ready || !user || !loaded) {
    return (
      <div className="splash">
        <div className="spinner" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <div className="app">
      {syncError && (
        <div className="sync-error" role="alert">
          <IoCloudOfflineOutline size={16} />
          <span>Não foi possível salvar: {syncError}</span>
          <button className="icon-btn" onClick={clearError} aria-label="Fechar aviso"><IoClose size={16} /></button>
        </div>
      )}
      <main className="app-main">{children}</main>
      <nav className="tabbar">
        {TABS.map(t => {
          const active = pathname === t.href;
          const Icon = active ? t.on : t.off;
          return (
            <Link key={t.href} href={t.href} className={`tab ${active ? 'active' : ''}`}>
              <Icon size={22} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
