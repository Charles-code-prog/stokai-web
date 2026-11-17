'use client';

import { useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  IoPerson, IoCamera, IoCardOutline, IoPersonOutline, IoColorPaletteOutline, IoChevronForward,
  IoDownloadOutline, IoCloudUploadOutline, IoLogOutOutline, IoCameraOutline, IoImagesOutline,
  IoTrashOutline, IoMoon, IoSunny, IoCheckmark, IoKeyOutline,
} from 'react-icons/io5';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { ACCENT_OPTIONS, type ThemeMode } from '@/lib/theme';
import { downloadBlob, imageFileToSquareDataUrl } from '@/lib/share';
import { api } from '@/lib/backend';
import type { BackupData } from '@/lib/types';
import { ActionSheet, Field, PageHeader, Sheet, useDialog } from '@/components/ui';

function isBackup(d: unknown): d is BackupData {
  const b = d as BackupData;
  return !!b && b.app === 'stokai' &&
    Array.isArray(b.products) && Array.isArray(b.sales) && Array.isArray(b.expenses) &&
    Array.isArray(b.orders) && !!b.preferences && typeof b.preferences === 'object';
}

function OptionRow({ icon: Icon, label, onClick, detail }: { icon: IconType; label: string; onClick: () => void; detail?: string }) {
  return (
    <button className="option-row" onClick={onClick}>
      <span className="option-icon"><Icon size={20} /></span>
      <span className="option-label">{label}</span>
      {detail ? <span className="option-detail">{detail}</span> : null}
      <IoChevronForward size={18} className="muted" />
    </button>
  );
}

