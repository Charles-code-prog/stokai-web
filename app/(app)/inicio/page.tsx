'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IoEyeOutline, IoEyeOffOutline, IoAddCircleOutline, IoRemoveCircleOutline, IoEllipsisVertical,
  IoCheckmark, IoReceiptOutline, IoClose, IoShareOutline, IoPencilOutline, IoTrashOutline,
} from 'react-icons/io5';
import { useData } from '@/lib/data';
import { useWorkspace } from '@/lib/workspace';
import {
  MONTHS, PLATFORMS, centsToInput, fullCurrency, labelCurrency, newId, parseCents,
} from '@/lib/format';
import { shareNodeAsImage } from '@/lib/share';
import type { DBExpense, DBProduct, DBSale } from '@/lib/types';
import { ActionSheet, DetailRow, Sheet, useDialog, useLongPress } from '@/components/ui';

type ListEntry =
  | { kind: 'sale'; item: DBSale }
  | { kind: 'expense'; item: DBExpense };

const CHART_PAD = { left: 54, right: 20, top: 20, bottom: 36 };

function buildChartData(
  sales: DBSale[], expenses: DBExpense[], month: number, year: number, today: number,
): { day: number; value: number }[] {
  return Array.from({ length: today }, (_, i) => {
    const day = i + 1;
    const salesTotal = sales
      .filter(s => s.day === day && s.month === month && s.year === year)
      .reduce((sum, s) => sum + s.total_centavos, 0);
    const expTotal = expenses
      .filter(e => e.day === day && e.month === month && e.year === year)
      .reduce((sum, e) => sum + e.valor_centavos, 0);
    return { day, value: salesTotal - expTotal };
  });
}

// ─── Gráfico ─────────────────────────────────────────────────────────────────

