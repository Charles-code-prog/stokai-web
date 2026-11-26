'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './backend';
import { useAuth } from './auth';
import { useData } from './data';

export type OrgMembership = {
  orgId: string;
  orgName: string;
  role: 'owner' | 'member';
  status: 'pending' | 'approved';
};

export type OrgPerson = { userId: string; email: string; name: string; role: string; status: string; since: number };

export type OrgInfo = {
  membership: OrgMembership | null;
  members?: OrgPerson[];
  pending?: OrgPerson[];
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: number;
  read: boolean;
};

type NotificationsState = {
  items: AppNotification[];
  unread: number;
  emailEnabled: boolean;
  emailConfigured: boolean;
};

interface WorkspaceCtx {
  org: OrgInfo | null;
  notifications: NotificationsState;
  refresh: () => Promise<void>;
  orgAction: (body: Record<string, unknown>) => Promise<unknown>;
  markAllRead: () => Promise<void>;
  setEmailEnabled: (enabled: boolean) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

const POLL_MS = 45_000;
const EMPTY: NotificationsState = { items: [], unread: 0, emailEnabled: true, emailConfigured: false };

/** Empresa + notificações. Atualiza a cada 45 s e quando o app volta a ficar visível. */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { reload: reloadData } = useData();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationsState>(EMPTY);
  const lastScope = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.emailVerified) return;
    try {
      const [o, n] = await Promise.all([
        api<OrgInfo>('/api/org'),
        api<NotificationsState>('/api/notifications'),
      ]);
      setOrg(o);
      setNotifications(n);
      // Se o espaço de dados mudou (entrou/saiu de empresa), recarrega tudo
      const scope = o.membership?.status === 'approved' ? o.membership.orgId : 'pessoal';
      if (lastScope.current !== null && lastScope.current !== scope) await reloadData();
      lastScope.current = scope;
    } catch {
      // sem conexão: tenta de novo no próximo ciclo
    }
  }, [user, reloadData]);

  useEffect(() => {
    if (!user?.emailVerified) return;
    let alive = true;
    const tick = () => { if (alive && document.visibilityState === 'visible') void refresh(); };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
      void reloadData(); // dados da empresa podem ter mudado em outro aparelho
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refresh, reloadData]);

  const orgAction = useCallback(async (body: Record<string, unknown>) => {
    const r = await api('/api/org', body);
    await refresh();
    return r;
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications(n => ({ ...n, unread: 0, items: n.items.map(i => ({ ...i, read: true })) }));
    try { await api('/api/notifications', { op: 'readAll' }); } catch {}
  }, []);

  const setEmailEnabled = useCallback(async (enabled: boolean) => {
    setNotifications(n => ({ ...n, emailEnabled: enabled }));
    await api('/api/notifications', { op: 'emailPref', enabled });
  }, []);

  return (
    <WorkspaceContext.Provider value={{ org, notifications, refresh, orgAction, markAllRead, setEmailEnabled }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace fora do WorkspaceProvider');
  return ctx;
}
