import React, { useState, useMemo } from 'react';
import { Send, Users, Activity, Settings, MessageSquare, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { T, Card, Btn, Badge, FI, useToast, calculateLoanStatus, fmt, getProductDays } from "@/lms-common";

export default function CommunicationsTab({ customers = [], loans = [] }) {
  const [tab, setTab] = useState('bulk');
  const [audience, setAudience] = useState('all');
  const [messageTemplate, setMessageTemplate] = useState('Dear {name}, your loan balance of KES {balance} is due on {due_date}.');

  const handleAudienceChange = (val) => {
    setAudience(val);
    if (val === 'overdue') {
      setMessageTemplate('Dear {name}, your loan of KES {balance} is OVERDUE since {due_date}. Please make payment immediately to avoid further penalties. Adequate Capital.');
    } else if (val === 'active') {
      setMessageTemplate('Dear {name}, your loan balance of KES {balance} is due on {due_date}.');
    } else {
      setMessageTemplate('Dear {name}, your loan balance of KES {balance} is due on {due_date}.');
    }
  };
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const { show: showToast } = useToast();

  const activeLoans = useMemo(() => loans.filter(l => l.status === 'Active' || l.status === 'Overdue'), [loans]);
  const overdueLoans = useMemo(() => loans.filter(l => l.status === 'Overdue'), [loans]);

  // Derived audience lists
  const targetAudience = useMemo(() => {
    if (audience === 'active') {
      const activeCustIds = new Set(activeLoans.map(l => l.customerId || l.customer_id));
      return customers.filter(c => activeCustIds.has(c.id));
    }
    if (audience === 'overdue') {
      const overdueCustIds = new Set(overdueLoans.map(l => l.customerId || l.customer_id));
      return customers.filter(c => overdueCustIds.has(c.id));
    }
    return customers; // 'all'
  }, [audience, customers, activeLoans, overdueLoans]);

  const generatePreview = (customer) => {
    if (!customer) return '';
    let msg = messageTemplate;
    msg = msg.replace(/{name}/g, customer.name.split(' ')[0] || '');
    msg = msg.replace(/{full_name}/g, customer.name || '');
    
    // Find relevant loan if audience is active or overdue
    const relLoans = loans.filter(l => (l.customerId === customer.id || l.customer_id === customer.id) && (l.status === 'Active' || l.status === 'Overdue'));
    const primaryLoan = relLoans.length > 0 ? relLoans[0] : null;
    
    if (primaryLoan) {
      const statusObj = calculateLoanStatus(primaryLoan);
      msg = msg.replace(/{balance}/g, fmt(statusObj.totalAmountDue));
      
      // Use the mapped dueDate if available, otherwise compute it via UTC arithmetic from disbursed date
      let finalDueDate = primaryLoan.dueDate;
      if (!finalDueDate && (primaryLoan.disbursed || primaryLoan.createdAt)) {
        const dbs = primaryLoan.disbursed || primaryLoan.createdAt;
        const _disbParts = dbs.toString().split('T')[0].split('-');
        const dDate = new Date(Date.UTC(+_disbParts[0], +_disbParts[1]-1, +_disbParts[2]));
        const pdays = getProductDays(primaryLoan.product);
        dDate.setUTCDate(dDate.getUTCDate() + pdays);
        finalDueDate = new Date(dDate.getTime() - dDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      }
      
      msg = msg.replace(/{due_date}/g, finalDueDate ? new Date(finalDueDate).toLocaleDateString('en-GB') : 'N/A');
    } else {
      msg = msg.replace(/{balance}/g, '0');
      msg = msg.replace(/{due_date}/g, 'N/A');
    }
    return msg;
  };

  const handleSendBulk = async () => {
    if (!messageTemplate.trim()) return showToast('Please enter a message', 'danger');
    if (targetAudience.length === 0) return showToast('No customers in this audience', 'danger');
    
    if (!confirm(`Are you sure you want to send this SMS to ${targetAudience.length} customers?`)) return;

    setSending(true);
    setProgress({ current: 0, total: targetAudience.length });
    
    try {
      const { supabase } = await import('@/config/supabaseClient');
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < targetAudience.length; i++) {
        const cust = targetAudience[i];
        const personalizedMsg = generatePreview(cust);
        
        try {
          const { data, error } = await supabase.functions.invoke('send-sms', {
            body: { msisdn: cust.phone.trim(), message: personalizedMsg }
          });
          
          if (error || !data?.success) throw new Error('Send failed');
          
          await supabase.from('sms_logs').insert([{
            phone: cust.phone.trim(),
            message: personalizedMsg,
            customer_id: cust.id,
            source: 'Bulk Campaign',
            status_code: 200,
            response_body: data,
            sender_id: 'Admin'
          }]);
          successCount++;
        } catch (e) {
          console.error('Failed for', cust.phone, e);
          failCount++;
        }
        
        setProgress({ current: i + 1, total: targetAudience.length });
        // Tiny delay to not spam the edge function too hard
        await new Promise(r => setTimeout(r, 100));
      }

      showToast(`Campaign finished. Sent: ${successCount}, Failed: ${failCount}`, 'ok');
    } catch (err) {
      showToast('Campaign failed: ' + err.message, 'danger');
    } finally {
      setSending(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  // Birthdays today
  const todaysBirthdays = useMemo(() => {
    const today = new Date();
    const d = today.getDate();
    const m = today.getMonth();
    return customers.filter(c => {
      if (!c.dob) return false;
      const bDate = new Date(c.dob);
      return bDate.getDate() === d && bDate.getMonth() === m;
    });
  }, [customers]);

  const [bdayTemplate, setBdayTemplate] = useState('Happy Birthday, {name}! We wish you a wonderful day and a successful year ahead. From all of us at Adequate Capital.');
  const [bdaySending, setBdaySending] = useState(false);

  const handleSendBirthdays = async () => {
    if (todaysBirthdays.length === 0) return showToast('No birthdays today', 'warn');
    if (!confirm(`Send birthday SMS to ${todaysBirthdays.length} customer(s)?`)) return;
    
    setBdaySending(true);
    try {
      const { supabase } = await import('@/config/supabaseClient');
      let successCount = 0;
      for (const cust of todaysBirthdays) {
        let msg = bdayTemplate.replace(/{name}/g, cust.name.split(' ')[0] || '');
        msg = msg.replace(/{full_name}/g, cust.name || '');
        
        const { data, error } = await supabase.functions.invoke('send-sms', {
          body: { msisdn: cust.phone.trim(), message: msg }
        });
        
        if (!error && data?.success) {
          await supabase.from('sms_logs').insert([{
            phone: cust.phone.trim(),
            message: msg,
            customer_id: cust.id,
            source: 'Birthday Automation',
            status_code: 200,
            response_body: data,
            sender_id: 'Admin'
          }]);
          successCount++;
        }
      }
      showToast(`Sent ${successCount} birthday messages!`, 'ok');
    } catch (err) {
      showToast('Failed to send birthdays: ' + err.message, 'danger');
    } finally {
      setBdaySending(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto', fontFamily: T.body }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.txt, fontFamily: T.head, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageSquare size={24} color={T.accent} />
            Communications & Campaigns
          </div>
          <div style={{ fontSize: 14, color: T.dim, marginTop: 4 }}>Send bulk SMS blasts and manage automated messaging.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 16 }}>
        <Btn v={tab === 'bulk' ? 'primary' : 'secondary'} onClick={() => setTab('bulk')} icon={Users}>Bulk Campaigns</Btn>
        <Btn v={tab === 'automations' ? 'primary' : 'secondary'} onClick={() => setTab('automations')} icon={Settings}>Automations</Btn>
      </div>

      {tab === 'bulk' && (
        <Card title="New Bulk SMS Campaign" icon={Send} padded>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontWeight: 600, color: T.txt, marginBottom: 12, fontSize: 14 }}>1. Select Audience</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: 12, border: `1px solid ${audience === 'all' ? T.accent : T.border}`, borderRadius: 8, background: audience === 'all' ? T.aLo : T.card2 }}>
                  <input type="radio" checked={audience === 'all'} onChange={() => handleAudienceChange('all')} />
                  <div>
                    <div style={{ fontWeight: 600, color: T.txt }}>All Registered Customers</div>
                    <div style={{ fontSize: 12, color: T.dim }}>Send to everyone in the database ({customers.length})</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: 12, border: `1px solid ${audience === 'active' ? T.accent : T.border}`, borderRadius: 8, background: audience === 'active' ? T.aLo : T.card2 }}>
                  <input type="radio" checked={audience === 'active'} onChange={() => handleAudienceChange('active')} />
                  <div>
                    <div style={{ fontWeight: 600, color: T.txt }}>Active Borrowers</div>
                    <div style={{ fontSize: 12, color: T.dim }}>Customers with an ongoing loan</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: 12, border: `1px solid ${audience === 'overdue' ? T.accent : T.border}`, borderRadius: 8, background: audience === 'overdue' ? T.aLo : T.card2 }}>
                  <input type="radio" checked={audience === 'overdue'} onChange={() => handleAudienceChange('overdue')} />
                  <div>
                    <div style={{ fontWeight: 600, color: T.txt }}>Overdue Borrowers</div>
                    <div style={{ fontSize: 12, color: T.dim }}>Customers who have fallen behind</div>
                  </div>
                </label>
              </div>

              <div style={{ fontWeight: 600, color: T.txt, marginBottom: 12, fontSize: 14 }}>2. Compose Message</div>
              <FI 
                type="textarea" 
                value={messageTemplate} 
                onChange={setMessageTemplate} 
                placeholder="Type your message here..." 
                style={{ height: 120 }}
              />
              <div style={{ fontSize: 12, color: T.dim, marginTop: 8 }}>
                Available tags: <Badge>{"{name}"}</Badge> <Badge>{"{full_name}"}</Badge> <Badge>{"{balance}"}</Badge> <Badge>{"{due_date}"}</Badge>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: T.txt, marginBottom: 12, fontSize: 14 }}>Campaign Summary</div>
              <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: T.dim, fontSize: 13 }}>Total Recipients:</span>
                  <span style={{ fontWeight: 700, color: T.txt }}>{targetAudience.length} customers</span>
                </div>
                
                <div style={{ color: T.dim, fontSize: 13, marginBottom: 8 }}>Message Preview (for {targetAudience[0]?.name || 'Example Customer'}):</div>
                <div style={{ background: T.bg, padding: 12, borderRadius: 8, fontSize: 14, color: T.txt, border: `1px solid ${T.border}`, fontStyle: 'italic', minHeight: 80 }}>
                  {targetAudience.length > 0 ? generatePreview(targetAudience[0]) : 'No audience selected.'}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 11, color: T.dim }}>
                  ~ {Math.ceil(generatePreview(targetAudience[0]).length / 160)} SMS segment(s) per person
                </div>
              </div>

              {sending && (
                <div style={{ marginTop: 20, padding: 16, background: T.aLo, borderRadius: 12, border: `1px solid ${T.accent}` }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: `2px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Sending Messages...
                  </div>
                  <div style={{ height: 6, background: T.card, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: T.accent, width: `${(progress.current / Math.max(1, progress.total)) * 100}%`, transition: 'width 0.2s' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: T.accent, marginTop: 4, fontWeight: 600 }}>
                    {progress.current} / {progress.total}
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              {!sending && (
                <div style={{ marginTop: 24 }}>
                  <Btn onClick={handleSendBulk} full icon={Send} disabled={targetAudience.length === 0 || !messageTemplate.trim()}>
                    Launch Campaign
                  </Btn>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {tab === 'automations' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <Card title="Birthday SMS Auto-Responder" icon={Clock} padded>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ fontSize: 14, color: T.dim, marginBottom: 16, lineHeight: 1.5 }}>
                  Delight your customers with a personalized message on their birthday. 
                  Currently, {todaysBirthdays.length} customer(s) have a birthday today.
                </div>
                
                <FI 
                  label="Birthday Message Template"
                  type="textarea"
                  value={bdayTemplate}
                  onChange={setBdayTemplate}
                  style={{ height: 100 }}
                />
                <div style={{ fontSize: 12, color: T.dim, marginTop: -8 }}>
                  Tags: <Badge>{"{name}"}</Badge> <Badge>{"{full_name}"}</Badge>
                </div>
              </div>
              
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: T.card2, border: `1px solid ${T.success}40`, padding: 16, borderRadius: 12 }}>
                  <div style={{ fontWeight: 600, color: T.success, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={16} />
                    Full Automation Active
                  </div>
                  <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>
                    The background database cron job is running. Birthday messages will be sent automatically at 8:00 AM every day. You can still trigger them manually below if needed.
                  </div>
                </div>

                <div style={{ background: T.card2, border: `1px solid ${T.border}`, padding: 16, borderRadius: 12, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.txt, marginBottom: 12 }}>Today's Birthdays: <Badge v="primary">{todaysBirthdays.length}</Badge></div>
                  <div style={{ maxHeight: 100, overflowY: 'auto', marginBottom: 16 }}>
                    {todaysBirthdays.length === 0 ? (
                      <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>No birthdays today.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {todaysBirthdays.map(c => (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span style={{ color: T.txt }}>{c.name}</span>
                            <span style={{ color: T.dim }}>{c.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Btn 
                    onClick={handleSendBirthdays} 
                    disabled={todaysBirthdays.length === 0 || bdaySending} 
                    full 
                    icon={CheckCircle}
                  >
                    {bdaySending ? 'Sending...' : "Send Today's Birthdays"}
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