function RevenueChart({ data, height }: { data: { day: number; value: number }[]; height: number }) {
  const { colors, accent } = useData();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svg = (() => {
    if (data.length === 0 || width === 0) return null;
    const plotW = width - CHART_PAD.left - CHART_PAD.right;
    const plotH = height - CHART_PAD.top - CHART_PAD.bottom;

    const maxVal = Math.max(...data.map(d => d.value), 0);
    const minVal = Math.min(...data.map(d => d.value), 0);
    const niceMax = Math.ceil(Math.max(maxVal, 1) / 50000) * 50000;
    const niceMin = minVal < 0 ? Math.floor(minVal / 50000) * 50000 : 0;
    const totalRange = niceMax - niceMin;
    const hasNeg = minVal < 0;

    const getX = (day: number) =>
      data.length > 1 ? CHART_PAD.left + ((day - 1) / (data.length - 1)) * plotW : CHART_PAD.left + plotW / 2;
    const getY = (v: number) => CHART_PAD.top + (1 - (v - niceMin) / totalRange) * plotH;
    const zeroY = getY(0);

    const linePath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${getX(d.day).toFixed(1)},${getY(d.value).toFixed(1)}`)
      .join(' ');
    const areaPath =
      linePath +
      ` L${getX(data[data.length - 1].day).toFixed(1)},${zeroY.toFixed(1)}` +
      ` L${getX(data[0].day).toFixed(1)},${zeroY.toFixed(1)} Z`;

    const rawStep = (niceMax - niceMin) / 5;
    const niceStep = Math.max(Math.ceil(rawStep / 50000) * 50000, 50000);
    const yTicks: number[] = [];
    for (let v = niceMin; v <= niceMax + niceStep * 0.01; v += niceStep) yTicks.push(Math.round(v));

    const n = data.length;
    const xLabels = Array.from(
      new Set([1, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n]),
    ).filter(d => d >= 1 && d <= n);
    const last = data[data.length - 1];
    const lastColor = last.value < 0 ? colors.expense : accent;
    const bottomY = CHART_PAD.top + plotH;

    return (
      <svg width={width} height={height} role="img" aria-label="Resultado diário do mês">
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.expense} stopOpacity="0" />
            <stop offset="100%" stopColor={colors.expense} stopOpacity="0.20" />
          </linearGradient>
        </defs>
        {yTicks.map(v => {
          const isZero = v === 0;
          return (
            <g key={v}>
              <line
                x1={CHART_PAD.left} y1={getY(v)} x2={CHART_PAD.left + plotW} y2={getY(v)}
                stroke={isZero && hasNeg ? colors.expense : colors.grid}
                strokeWidth={isZero && hasNeg ? 1.5 : 1}
                strokeDasharray={isZero && !hasNeg ? undefined : '4 4'}
              />
              <text
                x={CHART_PAD.left - 6} y={getY(v) + 4} fontSize="9.5" textAnchor="end"
                fill={v < 0 ? colors.expense : colors.textSecondary}
              >
                {labelCurrency(v)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#grad)" />
        {hasNeg && <path d={areaPath} fill="url(#gradNeg)" />}
        <path
          d={linePath} stroke={hasNeg && last.value < 0 ? colors.expense : accent}
          strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx={getX(last.day)} cy={getY(last.value)} r="5" fill={lastColor} stroke={colors.background} strokeWidth="2.5" />
        {xLabels.map(day => (
          <text key={day} x={getX(day)} y={bottomY + 20} fontSize="10" fill={colors.textSecondary} textAnchor="middle">
            {day}
          </text>
        ))}
        <text x={CHART_PAD.left + plotW / 2} y={height - 2} fontSize="9" fill={colors.textSecondary} textAnchor="middle">
          Dias do mês
        </text>
      </svg>
    );
  })();

  return <div ref={ref} className="chart" style={{ height }}>{svg}</div>;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function EntryCard({
  entry, selectMode, selected, onMenu, onLongPress, onSelect,
}: {
  entry: ListEntry;
  selectMode: boolean;
  selected: boolean;
  onMenu: () => void;
  onLongPress: () => void;
  onSelect: () => void;
}) {
  const lp = useLongPress(() => { if (!selectMode) onLongPress(); });
  const isSale = entry.kind === 'sale';
  const sale = isSale ? entry.item : null;
  const exp = !isSale ? entry.item : null;
  const platform = sale ? PLATFORMS.find(p => p.key === sale.plataforma) : undefined;

  return (
    <div
      className={[
        'card entry-card', isSale ? '' : 'expense',
        selected ? 'selected' : '', selectMode && !selected ? 'dimmed' : '',
      ].join(' ')}
      {...lp}
      onClick={() => { if (lp.consumed()) return; if (selectMode) onSelect(); }}
    >
      {selectMode && (
        <div className={`check-badge ${selected ? 'on' : ''}`}>{selected && <IoCheckmark size={12} />}</div>
      )}
      {!isSale && <div className="expense-accent" />}
      <div className="card-top">
        <div className="grow">
          <div className="card-name">{sale ? sale.descricao || 'Venda' : exp!.descricao || 'Gasto'}</div>
          <div className="card-date">Dia {entry.item.day}</div>
        </div>
        <div className={`card-total ${isSale ? '' : 'neg'}`}>
          {sale ? fullCurrency(sale.total_centavos) : `-${fullCurrency(exp!.valor_centavos)}`}
        </div>
        {!selectMode && (
          <button
            className="icon-btn menu-btn" aria-label="Opções"
            onClick={e => { e.stopPropagation(); onMenu(); }}
            onPointerDown={e => e.stopPropagation()}
          >
            <IoEllipsisVertical size={18} />
          </button>
        )}
      </div>
      <div className="card-divider" />
      <div className="card-cols">
        {sale ? (
          <>
            <Col label="Preço/un" value={fullCurrency(sale.preco_centavos)} />
            <Col label="Qtd" value={String(sale.quantidade)} />
            {sale.desconto_centavos > 0 && <Col label="Desconto" value={`-${fullCurrency(sale.desconto_centavos)}`} neg />}
            {sale.desconto_centavos > 0 && <Col label="Subtotal" value={fullCurrency(sale.preco_centavos * sale.quantidade)} />}
          </>
        ) : (
          <>
            <Col label="Tipo" value="Gasto" neg />
            <Col label="Valor" value={fullCurrency(exp!.valor_centavos)} neg />
          </>
        )}
      </div>
      {platform && !selectMode && (
        <div className="platform-badge" title={platform.label}><platform.icon size={14} /></div>
      )}
    </div>
  );
}

function Col({ label, value, neg }: { label: string; value: string; neg?: boolean }) {
  return (
    <div className="col">
      <div className="col-label">{label}</div>
      <div className={`col-value ${neg ? 'neg' : ''}`}>{value}</div>
    </div>
  );
}

// ─── Prévia para compartilhar (cores fixas, sempre escura) ───────────────────

function SharePreview({ entries, accent, monthLabel }: { entries: ListEntry[]; accent: string; monthLabel: string }) {
  const totalSales = entries.reduce((s, e) => s + (e.kind === 'sale' ? e.item.total_centavos : 0), 0);
  const totalExpenses = entries.reduce((s, e) => s + (e.kind === 'expense' ? e.item.valor_centavos : 0), 0);
  const net = totalSales - totalExpenses;

  return (
    <div className="sp-card">
      <div className="sp-header">
        <span className="sp-brand" style={{ color: accent }}>Stokai</span>
        <span className="sp-month">{monthLabel}</span>
      </div>
      {entries.map(entry => {
        const isSale = entry.kind === 'sale';
        const label = isSale ? entry.item.descricao || 'Venda' : entry.item.descricao || 'Gasto';
        const platLabel = isSale ? PLATFORMS.find(p => p.key === entry.item.plataforma)?.label ?? '' : '';
        const value = isSale ? fullCurrency(entry.item.total_centavos) : `-${fullCurrency(entry.item.valor_centavos)}`;
        return (
          <div key={`${entry.kind}:${entry.item.id}`} className="sp-row">
            <div className="grow">
              <div className="sp-row-label">{label}</div>
              <div className="sp-row-day">Dia {entry.item.day}{platLabel ? ` · ${platLabel}` : ''}</div>
            </div>
            <div className="sp-row-value" style={{ color: isSale ? accent : '#FF6B6B' }}>{value}</div>
          </div>
        );
      })}
      <div className="sp-divider" />
      <div className="sp-summary">
        {totalSales > 0 && (
          <div className="sp-sum-row">
            <span>Vendas</span><b style={{ color: accent }}>{fullCurrency(totalSales)}</b>
          </div>
        )}
        {totalExpenses > 0 && (
          <div className="sp-sum-row">
            <span>Gastos</span><b style={{ color: '#FF6B6B' }}>-{fullCurrency(totalExpenses)}</b>
          </div>
        )}
        <div className="sp-sum-row total">
          <span>Resultado</span><b style={{ color: net < 0 ? '#FF6B6B' : accent }}>{fullCurrency(net)}</b>
        </div>
      </div>
      <div className="sp-footer">gerado com Stokai</div>
    </div>
  );
}

// ─── Tela ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const data = useData();
  const { colors, accent } = data;
  const dialog = useDialog();
  const { org } = useWorkspace();
  const orgName = org?.membership?.status === 'approved' ? org.membership.orgName : null;

  const now = new Date();
  const todayDay = now.getDate();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const monthLabel = `${MONTHS[thisMonth - 1]} ${thisYear}`;

  const sales = useMemo(
    () => data.sales.filter(s => s.month === thisMonth && s.year === thisYear),
    [data.sales, thisMonth, thisYear]);
  const expenses = useMemo(
    () => data.expenses.filter(e => e.month === thisMonth && e.year === thisYear),
    [data.expenses, thisMonth, thisYear]);
  const chartData = useMemo(
    () => buildChartData(data.sales, data.expenses, thisMonth, thisYear, todayDay),
    [data.sales, data.expenses, thisMonth, thisYear, todayDay]);
  const products = data.products;

  const [showChart, setShowChart] = useState(true);
  const [chartH] = useState(() =>
    typeof window === 'undefined' ? 260 : Math.round(Math.min(Math.max(window.innerHeight * 0.38, 200), 320)));

  // Seleção + compartilhar
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [shareModal, setShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sharePreviewRef = useRef<HTMLDivElement>(null);

  // Modais
  const [saleModal, setSaleModal] = useState<{ open: boolean; editing: DBSale | null }>({ open: false, editing: null });
  const [expModal, setExpModal] = useState<{ open: boolean; editing: DBExpense | null }>({ open: false, editing: null });
  const [actionSheet, setActionSheet] = useState<{ type: 'sale' | 'expense'; id: string } | null>(null);
  const [viewModal, setViewModal] = useState<
    { type: 'sale'; item: DBSale } | { type: 'expense'; item: DBExpense } | null
  >(null);

  // Formulário de venda
  const [selProduct, setSelProduct] = useState<DBProduct | null>(null);
  const [saleDesc, setSaleDesc] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [selPlatform, setSelPlatform] = useState('');

  // Formulário de gasto
  const [expDesc, setExpDesc] = useState('');
  const [expValue, setExpValue] = useState('');

  // ── cálculos ──
  const totalSales = sales.reduce((s, d) => s + d.total_centavos, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.valor_centavos, 0);
  const netTotal = totalSales - totalExpenses;

  const parsedPrice = parseCents(priceInput);
  const parsedQty = parseInt(qtyInput) || 0;
  const parsedDiscount = hasDiscount ? parseCents(discountInput) : 0;
  const parsedCost = parseCents(costInput);
  const formTotal = Math.max(0, parsedPrice * parsedQty - parsedDiscount);
  const canRegister = parsedPrice > 0 && parsedQty > 0;

  const parsedExpValue = parseCents(expValue);
  const canRegisterExp = parsedExpValue > 0;

  const listData: ListEntry[] = useMemo(() => [
    ...sales.map(item => ({ kind: 'sale' as const, item })),
    ...expenses.map(item => ({ kind: 'expense' as const, item })),
  ].sort((a, b) => b.item.timestamp - a.item.timestamp), [sales, expenses]);

  const selectedEntries = useMemo(
    () => listData.filter(e => selected.has(`${e.kind}:${e.item.id}`)),
    [listData, selected]);

  // ── seleção ──
  function enterSelectMode(key: string) {
    setSelectMode(true);
    setSelected(new Set([key]));
  }
  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) setSelectMode(false);
      } else next.add(key);
      return next;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function doCapture() {
    if (!sharePreviewRef.current) return;
    setSharing(true);
    try {
      await shareNodeAsImage(sharePreviewRef.current, `stokai-${Date.now()}.jpg`, () => setShareModal(false));
    } catch {
      await dialog.alert('Erro', 'Não foi possível gerar a imagem.');
    } finally {
      setSharing(false);
    }
  }

  // ── venda ──
  function resetSaleForm() {
    setSelProduct(null); setSaleDesc(''); setPriceInput(''); setQtyInput('');
    setCostInput(''); setHasDiscount(false); setDiscountInput(''); setSelPlatform('');
  }
  function openCreateSale() {
    resetSaleForm();
    setSaleModal({ open: true, editing: null });
  }
  function openEditSale(sale: DBSale) {
    setSelProduct(null);
    setSaleDesc(sale.descricao);
    setPriceInput(centsToInput(sale.preco_centavos));
    setQtyInput(String(sale.quantidade));
    setCostInput(sale.custo_centavos > 0 ? centsToInput(sale.custo_centavos) : '');
    setHasDiscount(sale.desconto_centavos > 0);
    setDiscountInput(sale.desconto_centavos > 0 ? centsToInput(sale.desconto_centavos) : '');
    setSelPlatform(sale.plataforma);
    setActionSheet(null);
    setSaleModal({ open: true, editing: sale });
  }
  function closeSaleModal() {
    resetSaleForm();
    setSaleModal({ open: false, editing: null });
  }
  function selectProduct(p: DBProduct) {
    if (selProduct?.id === p.id) {
      setSelProduct(null); setPriceInput(''); setCostInput('');
    } else {
      setSelProduct(p); setPriceInput(p.preco); setCostInput(p.custo);
    }
  }
  function handleSaveSale() {
    if (!canRegister) return;
    if (saleModal.editing) {
      // Ajusta o estoque pela diferença de quantidade quando a venda está ligada a um produto
      const pid = saleModal.editing.product_id;
      if (pid) {
        const delta = saleModal.editing.quantidade - parsedQty;
        if (delta !== 0) data.adjustProductQuantity(pid, delta);
      }
      data.updateSale({
        ...saleModal.editing,
        descricao: saleDesc.trim() || 'Venda',
        preco_centavos: parsedPrice,
        quantidade: parsedQty,
        desconto_centavos: parsedDiscount,
        total_centavos: formTotal,
        custo_centavos: parsedCost,
        plataforma: selPlatform,
      });
    } else {
      const productId = selProduct?.id ?? '';
      data.insertSale({
        id: newId(),
        product_id: productId,
        descricao: selProduct?.nome || saleDesc.trim() || 'Venda',
        preco_centavos: parsedPrice,
        quantidade: parsedQty,
        desconto_centavos: parsedDiscount,
        total_centavos: formTotal,
        custo_centavos: parsedCost,
        plataforma: selPlatform,
        day: todayDay,
        month: thisMonth,
        year: thisYear,
        timestamp: Date.now(),
      });
      if (productId) data.adjustProductQuantity(productId, -parsedQty);
    }
    closeSaleModal();
  }

  // ── gasto ──
  function openCreateExpense() {
    setExpDesc(''); setExpValue('');
    setExpModal({ open: true, editing: null });
  }
  function openEditExpense(exp: DBExpense) {
    setExpDesc(exp.descricao);
    setExpValue(centsToInput(exp.valor_centavos));
    setActionSheet(null);
    setExpModal({ open: true, editing: exp });
  }
  function closeExpModal() {
    setExpDesc(''); setExpValue('');
    setExpModal({ open: false, editing: null });
  }
  function handleSaveExpense() {
    if (!canRegisterExp) return;
    if (expModal.editing) {
      data.updateExpense({ ...expModal.editing, descricao: expDesc.trim() || 'Gasto', valor_centavos: parsedExpValue });
    } else {
      data.insertExpense({
        id: newId(),
        descricao: expDesc.trim() || 'Gasto',
        valor_centavos: parsedExpValue,
        day: todayDay,
        month: thisMonth,
        year: thisYear,
        timestamp: Date.now(),
      });
    }
    closeExpModal();
  }

  // ── menu de ações ──
  function handleActionView() {
    if (!actionSheet) return;
    if (actionSheet.type === 'sale') {
      const sale = sales.find(s => s.id === actionSheet.id);
      if (sale) setViewModal({ type: 'sale', item: sale });
    } else {
      const exp = expenses.find(e => e.id === actionSheet.id);
      if (exp) setViewModal({ type: 'expense', item: exp });
    }
    setActionSheet(null);
  }
  function handleActionEdit() {
    if (!actionSheet) return;
    if (actionSheet.type === 'sale') {
      const sale = sales.find(s => s.id === actionSheet.id);
      if (sale) openEditSale(sale);
    } else {
      const exp = expenses.find(e => e.id === actionSheet.id);
      if (exp) openEditExpense(exp);
    }
  }
  async function handleActionDelete() {
    if (!actionSheet) return;
    const { type, id } = actionSheet;
    const ok = await dialog.confirm({
      title: 'Confirmar exclusão',
      message: type === 'sale'
        ? 'Deseja excluir esta venda? Esta ação não pode ser desfeita.'
        : 'Deseja excluir este gasto? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    if (type === 'sale') {
      const sale = sales.find(s => s.id === id);
      if (sale?.product_id) data.adjustProductQuantity(sale.product_id, sale.quantidade);
      data.deleteSale(id);
    } else {
      data.deleteExpense(id);
    }
    setActionSheet(null);
  }

  const viewPlatform = viewModal?.type === 'sale' ? PLATFORMS.find(p => p.key === viewModal.item.plataforma) : undefined;

  return (
    <div className={`page ${selectMode ? 'with-selbar' : ''}`}>
      <header className="page-header home-header">
        <div>
          <div className="header-sub">Faturamento{orgName ? <> · <span className="header-org">{orgName}</span></> : null}</div>
          <h1 className="header-title">{monthLabel}</h1>
        </div>
        <div className="header-right">
          <div className="right-align">
            <div className="total-label">Resultado do mês</div>
            <div className={`total-value ${netTotal < 0 ? 'neg' : ''}`}>{fullCurrency(netTotal)}</div>
          </div>
          <button
            className="chart-toggle" onClick={() => setShowChart(v => !v)}
            aria-label={showChart ? 'Esconder gráfico' : 'Mostrar gráfico'}
          >
            {showChart ? <IoEyeOffOutline size={18} /> : <IoEyeOutline size={18} />}
          </button>
        </div>
      </header>

      {showChart && <div className="px"><RevenueChart data={chartData} height={chartH} /></div>}

      <div className="divider" />

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Vendas do mês</div>
          <div className="stat-value">{fullCurrency(totalSales)}</div>
        </div>
        <div className="stat-card expense">
          <div className="stat-label">Gastos do mês</div>
          <div className="stat-value neg">{totalExpenses > 0 ? `-${fullCurrency(totalExpenses)}` : fullCurrency(0)}</div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn-sale" onClick={openCreateSale}>
          <IoAddCircleOutline size={18} /> Registrar Venda
        </button>
        <button className="btn-expense" onClick={openCreateExpense}>
          <IoRemoveCircleOutline size={18} /> Registrar Gasto
        </button>
      </div>

      <div className="section-title">
        Movimentações de {MONTHS[thisMonth - 1]}{listData.length > 0 ? ` · ${listData.length}` : ''}
      </div>

      {listData.length === 0 ? (
        <div className="empty-inline">
          <IoReceiptOutline size={40} />
          <div>Nenhuma movimentação registrada este mês</div>
        </div>
      ) : (
        <>
          {!selectMode && <div className="hint">Toque e segure (ou clique com o botão direito) para selecionar e compartilhar</div>}
          {listData.map(entry => {
            const key = `${entry.kind}:${entry.item.id}`;
            return (
              <EntryCard
                key={key}
                entry={entry}
                selectMode={selectMode}
                selected={selected.has(key)}
                onMenu={() => setActionSheet({ type: entry.kind, id: entry.item.id })}
                onLongPress={() => enterSelectMode(key)}
                onSelect={() => toggleSelect(key)}
              />
            );
          })}
        </>
      )}

      {/* Barra de seleção */}
      {selectMode && (
        <div className="sel-bar">
          <button className="sel-cancel" onClick={exitSelectMode} aria-label="Cancelar seleção"><IoClose size={20} /></button>
          <div className="sel-count">
            {selected.size} {selected.size === 1 ? 'item selecionado' : 'itens selecionados'}
          </div>
          <button className="sel-share" onClick={() => setShareModal(true)}>
            <IoShareOutline size={18} /> Compartilhar
          </button>
        </div>
      )}

      {/* Venda */}
      <Sheet
        open={saleModal.open}
        onClose={closeSaleModal}
        title={saleModal.editing ? 'Editar Venda' : 'Registrar Venda'}
        footer={
          <button className="confirm-btn" disabled={!canRegister} onClick={handleSaveSale}>
            {saleModal.editing ? 'Salvar alterações' : 'Confirmar venda'}
          </button>
        }
      >
        {!saleModal.editing && products.length > 0 && (
          <>
            <div className="field-label">Produto do estoque (opcional)</div>
            <div className="chips">
              {products.map(p => (
                <button
                  key={p.id}
                  className={`chip ${selProduct?.id === p.id ? 'on' : ''}`}
                  onClick={() => selectProduct(p)}
                >
                  {p.nome || 'Sem nome'}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="field">
          <span className="field-label">Descrição {saleModal.editing ? '' : '(opcional)'}</span>
          <input
            className="input" value={saleDesc} onChange={e => setSaleDesc(e.target.value)}
            placeholder={selProduct ? selProduct.nome : 'Ex: camiseta preta, 2 canecas…'}
          />
        </label>

        <div className="row">
          <label className="field">
            <span className="field-label">Preço unit. (R$) *</span>
            <input className="input" value={priceInput} onChange={e => setPriceInput(e.target.value)} placeholder="0,00" inputMode="decimal" />
          </label>
          <label className="field">
            <span className="field-label">Quantidade *</span>
            <input className="input" value={qtyInput} onChange={e => setQtyInput(e.target.value)} placeholder="1" inputMode="numeric" />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Custo unit. (R$) (opcional)</span>
          <input
            className="input" value={costInput} onChange={e => setCostInput(e.target.value)}
            placeholder="Se vazio, usa o custo do estoque" inputMode="decimal"
          />
        </label>

        <button
          className="check-row"
          onClick={() => {
            setHasDiscount(v => !v);
            if (hasDiscount) setDiscountInput('');
          }}
        >
          <span className={`checkbox ${hasDiscount ? 'on' : ''}`}>{hasDiscount && <IoCheckmark size={13} />}</span>
          Aplicar desconto
        </button>

        {hasDiscount && (
          <label className="field" style={{ marginTop: 10 }}>
            <span className="field-label">Valor do desconto (R$)</span>
            <input className="input" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder="0,00" inputMode="decimal" />
          </label>
        )}

        <div className="field-label" style={{ marginTop: 14 }}>Plataforma (opcional)</div>
        <div className="platform-row">
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              className={`platform-btn ${selPlatform === p.key ? 'on' : ''}`}
              onClick={() => setSelPlatform(v => (v === p.key ? '' : p.key))}
            >
              <p.icon size={22} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {formTotal > 0 && (
          <div className="preview">
            <span className="preview-label">Total da venda</span>
            <span className="preview-value">{fullCurrency(formTotal)}</span>
          </div>
        )}
      </Sheet>

      {/* Gasto */}
      <Sheet
        open={expModal.open}
        onClose={closeExpModal}
        variant="expense"
        title={expModal.editing ? 'Editar Gasto' : 'Registrar Gasto'}
        footer={
          <button className="confirm-btn expense" disabled={!canRegisterExp} onClick={handleSaveExpense}>
            {expModal.editing ? 'Salvar alterações' : 'Confirmar gasto'}
          </button>
        }
      >
        <label className="field">
          <span className="field-label">Descrição (opcional)</span>
          <input className="input" value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Ex: Fornecedor, frete, embalagem…" />
        </label>
        <label className="field">
          <span className="field-label">Valor (R$) *</span>
          <input className="input" value={expValue} onChange={e => setExpValue(e.target.value)} placeholder="0,00" inputMode="decimal" />
        </label>
        {parsedExpValue > 0 && (
          <div className="preview expense">
            <span className="preview-label">Valor do gasto</span>
            <span className="preview-value neg">-{fullCurrency(parsedExpValue)}</span>
          </div>
        )}
      </Sheet>

      {/* Menu ⋮ */}
      <ActionSheet
        open={actionSheet !== null}
        onClose={() => setActionSheet(null)}
        title={actionSheet?.type === 'sale' ? 'Opções da Venda' : 'Opções do Gasto'}
        actions={[
          { icon: IoEyeOutline, label: 'Ver detalhes', onClick: handleActionView },
          { icon: IoPencilOutline, label: 'Editar', onClick: handleActionEdit },
          { icon: IoTrashOutline, label: 'Excluir', onClick: handleActionDelete, tone: 'danger' },
        ]}
      />

      {/* Detalhes */}
      <Sheet
        open={viewModal !== null}
        onClose={() => setViewModal(null)}
        title={viewModal?.type === 'sale' ? 'Detalhes da Venda' : 'Detalhes do Gasto'}
      >
        {viewModal?.type === 'sale' && (
          <>
            <DetailRow label="Descrição" value={viewModal.item.descricao || 'Venda'} />
            <DetailRow label="Data" value={`Dia ${viewModal.item.day} · ${MONTHS[thisMonth - 1]} ${thisYear}`} />
            <DetailRow label="Preço/un" value={fullCurrency(viewModal.item.preco_centavos)} />
            <DetailRow label="Quantidade" value={String(viewModal.item.quantidade)} />
            {viewModal.item.custo_centavos > 0 && <DetailRow label="Custo/un" value={fullCurrency(viewModal.item.custo_centavos)} />}
            {viewModal.item.desconto_centavos > 0 && (
              <DetailRow label="Desconto" value={`-${fullCurrency(viewModal.item.desconto_centavos)}`} color={colors.expense} />
            )}
            <DetailRow label="Total" value={fullCurrency(viewModal.item.total_centavos)} color={accent} />
            {viewPlatform && <DetailRow label="Plataforma" value={viewPlatform.label} />}
          </>
        )}
        {viewModal?.type === 'expense' && (
          <>
            <DetailRow label="Descrição" value={viewModal.item.descricao || 'Gasto'} />
            <DetailRow label="Data" value={`Dia ${viewModal.item.day} · ${MONTHS[thisMonth - 1]} ${thisYear}`} />
            <DetailRow label="Valor" value={fullCurrency(viewModal.item.valor_centavos)} color={colors.expense} />
          </>
        )}
        <div style={{ height: 16 }} />
      </Sheet>

      {/* Prévia de compartilhamento */}
      {shareModal && (
        <div className="share-overlay" role="dialog" aria-modal="true">
          <div className="backdrop dark" onClick={() => setShareModal(false)} />
          <div className="share-card">
            <div ref={sharePreviewRef}>
              <SharePreview entries={selectedEntries} accent={accent} monthLabel={monthLabel} />
            </div>
            <div className="share-actions">
              <button className="share-btn muted" onClick={() => setShareModal(false)}>Cancelar</button>
              <button className="share-btn primary" onClick={doCapture} disabled={sharing}>
                <IoShareOutline size={18} /> Compartilhar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
