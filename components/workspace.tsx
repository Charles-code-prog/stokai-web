'use client';

import { useState } from 'react';
import {
  IoBusinessOutline, IoEnterOutline, IoPeopleOutline, IoCartOutline, IoRemoveCircleOutline,
  IoFileTrayFullOutline, IoPersonAddOutline, IoCheckmarkCircleOutline, IoCloseCircleOutline,
  IoLogOutOutline, IoNotificationsOutline, IoTimeOutline,
} from 'react-icons/io5';
import type { IconType } from 'react-icons';
import { useAuth } from '@/lib/auth';
import { useWorkspace, type AppNotification, type OrgPerson } from '@/lib/workspace';
import { Field, OptionRow, Sheet, useDialog } from './ui';

// ─── Empresa ─────────────────────────────────────────────────────────────────

export function OrgSection() {
  const { org, orgAction } = useWorkspace();
  const { user } = useAuth();
  const dialog = useDialog();

  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keyword2, setKeyword2] = useState('');
  const [bringData, setBringData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(kind: 'create' | 'join') {
    setName(''); setKeyword(''); setKeyword2(''); setBringData(true); setError(null);
    setSheet(kind);
  }

  async function submit() {
    setError(null);
    if (sheet === 'create' && keyword !== keyword2) {
      setError('As palavras-chave não conferem.');
      return;
    }
    setBusy(true);
    try {
      if (sheet === 'create') {
        await orgAction({ op: 'create', name, keyword, bringData });
        setSheet(null);
        await dialog.alert('Empresa criada', 'Passe o nome da empresa e a palavra-chave para quem vai entrar. Você recebe uma notificação a cada pedido.');
      } else {
        const r = (await orgAction({ op: 'join', name, keyword })) as { orgName: string };
        setSheet(null);
        await dialog.alert('Pedido enviado', `Quem criou ${r.orgName} vai receber seu pedido. Você é avisado quando for aprovado.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, confirm?: { title: string; message?: string; label: string; danger?: boolean }) {
    if (confirm) {
      const ok = await dialog.confirm({ title: confirm.title, message: confirm.message, confirmLabel: confirm.label, danger: confirm.danger });
      if (!ok) return;
    }
    try {
      await orgAction(body);
    } catch (err) {
      await dialog.alert('Não foi possível', (err as Error).message);
    }
  }

  const m = org?.membership ?? null;
  const person = (p: OrgPerson) => p.name || p.email;

  return (
    <>
      <div className="section-label">Empresa</div>

      {org === null ? (
        <div className="section"><div className="pending-box muted">Carregando…</div></div>
      ) : !m ? (
        <div className="section">
          <OptionRow icon={IoBusinessOutline} label="Criar empresa" onClick={() => open('create')} />
          <div className="separator" />
          <OptionRow icon={IoEnterOutline} label="Entrar em uma empresa" onClick={() => open('join')} />
        </div>
      ) : m.status === 'pending' ? (
        <div className="section">
          <div className="pending-box">
            Pedido enviado para <b>{m.orgName}</b>. Aguardando aprovação de quem criou a empresa.
          </div>
          <div className="separator" style={{ marginLeft: 0 }} />
          <OptionRow
            icon={IoCloseCircleOutline}
            label="Cancelar pedido"
            onClick={() => act({ op: 'leave' }, { title: 'Cancelar pedido?', label: 'Cancelar pedido' })}
          />
        </div>
      ) : (
        <div className="section">
          <div className="org-head">
            <span className="option-icon"><IoBusinessOutline size={20} /></span>
            <div className="grow">
              <div className="org-name">{m.orgName}</div>
              <div className="org-role">
                {m.role === 'owner' ? 'Você criou esta empresa' : 'Você é membro'} · {org.members?.length ?? 1} pessoa{(org.members?.length ?? 1) !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {org.pending && org.pending.length > 0 && (
            <>
              {org.pending.map(p => (
                <div key={p.userId} className="person-row">
                  <IoPersonAddOutline size={20} className="accent" />
                  <div className="grow">
                    <div className="person-name">{person(p)}</div>
                    <div className="person-email">quer entrar · {p.email}</div>
                  </div>
                  <button className="btn-sm no" onClick={() => act({ op: 'reject', userId: p.userId }, { title: 'Recusar pedido?', message: `${person(p)} não entrará na empresa.`, label: 'Recusar', danger: true })}>Recusar</button>
                  <button className="btn-sm ok" onClick={() => act({ op: 'approve', userId: p.userId })}>Aprovar</button>
                </div>
              ))}
            </>
          )}

          {org.members?.map(p => (
            <div key={p.userId} className="person-row">
              <IoPeopleOutline size={20} className="muted" />
              <div className="grow">
                <div className="person-name">{person(p)}{p.userId === user?.id ? ' (você)' : ''}</div>
                <div className="person-email">{p.email}</div>
              </div>
              {p.role === 'owner' ? (
                <span className="pill-sm">Dono</span>
              ) : m.role === 'owner' ? (
                <button
                  className="btn-sm danger"
                  onClick={() => act({ op: 'remove', userId: p.userId }, { title: 'Remover membro?', message: `${person(p)} deixará de ver os dados da empresa.`, label: 'Remover', danger: true })}
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))}

          {m.role === 'member' && (
            <>
              <div className="separator" style={{ marginLeft: 0 }} />
              <OptionRow
                icon={IoLogOutOutline}
                label="Sair da empresa"
                onClick={() => act({ op: 'leave' }, {
                  title: 'Sair da empresa?',
                  message: 'Você deixa de ver os dados da empresa e volta a ver seus dados pessoais.',
                  label: 'Sair',
                  danger: true,
                })}
              />
            </>
          )}
        </div>
      )}

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'create' ? 'Criar empresa' : 'Entrar em uma empresa'}
        footer={
          <button className="confirm-btn" disabled={busy || name.trim().length < 2 || keyword.trim().length < 4} onClick={submit}>
            {busy ? 'Aguarde…' : sheet === 'create' ? 'Criar empresa' : 'Pedir para entrar'}
          </button>
        }
      >
        <Field label="Nome da empresa" value={name} onChange={setName} placeholder="Ex: Ateliê da Maria" />
        <Field
          label={sheet === 'create' ? 'Palavra-chave (mín. 4 caracteres)' : 'Palavra-chave'}
          type="password" value={keyword} onChange={setKeyword}
        />
        {sheet === 'create' && (
          <>
            <Field label="Repita a palavra-chave" type="password" value={keyword2} onChange={setKeyword2} />
            <button className="check-row" onClick={() => setBringData(v => !v)}>
              <span className={`checkbox ${bringData ? 'on' : ''}`}>{bringData && '✓'}</span>
              Levar meus produtos, vendas, gastos e encomendas atuais para a empresa
            </button>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              Quem quiser entrar vai informar o nome e a palavra-chave. Você recebe uma notificação e decide se aprova.
            </p>
          </>
        )}
        {sheet === 'join' && (
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
            Peça o nome e a palavra-chave para quem criou a empresa. Depois de aprovado, você passa a ver os dados da empresa; os seus dados pessoais ficam guardados.
          </p>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}
      </Sheet>
    </>
  );
}

// ─── Notificações ────────────────────────────────────────────────────────────

const ICONS: Record<string, IconType> = {
  sale: IoCartOutline,
  expense: IoRemoveCircleOutline,
  order: IoFileTrayFullOutline,
  join_request: IoPersonAddOutline,
  join_approved: IoCheckmarkCircleOutline,
  join_rejected: IoCloseCircleOutline,
  member_left: IoLogOutOutline,
  member_removed: IoLogOutOutline,
};

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function NotificationsEntry({ onOpen }: { onOpen: () => void }) {
  const { notifications } = useWorkspace();
  return <OptionRow icon={IoNotificationsOutline} label="Notificações" count={notifications.unread} onClick={onOpen} />;
}

export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifications, org, orgAction, markAllRead, setEmailEnabled } = useWorkspace();
  const dialog = useDialog();
  const pendingIds = new Set(org?.pending?.map(p => p.userId) ?? []);

  function close() {
    if (notifications.unread > 0) void markAllRead();
    onClose();
  }

  async function decide(userId: string, approve: boolean) {
    try {
      await orgAction({ op: approve ? 'approve' : 'reject', userId });
    } catch (err) {
      await dialog.alert('Não foi possível', (err as Error).message);
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Notificações">
      <div className="switch-row">
        <div className="grow">
          <div>E-mails de movimentações</div>
          <div>Receber um e-mail a cada venda, gasto ou encomenda registrada{org?.membership?.status === 'approved' ? ' na empresa' : ''}.</div>
        </div>
        <button
          className={`switch ${notifications.emailEnabled ? 'on' : ''}`}
          role="switch"
          aria-checked={notifications.emailEnabled}
          aria-label="E-mails de movimentações"
          onClick={() => setEmailEnabled(!notifications.emailEnabled).catch(() => {})}
        />
      </div>
      {!notifications.emailConfigured && (
        <p className="warn-note">O envio de e-mails ainda não foi configurado no servidor (GMAIL_USER e GMAIL_APP_PASSWORD no Vercel).</p>
      )}

      {notifications.items.length === 0 ? (
        <div className="empty-inline"><IoTimeOutline size={36} /><div>Nenhuma notificação ainda.</div></div>
      ) : (
        notifications.items.map((n: AppNotification) => {
          const Icon = ICONS[n.kind] ?? IoNotificationsOutline;
          const requester = n.kind === 'join_request' ? String(n.data.userId ?? '') : '';
          return (
            <div key={n.id} className="notif-row">
              <span className={`notif-icon ${n.kind === 'expense' ? 'expense' : ''}`}><Icon size={18} /></span>
              <div className="grow">
                <div className="notif-title">{n.title}</div>
                {n.body ? <div className="notif-body">{n.body}</div> : null}
                <div className="notif-time">{timeAgo(n.createdAt)}</div>
                {requester && pendingIds.has(requester) && (
                  <div className="notif-actions">
                    <button className="btn-sm no" onClick={() => decide(requester, false)}>Recusar</button>
                    <button className="btn-sm ok" onClick={() => decide(requester, true)}>Aprovar</button>
                  </div>
                )}
              </div>
              {!n.read && <span className="notif-dot" aria-label="não lida" />}
            </div>
          );
        })
      )}
      <div style={{ height: 12 }} />
    </Sheet>
  );
}
