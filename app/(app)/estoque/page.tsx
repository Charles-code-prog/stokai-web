'use client';

import { useRef, useState } from 'react';
import {
  IoAdd, IoEllipsisVertical, IoCubeOutline, IoEyeOutline, IoPencilOutline, IoTrashOutline,
} from 'react-icons/io5';
import { useData } from '@/lib/data';
import { calcMargin, formatDate, newId, toReais } from '@/lib/format';
import type { DBProduct } from '@/lib/types';
import { ActionSheet, DetailRow, EmptyState, Field, PageHeader, Sheet, useDialog } from '@/components/ui';

type ProductForm = Omit<DBProduct, 'id' | 'updated_at'>;

const EMPTY: ProductForm = { nome: '', fornecedor: '', preco: '', custo: '', link: '', contato: '', quantidade: '' };

const SWIPE_THRESHOLD = 80;

/** Arrastar o card para a direita (≥ 80px) pede para excluir — como no app. */
function SwipeableCard({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);

  return (
    <div className="swipe-wrap">
      <div className="swipe-bg" style={{ opacity: Math.min(dx / SWIPE_THRESHOLD, 1) }}>
        <IoTrashOutline size={22} />
      </div>
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform .25s ease' }}
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
        }}
        onPointerMove={e => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (s.horizontal === null && Math.hypot(mx, my) > 5) {
            s.horizontal = mx > 5 && Math.abs(mx) > Math.abs(my) * 1.5;
            if (s.horizontal) {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDragging(true);
            } else {
              start.current = null;
              return;
            }
          }
          if (s.horizontal) setDx(Math.max(0, mx));
        }}
        onPointerUp={() => {
          const fire = start.current?.horizontal && dx >= SWIPE_THRESHOLD;
          start.current = null;
          setDragging(false);
          setDx(0);
          if (fire) onDelete();
        }}
        onPointerCancel={() => { start.current = null; setDragging(false); setDx(0); }}
      >
        {children}
      </div>
    </div>
  );
}

