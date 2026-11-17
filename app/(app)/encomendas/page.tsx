'use client';

import { useMemo, useState } from 'react';
import {
  IoAdd, IoEllipsisVertical, IoFileTrayFullOutline, IoEyeOutline, IoPencilOutline,
  IoCheckmarkCircleOutline, IoTrashOutline,
} from 'react-icons/io5';
import { useData } from '@/lib/data';
import { fullCurrency, newId, parseCents } from '@/lib/format';
import { DELIVERED_COLOR, PENDING_COLOR } from '@/lib/theme';
import type { DBOrder } from '@/lib/types';
import { ActionSheet, DetailRow, EmptyState, PageHeader, Sheet, useDialog } from '@/components/ui';

function centsToInput(c: number): string {
  return c > 0 ? (c / 100).toFixed(2).replace('.', ',') : '';
}

function formatDeliveryDate(o: DBOrder): string {
  const d = String(o.delivery_day).padStart(2, '0');
  const m = String(o.delivery_month).padStart(2, '0');
  const h = String(o.delivery_hour).padStart(2, '0');
  return `${d}/${m}/${o.delivery_year} às ${h}h`;
}

function getOrderUrgency(o: DBOrder): 'late' | 'today' | null {
  if (o.status === 'entregue') return null;
  const now = new Date();
  const delivery = new Date(o.delivery_year, o.delivery_month - 1, o.delivery_day, o.delivery_hour, 0, 0);
  if (delivery.getTime() <= now.getTime()) return 'late';
  const sameDay =
    o.delivery_day === now.getDate() && o.delivery_month === now.getMonth() + 1 && o.delivery_year === now.getFullYear();
  return sameDay ? 'today' : null;
}