export default function AccountPage() {
  const data = useData();
  const { theme, accent, getPref, setPref } = data;
  const { user, signOut } = useAuth();
  const dialog = useDialog();

  const photoUri = getPref('photo_uri') || null;
  const userName = getPref('user_name');
  const businessName = getPref('business_name');
  const phone = getPref('user_phone');
  const pixKey = getPref('pix_key');

  const [photoSheet, setPhotoSheet] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const [custModal, setCustModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftBusiness, setDraftBusiness] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftPixKey, setDraftPixKey] = useState('');

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  function openInfoModal() {
    setDraftName(userName); setDraftBusiness(businessName); setDraftPhone(phone); setDraftPixKey(pixKey);
    setInfoModal(true);
  }
  function saveInfo() {
    setPref('user_name', draftName.trim());
    setPref('business_name', draftBusiness.trim());
    setPref('user_phone', draftPhone.trim());
    setPref('pix_key', draftPixKey.trim());
    setInfoModal(false);
  }

  async function onPhotoPicked(file: File | undefined) {
    setPhotoSheet(false);
    if (!file) return;
    try {
      setPref('photo_uri', await imageFileToSquareDataUrl(file));
    } catch {
      await dialog.alert('Erro', 'Não foi possível usar esta imagem.');
    }
  }
  async function removePhoto() {
    const ok = await dialog.confirm({
      title: 'Remover foto', message: 'Deseja remover a foto de perfil?', confirmLabel: 'Remover', danger: true,
    });
    if (!ok) return;
    setPref('photo_uri', '');
    setPhotoSheet(false);
  }

  function exportBackup() {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data.exportAll(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `stokai-backup-${date}.json`);
  }
  async function onBackupPicked(file: File | undefined) {
    if (backupInput.current) backupInput.current.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      await dialog.alert('Arquivo inválido', 'O arquivo não é um JSON.');
      return;
    }
    if (!isBackup(parsed)) {
      await dialog.alert('Arquivo inválido', 'O arquivo não é um backup do Stokai.');
      return;
    }
    const ok = await dialog.confirm({
      title: 'Importar backup?',
      message:
        `${parsed.products.length} produtos, ${parsed.sales.length} vendas, ` +
        `${parsed.expenses.length} gastos, ${parsed.orders.length} encomendas.\n\n` +
        'Todos os dados atuais serão substituídos.',
      confirmLabel: 'Importar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await data.importAll(parsed);
      await dialog.alert('Backup importado', 'Seus dados foram restaurados.');
    } catch (err) {
      await dialog.alert('Erro ao importar', (err as Error)?.message ?? 'Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function openPwModal() {
    setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwError(null);
    setPwModal(true);
  }
  async function changePassword() {
    if (pwNew !== pwConfirm) { setPwError('As senhas novas não conferem.'); return; }
    setPwBusy(true);
    setPwError(null);
    try {
      await api('/api/auth/password', { current: pwCurrent, password: pwNew });
      setPwModal(false);
      await dialog.alert('Senha alterada', 'Os outros aparelhos conectados precisarão entrar de novo.');
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  async function handleSignOut() {
    const ok = await dialog.confirm({ title: 'Sair da conta?', confirmLabel: 'Sair' });
    if (ok) await signOut();
  }

  const initials = userName ? userName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() : null;

  return (
    <div className="page">
      <PageHeader sub="Perfil" title="Conta" />

      <div className="avatar-section">
        <button className="avatar-wrap" onClick={() => setPhotoSheet(true)} aria-label="Foto de perfil">
          {photoUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUri} alt="" className="avatar" />
          ) : (
            <span className="avatar placeholder">{initials ? <span className="avatar-initials">{initials}</span> : <IoPerson size={44} />}</span>
          )}
          <span className="camera-badge"><IoCamera size={14} /></span>
        </button>
        {userName ? <div className="avatar-name">{userName}</div> : null}
        {businessName ? <div className="avatar-business">{businessName}</div> : null}
        {pixKey ? <div className="avatar-pix"><IoCardOutline size={11} /> {pixKey}</div> : null}
      </div>

      <div className="section">
        <OptionRow icon={IoPersonOutline} label="Informações pessoais" onClick={openInfoModal} />
        <div className="separator" />
        <OptionRow icon={IoColorPaletteOutline} label="Personalização" onClick={() => setCustModal(true)} />
      </div>

      <div className="section">
        <OptionRow icon={IoDownloadOutline} label="Exportar backup" onClick={exportBackup} />
        <div className="separator" />
        <OptionRow icon={IoCloudUploadOutline} label={busy ? 'Importando…' : 'Importar backup'} onClick={() => backupInput.current?.click()} />
      </div>

      <div className="section">
        <OptionRow icon={IoKeyOutline} label="Alterar senha" onClick={openPwModal} />
        <div className="separator" />
        <OptionRow icon={IoLogOutOutline} label="Sair" detail={user?.email ?? undefined} onClick={handleSignOut} />
      </div>

      <div className="version">Stokai Web v1.0.0</div>

      <input ref={cameraInput} type="file" accept="image/*" capture="user" hidden onChange={e => onPhotoPicked(e.target.files?.[0])} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={e => onPhotoPicked(e.target.files?.[0])} />
      <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={e => onBackupPicked(e.target.files?.[0])} />

      <ActionSheet
        open={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Foto de perfil"
        actions={[
          { icon: IoCameraOutline, label: 'Tirar foto', onClick: () => cameraInput.current?.click() },
          { icon: IoImagesOutline, label: 'Escolher da galeria', onClick: () => galleryInput.current?.click() },
          ...(photoUri ? [{ icon: IoTrashOutline, label: 'Remover foto', tone: 'danger' as const, onClick: removePhoto }] : []),
        ]}
      />

      <Sheet
        open={infoModal}
        onClose={() => setInfoModal(false)}
        title="Informações pessoais"
        footer={<button className="confirm-btn" onClick={saveInfo}>Salvar</button>}
      >
        <Field label="Seu nome" value={draftName} onChange={setDraftName} placeholder="Ex: Maria Silva" />
        <Field label="Nome do negócio" value={draftBusiness} onChange={setDraftBusiness} placeholder="Ex: Ateliê da Maria" />
        <Field label="Telefone" value={draftPhone} onChange={setDraftPhone} placeholder="(00) 00000-0000" inputMode="tel" />
        <Field label="Chave PIX" value={draftPixKey} onChange={setDraftPixKey} placeholder="CPF, e-mail, telefone ou chave aleatória" />
      </Sheet>

      <Sheet
        open={pwModal}
        onClose={() => setPwModal(false)}
        title="Alterar senha"
        footer={
          <button className="confirm-btn" disabled={pwBusy || !pwCurrent || pwNew.length < 6} onClick={changePassword}>
            {pwBusy ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        }
      >
        <Field label="Senha atual" type="password" value={pwCurrent} onChange={setPwCurrent} />
        <Field label="Nova senha (mín. 6 caracteres)" type="password" value={pwNew} onChange={setPwNew} />
        <Field label="Repita a nova senha" type="password" value={pwConfirm} onChange={setPwConfirm} />
        {pwError && <div className="auth-error" role="alert">{pwError}</div>}
      </Sheet>

      <Sheet open={custModal} onClose={() => setCustModal(false)} title="Personalização">
        <div className="cust-section">Aparência</div>
        <div className="theme-row">
          {([['dark', 'Escuro', IoMoon], ['light', 'Claro', IoSunny]] as [ThemeMode, string, IconType][]).map(([m, label, Icon]) => (
            <button key={m} className={`theme-card ${theme === m ? 'on' : ''}`} onClick={() => data.setTheme(m)}>
              <Icon size={26} />
              <span>{label}</span>
              {theme === m && <span className="theme-check"><IoCheckmark size={12} /></span>}
            </button>
          ))}
        </div>
        <div className="cust-section">Cor de destaque</div>
        <div className="accent-grid">
          {ACCENT_OPTIONS.map(opt => (
            <button key={opt.hex} className="accent-item" onClick={() => data.setAccent(opt.hex)} aria-label={opt.name}>
              <span className={`accent-swatch ${accent === opt.hex ? 'on' : ''}`} style={{ background: opt.hex }}>
                {accent === opt.hex && <IoCheckmark size={18} color="#0F1117" />}
              </span>
              <span className="accent-label">{opt.name}</span>
            </button>
          ))}
        </div>
        <div style={{ height: 16 }} />
      </Sheet>
    </div>
  );
}
