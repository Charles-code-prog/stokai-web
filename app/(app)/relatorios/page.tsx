'use client';

import { useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { IoBarChartOutline, IoChevronForward, IoInformationCircleOutline } from 'react-icons/io5';
import { useData } from '@/lib/data';
import { MONTHS, PLATFORMS, fullCurrency, parseCents } from '@/lib/format';
import { WARN } from '@/lib/theme';
import type { DBProduct, DBSale } from '@/lib/types';
import { EmptyState, PageHeader, Sheet } from '@/components/ui';

type Period = 'month' | 'year' | 'all';

interface ProductStat {
  id: string; name: string; qtySold: number; revenue: number; totalCost: number; profit: number; hasKnownCost: boolean;
}
interface PlatformStat { key: string; label: string; icon: IconType; revenue: number; count: number }
interface MonthStat { key: string; month: number; year: number; revenue: number; cost: number; profit: number; count: number }
interface StockItem {
  id: string; name: string; qty: number; pricePerUnit: number; costPerUnit: number; profitPerUnit: number; totalProfit: number;
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function buildProductStats(sales: DBSale[], products: DBProduct[]): ProductStat[] {
  const map = new Map<string, ProductStat>();
  for (const sale of sales) {
    const key = sale.product_id || `__desc__${sale.descricao}`;
    const product = sale.product_id ? products.find(p => p.id === sale.product_id) : undefined;
    // Custo informado na venda tem prioridade sobre o custo cadastrado no produto
    const costCents = sale.custo_centavos > 0 ? sale.custo_centavos : product?.custo ? parseCents(product.custo) : 0;
    const hasKnownCost = costCents > 0;
    if (!map.has(key)) {
      map.set(key, {
        id: key, name: product?.nome || sale.descricao || 'Venda avulsa',
        qtySold: 0, revenue: 0, totalCost: 0, profit: 0, hasKnownCost,
      });
    }
    const stat = map.get(key)!;
    stat.qtySold += sale.quantidade;
    stat.revenue += sale.total_centavos;
    stat.totalCost += costCents * sale.quantidade;
    stat.profit = stat.revenue - stat.totalCost;
    if (hasKnownCost) stat.hasKnownCost = true;
  }
  return Array.from(map.values()).sort((a, b) => b.qtySold - a.qtySold);
}

function buildPlatformStats(sales: DBSale[]): PlatformStat[] {
  const map = new Map<string, PlatformStat>();
  for (const sale of sales) {
    const key = sale.plataforma || 'outro';
    const platform = PLATFORMS.find(p => p.key === key) ?? PLATFORMS[4];
    if (!map.has(key)) map.set(key, { key, label: platform.label, icon: platform.icon, revenue: 0, count: 0 });
    const stat = map.get(key)!;
    stat.revenue += sale.total_centavos;
    stat.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function buildMonthStats(sales: DBSale[], products: DBProduct[]): MonthStat[] {
  const groups = new Map<string, DBSale[]>();
  for (const sale of sales) {
    const key = `${sale.year}-${sale.month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sale);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const revenue = list.reduce((sum, x) => sum + x.total_centavos, 0);
      const cost = buildProductStats(list, products).reduce((sum, p) => sum + p.totalCost, 0);
      return { key, month: list[0].month, year: list[0].year, revenue, cost, profit: revenue - cost, count: list.length };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

function buildStockPotential(products: DBProduct[]): StockItem[] {
  return products
    .map(p => {
      const qty = parseInt(p.quantidade) || 0;
      const pricePerUnit = parseCents(p.preco);
      const costPerUnit = parseCents(p.custo);
      const profitPerUnit = pricePerUnit - costPerUnit;
      return { id: p.id, name: p.nome || 'Produto sem nome', qty, pricePerUnit, costPerUnit, profitPerUnit, totalProfit: profitPerUnit * qty };
    })
    .filter(item => item.qty > 0)
    .sort((a, b) => b.totalProfit - a.totalProfit);
}

function SectionCard({
  title, subtitle, children, onClick, hint,
}: { title: string; subtitle?: string; children: React.ReactNode; onClick?: () => void; hint?: string }) {
  const content = (
    <>
      <div className="rcard-header">
        <span className="rcard-title">{title}</span>
        {subtitle ? <span className="rcard-subtitle">{subtitle}</span> : null}
      </div>
      {children}
      {hint ? <div className="rcard-hint">{hint}</div> : null}
    </>
  );
  return onClick
    ? <button className="rcard clickable" onClick={onClick}>{content}</button>
    : <section className="rcard">{content}</section>;
}

function InfoRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value" style={{ color, fontWeight: bold ? 700 : undefined }}>{value}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="note-row">
      <IoInformationCircleOutline size={13} color={WARN} />
      <span>{children}</span>
    </div>
  );
}

export default function ReportsPage() {
  const { colors, accent, sales: allSales, products } = useData();

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();

  const [period, setPeriod] = useState<Period>('month');
  const [selMonth, setSelMonth] = useState<{ month: number; year: number } | null>(null);
  const [detailModal, setDetailModal] = useState<{ title: string; stats: ProductStat[] } | null>(null);

  const monthStats = useMemo(() => buildMonthStats(allSales, products), [allSales, products]);

  const sales = allSales.filter(sale => {
    if (period === 'month') return sale.month === thisMonth && sale.year === thisYear;
    if (period === 'year') return sale.year === thisYear;
    if (selMonth) return sale.month === selMonth.month && sale.year === selMonth.year;
    return true;
  });

  const periodLabel =
    period === 'month' ? MONTHS[thisMonth - 1]
    : period === 'year' ? String(thisYear)
    : selMonth ? `${MONTHS[selMonth.month - 1]} ${selMonth.year}`
    : 'Todos os períodos';

  const productStats = buildProductStats(sales, products);
  const platformStats = buildPlatformStats(sales);
  const stockItems = buildStockPotential(products);

  const topSold = productStats.slice(0, 3);
  const bottomSold = productStats.length > 1 ? [...productStats].reverse().slice(0, 3) : [];

  const totalRevenue = sales.reduce((sum, x) => sum + x.total_centavos, 0);
  const totalCost = productStats.reduce((sum, p) => sum + p.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const hasUnknownCost = productStats.some(p => !p.hasKnownCost);

  const maxPlatformRevenue = platformStats.reduce((m, p) => Math.max(m, p.revenue), 1);
  const totalStockProfit = stockItems.reduce((sum, i) => sum + i.totalProfit, 0);

  return (
    <div className="page">
      <PageHeader sub="Análise" title="Relatórios" />

      <div className="period-row">
        {(['month', 'year', 'all'] as Period[]).map(p => (
          <button
            key={p}
            className={`period-chip ${period === p ? 'on' : ''}`}
            onClick={() => { setPeriod(p); setSelMonth(null); }}
          >
            {p === 'month' ? 'Este mês' : p === 'year' ? 'Este ano' : 'Geral'}
          </button>
        ))}
      </div>

      {period === 'all' && monthStats.length > 0 && (
        <div className="month-row">
          <button className={`month-chip ${selMonth === null ? 'on' : ''}`} onClick={() => setSelMonth(null)}>Todos</button>
          {monthStats.map(m => {
            const active = selMonth?.month === m.month && selMonth?.year === m.year;
            return (
              <button key={m.key} className={`month-chip ${active ? 'on' : ''}`} onClick={() => setSelMonth({ month: m.month, year: m.year })}>
                {MONTHS[m.month - 1].slice(0, 3)}/{String(m.year).slice(2)}
              </button>
            );
          })}
        </div>
      )}

      {sales.length === 0 ? (
        <EmptyState icon={IoBarChartOutline} title="Sem dados para análise" sub={`Registre vendas para ver os relatórios de ${periodLabel}.`} />
      ) : (
        <>
          <SectionCard title="Margem de Produto" subtitle={periodLabel}>
            <div className="profit-headline">{fullCurrency(totalProfit)}</div>
            <div className="progress-bg">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.max(0, Math.min(marginPct, 100)).toFixed(1)}%`,
                  background: marginPct < 0 ? colors.expense : undefined,
                }}
              />
            </div>
            <div className="progress-label">
              {marginPct >= 0
                ? `${marginPct.toFixed(1)}% de margem sobre o faturamento`
                : `${Math.abs(marginPct).toFixed(1)}% de prejuízo sobre o faturamento`}
            </div>
            <div className="rdivider" />
            <div className="two-col">
              <div><div className="col-label">Faturamento bruto</div><div className="col-value big accent">{fullCurrency(totalRevenue)}</div></div>
              <div><div className="col-label">Custo dos produtos</div><div className="col-value big neg">{fullCurrency(totalCost)}</div></div>
            </div>
            {hasUnknownCost && <Note>Algumas vendas não têm custo cadastrado e foram consideradas como R$ 0,00.</Note>}
          </SectionCard>

          {period === 'all' && selMonth === null && (
            <SectionCard title="Resumo Mensal" subtitle="Toque em um mês para ver os detalhes">
              {monthStats.map((m, i) => (
                <button key={m.key} className={`list-row ${i > 0 ? 'bordered' : ''}`} onClick={() => setSelMonth({ month: m.month, year: m.year })}>
                  <div className="grow">
                    <div className="stock-name">{MONTHS[m.month - 1]} {m.year}</div>
                    <div className="stock-meta">{m.count} venda{m.count !== 1 ? 's' : ''} · faturamento {fullCurrency(m.revenue)}</div>
                  </div>
                  <span className={`stock-profit ${m.profit < 0 ? 'neg' : ''}`}>{fullCurrency(m.profit)}</span>
                  <IoChevronForward size={16} className="muted" />
                </button>
              ))}
            </SectionCard>
          )}

          {topSold.length > 0 && (
            <SectionCard
              title="Mais Vendidos"
              subtitle={`Top ${topSold.length} · ${periodLabel}`}
              onClick={() => setDetailModal({ title: 'Mais Vendidos', stats: topSold })}
              hint="Toque para ver lucro e detalhes"
            >
              {topSold.map((stat, i) => <RankRow key={stat.id} stat={stat} i={i} />)}
            </SectionCard>
          )}

          {bottomSold.length > 0 && (
            <SectionCard
              title="Menos Vendidos"
              subtitle={`Bottom ${bottomSold.length} · ${periodLabel}`}
              onClick={() => setDetailModal({ title: 'Menos Vendidos', stats: bottomSold })}
              hint="Toque para ver lucro e detalhes"
            >
              {bottomSold.map((stat, i) => <RankRow key={stat.id} stat={stat} i={i} dim />)}
            </SectionCard>
          )}

          {platformStats.length > 0 && (
            <SectionCard title="Plataformas" subtitle={periodLabel}>
              {platformStats.map((p, i) => (
                <div key={p.key} className={`platform-stat ${i > 0 ? 'bordered' : ''}`}>
                  <div className="platform-icon"><p.icon size={16} /></div>
                  <div className="grow">
                    <div className="platform-top">
                      <span className="platform-name">{p.label}</span>
                      <span className="platform-pct">{pct(p.revenue, totalRevenue)} · {p.count} venda{p.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="bar-bg"><div className="bar-fill" style={{ width: `${((p.revenue / maxPlatformRevenue) * 100).toFixed(1)}%` }} /></div>
                  </div>
                  <span className="platform-revenue">{fullCurrency(p.revenue)}</span>
                </div>
              ))}
            </SectionCard>
          )}
        </>
      )}

      {/* Potencial do estoque — sempre visível */}
      <SectionCard title="Potencial do Estoque" subtitle="Se vender tudo">
        {stockItems.length > 0 ? (
          <>
            <div className="profit-headline">{fullCurrency(totalStockProfit)}</div>
            <div className="stock-subline">
              lucro possível com {stockItems.length} produto{stockItems.length !== 1 ? 's' : ''} em estoque
            </div>
            <div className="rdivider" />
            {stockItems.map((item, i) => (
              <div key={item.id} className={`list-row static ${i > 0 ? 'bordered' : ''}`}>
                <div className="grow">
                  <div className="stock-name">{item.name}</div>
                  <div className="stock-meta">
                    {item.qty} un · venda {fullCurrency(item.pricePerUnit)}/un
                    {item.costPerUnit > 0 ? ` · custo ${fullCurrency(item.costPerUnit)}/un` : ''}
                  </div>
                </div>
                <span className={`stock-profit ${item.totalProfit < 0 ? 'neg' : ''}`}>{fullCurrency(item.totalProfit)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="card-empty">Nenhum produto em estoque no momento.</div>
        )}
      </SectionCard>

      <Sheet open={detailModal !== null} onClose={() => setDetailModal(null)} title={detailModal?.title} subtitle={periodLabel}>
        {detailModal?.stats.map((stat, i) => (
          <div key={stat.id} className={`detail-block ${i > 0 ? 'bordered' : ''}`}>
            <div className="detail-title-row">
              <div className="rank-badge">{i + 1}</div>
              <div className="detail-name">{stat.name}</div>
            </div>
            <InfoRow label="Qtd vendida" value={`${stat.qtySold} unidades`} />
            <InfoRow label="Faturamento" value={fullCurrency(stat.revenue)} color={accent} />
            {stat.hasKnownCost ? (
              <>
                <InfoRow label="Custo total" value={fullCurrency(stat.totalCost)} color={colors.expense} />
                <InfoRow label="Lucro total" value={fullCurrency(stat.profit)} color={stat.profit >= 0 ? accent : colors.expense} bold />
                <InfoRow
                  label="Margem de produto"
                  value={stat.revenue > 0 ? `${((stat.profit / stat.revenue) * 100).toFixed(1)}%` : '—'}
                  color={stat.profit >= 0 ? accent : colors.expense}
                />
              </>
            ) : (
              <Note>Custo não cadastrado — lucro não calculado.</Note>
            )}
          </div>
        ))}
        <div style={{ height: 8 }} />
      </Sheet>
    </div>
  );
}

function RankRow({ stat, i, dim }: { stat: ProductStat; i: number; dim?: boolean }) {
  return (
    <div className={`rank-row ${i > 0 ? 'bordered' : ''}`}>
      <div className={`rank-badge ${dim ? 'dim' : ''}`}>{i + 1}</div>
      <span className="rank-name">{stat.name}</span>
      <div className="rank-right">
        <div className="rank-qty">{stat.qtySold} un</div>
        <div className="rank-revenue">{fullCurrency(stat.revenue)}</div>
      </div>
    </div>
  );
}