function OrderCard({ order, onMenu }: { order: DBOrder; onMenu: () => void }) {
  const { colors } = useData();
  const isDelivered = order.status === 'entregue';
  const statusColor = isDelivered ? DELIVERED_COLOR : PENDING_COLOR;
  const urgency = getOrderUrgency(order);
  const urgencyColor = urgency === 'late' ? colors.expense : urgency === 'today' ? PENDING_COLOR : null;

  return (
    <div
      className={`card entry-card ${isDelivered ? 'delivered' : ''}`}
      style={urgencyColor ? { border: `1px solid ${urgencyColor}55` } : undefined}
    >
      {urgencyColor && <div className="expense-accent" style={{ background: urgencyColor }} />}
      <div className="card-top">
        <div className="grow">
          <div className="card-name">{order.descricao || 'Encomenda'}</div>
          <div className="card-date" style={urgencyColor ? { color: urgencyColor, fontWeight: 700 } : undefined}>
            Entrega: {formatDeliveryDate(order)}
            {urgency === 'late' ? ' · Atrasada' : urgency === 'today' ? ' · Hoje' : ''}
          </div>
        </div>
        <div className="card-total">{fullCurrency(order.preco_centavos * order.quantidade)}</div>
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Opções"><IoEllipsisVertical size={18} /></button>
      </div>
      <div className="card-divider" />
      <div className="card-cols">
        <div className="col"><div className="col-label">Preço/un</div><div className="col-value">{fullCurrency(order.preco_centavos)}</div></div>
        <div className="col"><div className="col-label">Qtd</div><div className="col-value">{order.quantidade}</div></div>
        {order.custo_centavos > 0 && (
          <div className="col"><div className="col-label">Custo</div><div className="col-value">{fullCurrency(order.custo_centavos)}</div></div>
        )}
        {order.cliente ? (
          <div className="col grow"><div className="col-label">Cliente</div><div className="col-value ellipsis">{order.cliente}</div></div>
        ) : null}
      </div>
      <div className="pill" style={{ background: statusColor + '22', borderColor: statusColor, color: statusColor }}>
        {isDelivered ? 'Entregue' : 'Pendente'}
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  descricao: '', preco: '', quantidade: '1', custo: '', cliente: '', contato: '',
  day: '', month: '', year: '', hour: '',
};

export default function OrdersPage() {
  const data = useData();
  const { accent, orders } = data;
  const dialog = useDialog();

  const [orderModal, setOrderModal] = useState<{ open: boolean; editing: DBOrder | null }>({ open: false, editing: null });
  const [actionSheet, setActionSheet] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<DBOrder | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (key: keyof typeof EMPTY_FORM) => (v: string) => setForm(prev => ({ ...prev, [key]: v }));

  const parsedPrice = parseCents(form.preco);
  const parsedQty = parseInt(form.quantidade) || 0;
  const parsedCusto = parseCents(form.custo);
  const parsedDay = parseInt(form.day) || 0;
  const parsedMonth = parseInt(form.month) || 0;
  const parsedYear = parseInt(form.year) || 0;
  const parsedHour = form.hour.trim() === '' ? -1 : parseInt(form.hour);
  const validDate = parsedDay >= 1 && parsedDay <= 31 && parsedMonth >= 1 && parsedMonth <= 12 && parsedYear >= 2000;
  const validHour = parsedHour >= 0 && parsedHour <= 23;
  const canRegister = form.descricao.trim() !== '' && parsedPrice > 0 && parsedQty > 0 && validDate && validHour;

  const pendentes = useMemo(() => orders
    .filter(o => o.status === 'pendente')
    .sort((a, b) => (a.delivery_year - b.delivery_year) || (a.delivery_month - b.delivery_month) || (a.delivery_day - b.delivery_day)),
  [orders]);
  const entregues = useMemo(() => orders
    .filter(o => o.status === 'entregue')
    .sort((a, b) => (b.delivery_year - a.delivery_year) || (b.delivery_month - a.delivery_month) || (b.delivery_day - a.delivery_day)),
  [orders]);

  function openCreate() {
    const now = new Date();
    setForm({
      ...EMPTY_FORM,
      day: String(now.getDate()),
      month: String(now.getMonth() + 1),
      year: String(now.getFullYear()),
      hour: String(now.getHours()),
    });
    setOrderModal({ open: true, editing: null });
  }
  function openEdit(o: DBOrder) {
    setForm({
      descricao: o.descricao,
      preco: centsToInput(o.preco_centavos),
      quantidade: String(o.quantidade),
      custo: centsToInput(o.custo_centavos),
      cliente: o.cliente,
      contato: o.contato,
      day: String(o.delivery_day),
      month: String(o.delivery_month),
      year: String(o.delivery_year),
      hour: String(o.delivery_hour),
    });
    setActionSheet(null);
    setOrderModal({ open: true, editing: o });
  }
  function closeModal() {
    setForm(EMPTY_FORM);
    setOrderModal({ open: false, editing: null });
  }
  function handleSave() {
    if (!canRegister) return;
    const fields = {
      descricao: form.descricao.trim(),
      preco_centavos: parsedPrice,
      quantidade: parsedQty,
      custo_centavos: parsedCusto,
      cliente: form.cliente.trim(),
      contato: form.contato.trim(),
      delivery_day: parsedDay,
      delivery_month: parsedMonth,
      delivery_year: parsedYear,
      delivery_hour: parsedHour,
    };
    if (orderModal.editing) data.updateOrder({ ...orderModal.editing, ...fields });
    else data.insertOrder({ id: newId(), ...fields, status: 'pendente', timestamp: Date.now() });
    closeModal();
  }

  function handleView(id: string) {
    const o = orders.find(x => x.id === id);
    if (o) setViewOrder(o);
    setActionSheet(null);
  }
  async function handleDeliver(id: string) {
    const order = orders.find(x => x.id === id);
    if (!order) return;
    const ok = await dialog.confirm({
      title: 'Marcar como entregue',
      message: 'A encomenda será marcada como entregue e uma venda correspondente será criada na tela de Vendas.',
    });
    if (!ok) return;
    const now = new Date();
    data.insertSale({
      id: newId(),
      product_id: '',
      descricao: order.descricao || 'Encomenda',
      preco_centavos: order.preco_centavos,
      quantidade: order.quantidade,
      desconto_centavos: 0,
      total_centavos: order.preco_centavos * order.quantidade,
      custo_centavos: order.custo_centavos,
      plataforma: '',
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      timestamp: Date.now(),
    });
    data.updateOrder({ ...order, status: 'entregue' });
    setActionSheet(null);
  }
  async function handleDelete(id: string) {
    const ok = await dialog.confirm({
      title: 'Confirmar exclusão',
      message: 'Deseja excluir esta encomenda? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    data.deleteOrder(id);
    setActionSheet(null);
  }

  const actionSheetOrder = orders.find(o => o.id === actionSheet) ?? null;

  return (
    <div className="page">
      <PageHeader
        sub="Encomendas"
        title="Encomendas"
        right={<button className="add-btn" onClick={openCreate} aria-label="Nova encomenda"><IoAdd size={30} /></button>}
      />

      {orders.length === 0 ? (
        <EmptyState icon={IoFileTrayFullOutline} title="Nenhuma encomenda" sub="Toque em + para cadastrar a primeira encomenda" />
      ) : (
        <>
          {pendentes.length > 0 && <div className="section-title">Pendentes · {pendentes.length}</div>}
          {pendentes.map(o => <OrderCard key={o.id} order={o} onMenu={() => setActionSheet(o.id)} />)}
          {entregues.length > 0 && <div className="section-title">Entregues · {entregues.length}</div>}
          {entregues.map(o => <OrderCard key={o.id} order={o} onMenu={() => setActionSheet(o.id)} />)}
        </>
      )}

      <Sheet
        open={orderModal.open}
        onClose={closeModal}
        title={orderModal.editing ? 'Editar Encomenda' : 'Nova Encomenda'}
        footer={
          <button className="confirm-btn" disabled={!canRegister} onClick={handleSave}>
            {orderModal.editing ? 'Salvar alterações' : 'Cadastrar encomenda'}
          </button>
        }
      >
        <label className="field">
          <span className="field-label">Descrição *</span>
          <input className="input" value={form.descricao} onChange={e => set('descricao')(e.target.value)} placeholder="Ex: 2 canecas personalizadas" />
        </label>
        <div className="row">
          <label className="field">
            <span className="field-label">Preço unit. (R$) *</span>
            <input className="input" value={form.preco} onChange={e => set('preco')(e.target.value)} placeholder="0,00" inputMode="decimal" />
          </label>
          <label className="field">
            <span className="field-label">Quantidade *</span>
            <input className="input" value={form.quantidade} onChange={e => set('quantidade')(e.target.value)} placeholder="1" inputMode="numeric" />
          </label>
        </div>

        <div className="field-label">Data e hora de entrega *</div>
        <div className="row date-row">
          <input className="input" aria-label="Dia" value={form.day} onChange={e => set('day')(e.target.value)} placeholder="Dia" inputMode="numeric" maxLength={2} />
          <input className="input" aria-label="Mês" value={form.month} onChange={e => set('month')(e.target.value)} placeholder="Mês" inputMode="numeric" maxLength={2} />
          <input className="input year" aria-label="Ano" value={form.year} onChange={e => set('year')(e.target.value)} placeholder="Ano" inputMode="numeric" maxLength={4} />
          <input className="input" aria-label="Hora" value={form.hour} onChange={e => set('hour')(e.target.value)} placeholder="Hora" inputMode="numeric" maxLength={2} />
        </div>

        <div className="field-label" style={{ marginTop: 4 }}>Detalhes opcionais</div>
        <input className="input" value={form.custo} onChange={e => set('custo')(e.target.value)} placeholder="Custo (R$)" inputMode="decimal" />
        <input className="input" value={form.cliente} onChange={e => set('cliente')(e.target.value)} placeholder="Cliente" />
        <input className="input" value={form.contato} onChange={e => set('contato')(e.target.value)} placeholder="Contato (00) 00000-0000" inputMode="tel" />

        {parsedPrice > 0 && parsedQty > 0 && (
          <div className="preview">
            <span className="preview-label">Total da encomenda</span>
            <span className="preview-value">{fullCurrency(parsedPrice * parsedQty)}</span>
          </div>
        )}
      </Sheet>

      <ActionSheet
        open={actionSheet !== null}
        onClose={() => setActionSheet(null)}
        title="Opções da Encomenda"
        actions={[
          { icon: IoEyeOutline, label: 'Ver detalhes', onClick: () => actionSheet && handleView(actionSheet) },
          { icon: IoPencilOutline, label: 'Editar', onClick: () => { const o = orders.find(x => x.id === actionSheet); if (o) openEdit(o); } },
          ...(actionSheetOrder?.status === 'pendente'
            ? [{ icon: IoCheckmarkCircleOutline, label: 'Marcar como entregue', tone: 'accent' as const, onClick: () => actionSheet && handleDeliver(actionSheet) }]
            : []),
          { icon: IoTrashOutline, label: 'Excluir', tone: 'danger', onClick: () => actionSheet && handleDelete(actionSheet) },
        ]}
      />

      <Sheet open={viewOrder !== null} onClose={() => setViewOrder(null)} title="Detalhes da Encomenda">
        {viewOrder && (
          <>
            <DetailRow label="Descrição" value={viewOrder.descricao || 'Encomenda'} />
            <DetailRow
              label="Status"
              value={viewOrder.status === 'entregue' ? 'Entregue' : 'Pendente'}
              color={viewOrder.status === 'entregue' ? DELIVERED_COLOR : PENDING_COLOR}
            />
            <DetailRow label="Entrega" value={formatDeliveryDate(viewOrder)} />
            <DetailRow label="Preço/un" value={fullCurrency(viewOrder.preco_centavos)} />
            <DetailRow label="Quantidade" value={String(viewOrder.quantidade)} />
            <DetailRow label="Total" value={fullCurrency(viewOrder.preco_centavos * viewOrder.quantidade)} color={accent} />
            {viewOrder.custo_centavos > 0 && <DetailRow label="Custo" value={fullCurrency(viewOrder.custo_centavos)} />}
            {viewOrder.cliente ? <DetailRow label="Cliente" value={viewOrder.cliente} /> : null}
            {viewOrder.contato ? <DetailRow label="Contato" value={viewOrder.contato} /> : null}
            <div style={{ height: 16 }} />
          </>
        )}
      </Sheet>
    </div>
  );
}