export default function StockPage() {
  const data = useData();
  const { accent, colors, products } = data;
  const dialog = useDialog();

  const [productModal, setProductModal] = useState<{ open: boolean; editing: DBProduct | null }>({ open: false, editing: null });
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [actionSheet, setActionSheet] = useState<string | null>(null);
  const [viewProduct, setViewProduct] = useState<DBProduct | null>(null);

  const set = (key: keyof ProductForm) => (v: string) => setForm(prev => ({ ...prev, [key]: v }));
  const hasData = (f: ProductForm) => Object.values(f).some(v => v.trim() !== '');

  function openCreate() {
    setForm(EMPTY);
    setProductModal({ open: true, editing: null });
  }
  function openEdit(p: DBProduct) {
    setForm({ nome: p.nome, fornecedor: p.fornecedor, preco: p.preco, custo: p.custo, link: p.link, contato: p.contato, quantidade: p.quantidade });
    setActionSheet(null);
    setProductModal({ open: true, editing: p });
  }
  function closeModal() {
    setForm(EMPTY);
    setProductModal({ open: false, editing: null });
  }
  function handleSave() {
    if (!hasData(form)) return;
    const now = Date.now();
    if (productModal.editing) data.updateProduct({ id: productModal.editing.id, ...form, updated_at: now });
    else data.insertProduct({ id: newId(), ...form, updated_at: now });
    closeModal();
  }
  function handleView(id: string) {
    const p = products.find(x => x.id === id);
    if (p) setViewProduct(p);
    setActionSheet(null);
  }
  async function handleDelete(id: string) {
    const ok = await dialog.confirm({
      title: 'Confirmar exclusão',
      message: 'Deseja excluir este produto? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    data.deleteProduct(id);
    setActionSheet(null);
  }

  const viewMargin = viewProduct ? calcMargin(viewProduct.preco, viewProduct.custo) : null;

  return (
    <div className="page">
      <PageHeader
        sub="Catálogo"
        title="Produtos"
        right={<button className="add-btn" onClick={openCreate} aria-label="Novo produto"><IoAdd size={30} /></button>}
      />

      {products.length > 0 && (
        <div className="count-text">
          {products.length} produto{products.length !== 1 ? 's' : ''} cadastrado{products.length !== 1 ? 's' : ''}
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState icon={IoCubeOutline} title="Catálogo vazio" sub="Toque em + para adicionar o primeiro produto" />
      ) : (
        <div className="product-list">
          {products.map(item => {
            const margin = calcMargin(item.preco, item.custo);
            return (
              <SwipeableCard key={item.id} onDelete={() => handleDelete(item.id)}>
                <div className="card product-card">
                  <div className="card-top">
                    <div className="grow">
                      <div className="card-name product-name">{item.nome}</div>
                      {item.fornecedor ? <div className="card-supplier">{item.fornecedor}</div> : null}
                    </div>
                    <div className="qty-badge">
                      <span className="qty-text">{item.quantidade || '0'}</span>
                      <span className="qty-unit">un</span>
                    </div>
                    <button className="icon-btn menu-btn" onClick={() => setActionSheet(item.id)} aria-label="Opções">
                      <IoEllipsisVertical size={18} />
                    </button>
                  </div>
                  <div className="card-divider" />
                  <div className="card-cols">
                    <div className="col"><div className="col-label">Venda</div><div className="col-value">R$ {toReais(item.preco)}</div></div>
                    <div className="col"><div className="col-label">Custo</div><div className="col-value muted">R$ {toReais(item.custo)}</div></div>
                    {margin !== null && (
                      <div className="col"><div className="col-label">Margem</div><div className="col-value accent">{margin}%</div></div>
                    )}
                    {item.contato ? (
                      <div className="col grow"><div className="col-label">Contato</div><div className="col-value">{item.contato}</div></div>
                    ) : null}
                  </div>
                  {item.updated_at > 0 && <div className="card-updated">Atualizado: {formatDate(item.updated_at)}</div>}
                </div>
              </SwipeableCard>
            );
          })}
          <div className="hint">Arraste um produto para a direita para excluir</div>
        </div>
      )}

      <Sheet
        open={productModal.open}
        onClose={closeModal}
        title={productModal.editing ? 'Editar Produto' : 'Novo Produto'}
        footer={
          <button className="confirm-btn" disabled={!hasData(form)} onClick={handleSave}>
            {productModal.editing ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
        }
      >
        <Field label="Nome do produto *" value={form.nome} onChange={set('nome')} placeholder="Ex: Caneca Sublimática" />
        <Field label="Fornecedor" value={form.fornecedor} onChange={set('fornecedor')} placeholder="Ex: SubliTransfer" />
        <div className="row">
          <Field label="Preço de venda (R$)" value={form.preco} onChange={set('preco')} placeholder="0,00" inputMode="decimal" />
          <Field label="Custo (R$)" value={form.custo} onChange={set('custo')} placeholder="0,00" inputMode="decimal" />
        </div>
        <Field label="Quantidade em estoque" value={form.quantidade} onChange={set('quantidade')} placeholder="0" inputMode="numeric" />
        <Field label="Contato do fornecedor" value={form.contato} onChange={set('contato')} placeholder="(00) 00000-0000" inputMode="tel" />
        <Field label="Link do produto" value={form.link} onChange={set('link')} placeholder="https://" inputMode="url" />
      </Sheet>

      <ActionSheet
        open={actionSheet !== null}
        onClose={() => setActionSheet(null)}
        title="Opções do Produto"
        actions={[
          { icon: IoEyeOutline, label: 'Ver detalhes', onClick: () => actionSheet && handleView(actionSheet) },
          { icon: IoPencilOutline, label: 'Editar', onClick: () => { const p = products.find(x => x.id === actionSheet); if (p) openEdit(p); } },
          { icon: IoTrashOutline, label: 'Excluir', tone: 'danger', onClick: () => actionSheet && handleDelete(actionSheet) },
        ]}
      />

      <Sheet open={viewProduct !== null} onClose={() => setViewProduct(null)} title="Detalhes do Produto">
        {viewProduct && (
          <>
            <DetailRow label="Nome" value={viewProduct.nome || '—'} />
            <DetailRow label="Fornecedor" value={viewProduct.fornecedor || '—'} />
            <DetailRow label="Preço venda" value={`R$ ${toReais(viewProduct.preco)}`} color={accent} />
            <DetailRow label="Custo" value={`R$ ${toReais(viewProduct.custo)}`} />
            {viewMargin !== null && <DetailRow label="Margem" value={`${viewMargin}%`} color={accent} />}
            <DetailRow label="Estoque" value={`${viewProduct.quantidade || '0'} un`} />
            {viewProduct.contato ? <DetailRow label="Contato" value={viewProduct.contato} /> : null}
            {viewProduct.link ? (
              <div className="detail-row">
                <span className="detail-label">Link</span>
                <a className="detail-value link" href={safeUrl(viewProduct.link)} target="_blank" rel="noopener noreferrer" style={{ color: colors.text }}>
                  {viewProduct.link}
                </a>
              </div>
            ) : null}
            <div style={{ height: 16 }} />
          </>
        )}
      </Sheet>
    </div>
  );
}

/** Só abre links http(s); texto sem protocolo vira https://. */
function safeUrl(raw: string): string {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';
  return `https://${s}`;
}
