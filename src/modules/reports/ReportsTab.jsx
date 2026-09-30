import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {  Card, T, ModuleHeader , normProduct, getProductBaseRate, getProductDays } from '@/lms-common';
import { FileText, PieChart, BarChart2, Activity, Users, Shield, TrendingUp, AlertOctagon, ChevronDown } from 'lucide-react';
import BusinessStatement from './BusinessStatement';
import CustomerStatement from './CustomerStatement';
import CollectionsReport from './CollectionsReport';
import DisbursementsReport from './DisbursementsReport';
import PortfolioReport from './PortfolioReport';
import PARReport from './PARReport';
import RevenueReport from './RevenueReport';
import ProfitLossReport from './ProfitLossReport';
import RevenueProfitability from './RevenueProfitability';
import CBKReport from './CBKReport';
import PortfolioAnalytics from './PortfolioAnalytics';

export default function ReportsTab({ loans, customers, payments, currentUser, userRole, auditLog, workers }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeReport, setActiveReport] = useState(() => searchParams.get('sub') || 'business-statement');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const [productFilter, setProductFilter] = useState('All');

  const filteredLoans = React.useMemo(() => {
    if (productFilter === 'All') return loans;
    return loans.filter(l => normProduct(l.product) === normProduct(productFilter));
  }, [loans, productFilter]);

  const filteredPayments = React.useMemo(() => {
    if (productFilter === 'All') return payments;
    const loanMap = {};
    loans.forEach(l => { loanMap[l.id] = (l.product || 'Swift30'); });
    return payments.filter(p => !p.loanId || normProduct(loanMap[p.loanId]) === normProduct(productFilter));
  }, [payments, loans, productFilter]);

  useEffect(() => {
    const sub = searchParams.get('sub');
    if (sub && sub !== activeReport) setActiveReport(sub);
  }, [searchParams]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSetReport = (id) => {
    setActiveReport(id);
    setSearchParams({ tab: 'reports', sub: id }, { replace: true });
    setMenuOpen(false);
  };

  const reportMenu = [
    {
      group: 'Financial Statements',
      items: [
        { id: 'business-statement', label: 'Business Statement', icon: FileText },
        { id: 'customer-statements', label: 'Customer Statements', icon: Users },
      ]
    },
    {
      group: 'Financial Reports',
      items: [
        { id: 'revenue-profitability', label: 'Revenue & Profitability', icon: TrendingUp },
        { id: 'collections', label: 'Collections', icon: Activity },
        { id: 'disbursements', label: 'Disbursements', icon: TrendingUp },
        { id: 'revenue', label: 'Revenue (Detailed)', icon: BarChart2 },
        { id: 'profit-loss', label: 'Profit & Loss (Detailed)', icon: PieChart },
      ]
    },
    {
      group: 'Portfolio Reports',
      items: [
        { id: 'portfolio-analytics', label: 'Portfolio Analytics (V1)', icon: PieChart },
        { id: 'portfolio', label: 'Portfolio Summary', icon: Shield },
        { id: 'par', label: 'PAR / Aging', icon: AlertOctagon },
        { id: 'cbk-regulatory', label: 'CBK Regulatory Report', icon: FileText },
      ]
    }
  ];

  const allItems = reportMenu.flatMap(g => g.items);
  const activeLabel = allItems.find(i => i.id === activeReport)?.label || 'Select Report';

  const renderContent = () => {
    if (activeReport === 'business-statement')   return <BusinessStatement loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'customer-statements')  return <CustomerStatement loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'revenue-profitability')return <div style={{maxWidth: 1000, margin: '0 auto'}}><RevenueProfitability loans={filteredLoans} customers={customers} payments={filteredPayments} /></div>;
    if (activeReport === 'collections')          return <CollectionsReport payments={filteredPayments} customers={customers} />;
    if (activeReport === 'disbursements')        return <DisbursementsReport loans={filteredLoans} customers={customers} />;
    if (activeReport === 'revenue')              return <RevenueReport loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'profit-loss')          return <ProfitLossReport loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'portfolio-analytics')  return <PortfolioAnalytics loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'portfolio')            return <PortfolioReport loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'par')                  return <PARReport loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    if (activeReport === 'cbk-regulatory')       return <CBKReport loans={filteredLoans} customers={customers} payments={filteredPayments} />;
    return (
      <Card style={{ padding: 60, textAlign: 'center', color: T.muted }}>
        <FileText size={40} style={{ margin: '0 auto 15px', opacity: 0.3 }} />
        <div style={{ fontWeight: 600, fontSize: 16 }}>{allItems.find(i => i.id === activeReport)?.label} Module</div>
        <div style={{ fontSize: 13, marginTop: 5 }}>This reporting module is currently under development.</div>
      </Card>
    );
  };

  const renderProductFilter = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
      {['All', 'Swift30', 'Swift15', 'Flex60', 'FlexSure'].map(p => (
        <button
          key={p}
          onClick={() => setProductFilter(p)}
          style={{
            padding: '5px 14px',
            borderRadius: 20,
            border: productFilter === p ? '2px solid var(--accent)' : '2px solid var(--border)',
            background: productFilter === p ? 'var(--a-lo)' : 'transparent',
            color: productFilter === p ? 'var(--accent)' : 'var(--muted)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          {p !== 'All' && (
            <img 
              src={`/${p.toLowerCase()}.png`} 
              alt={p} 
              style={{ height: 16, objectFit: 'contain' }} 
              onError={e => { e.target.style.display = 'none'; }} 
            />
          )}
          {p === 'All' ? 'All Products' : p}
        </button>
      ))}
    </div>
  );

  // ── MOBILE LAYOUT ───────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className='fu' style={{ paddingBottom: 80 }}>
        <ModuleHeader
          title="Reports & Statements"
          sub="Financial ledgers and management reporting"
          icon={FileText}
        />
        {renderProductFilter()}

        {/* Dropdown selector */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              background: T.card, border: `1px solid ${T.border}`,
              fontWeight: 600, fontSize: 14, color: T.txt
            }}
          >
            <span>{activeLabel}</span>
            <ChevronDown
              size={16}
              color={T.dim}
              style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </div>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
              marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden'
            }}>
              {reportMenu.map((group, idx) => (
                <div key={idx}>
                  <div style={{
                    padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                    color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5,
                    background: T.bg2
                  }}>
                    {group.group}
                  </div>
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeReport === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSetReport(item.id)}
                        style={{
                          padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10,
                          cursor: 'pointer', fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? T.accent : T.txt,
                          background: isActive ? T.accent + '15' : 'transparent',
                        }}
                      >
                        <Icon size={14} color={isActive ? T.accent : T.dim} />
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content — full width */}
        <div style={{ minWidth: 0 }}>
          {renderContent()}
        </div>
      </div>
    );
  }

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────
  return (
    <div className='fu' style={{ paddingBottom: 60 }}>
      <ModuleHeader
        title="Reports & Statements"
        sub="Financial ledgers and management reporting based on strict transaction data"
        icon={FileText}
      />
      {renderProductFilter()}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 15 }}>
          {reportMenu.map((group, idx) => (
            <Card key={idx} style={{ padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 8 }}>
                {group.group}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeReport === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSetReport(item.id)}
                      style={{
                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? T.accent : T.txt,
                        background: isActive ? T.accent + '15' : 'transparent',
                        transition: 'background 0.2s', fontSize: 13
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg2; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Icon size={14} color={isActive ? T.accent : T.dim} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
