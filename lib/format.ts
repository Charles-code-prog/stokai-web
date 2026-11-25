import type { IconType } from 'react-icons';
import {
  IoLogoInstagram, IoLogoFacebook, IoLogoWhatsapp, IoStorefrontOutline, IoHelpCircleOutline,
} from 'react-icons/io5';

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const PLATFORMS: { key: string; icon: IconType; label: string }[] = [
  { key: 'instagram',  icon: IoLogoInstagram,     label: 'Instagram'  },
  { key: 'facebook',   icon: IoLogoFacebook,      label: 'Facebook'   },
  { key: 'whatsapp',   icon: IoLogoWhatsapp,      label: 'WhatsApp'   },
  { key: 'presencial', icon: IoStorefrontOutline, label: 'Presencial' },
  { key: 'outro',      icon: IoHelpCircleOutline, label: 'Outro'      },
];

/** 123456 → "R$ 1.234,56" (centavos) */
export function fullCurrency(c: number): string {
  const abs = Math.abs(c) / 100;
  const formatted = abs.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${c < 0 ? '-' : ''}${formatted}`;
}

/** Rótulo curto para eixo do gráfico: 150000 → "R$1.5k" */
export function labelCurrency(c: number): string {
  const abs = Math.abs(c) / 100;
  const str = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs.toFixed(0)}`;
  return c < 0 ? `-R$${str}` : `R$${str}`;
}

/** "35,50" → 3550 */
export function parseCents(s: string): number {
  return Math.round((parseFloat(s.replace(',', '.')) || 0) * 100);
}

/** 3550 → "35,50" */
export function centsToInput(c: number): string {
  return (c / 100).toFixed(2).replace('.', ',');
}

/** "35.5" / "35,5" → "35,50" (preços do estoque são texto) */
export function toReais(raw: string): string {
  const n = parseFloat(raw.replace(',', '.')) || 0;
  return n.toFixed(2).replace('.', ',');
}

export function calcMargin(preco: string, custo: string): string | null {
  const p = parseFloat(preco.replace(',', '.')) || 0;
  const c = parseFloat(custo.replace(',', '.')) || 0;
  if (p === 0) return null;
  return (((p - c) / p) * 100).toFixed(0);
}

export function formatDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function newId(): string {
  return String(Date.now());
}

/** Hora atual em ms (fora do corpo dos componentes, para o lint do React). */
export function nowMs(): number {
  return Date.now();
}
