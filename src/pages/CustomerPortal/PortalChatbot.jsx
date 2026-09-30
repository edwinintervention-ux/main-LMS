import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/config/supabaseClient';
import {  calculateLoanStatus , normProduct, getProductBaseRate, getProductDays } from '@/lms-common';
import { MessageCircle, X, Mic, Send, Bot, Loader2 } from 'lucide-react';

export default function PortalChatbot({ dashboardData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi there! I am your AI assistant. I can speak English or Kiswahili. How can I help you with your account today? (Habari! Ninaweza kuzungumza Kiingereza au Kiswahili. Naweza kukusaidia vipi leo?)' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'sw-KE'; // Defaults to Swahili/English mix for Kenyan context
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Microphone access failed", e);
      }
    }
  };

  const handleSend = async (text = input) => {
    if (!text.trim()) return;
    
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Build rich loan details with calculated figures
      let totalOwed = 0;
      let nextDueDate = null;
      let daysLeft = null;

      const loanDetails = dashboardData.loans.map(loan => {
        const paid = dashboardData.payments
          .filter(p => p.loan_id === loan.id)
          .reduce((s, p) => s + (p.amount || 0), 0);
        const engine = calculateLoanStatus(loan, null, paid);
        const dueDate = loan.disbursed
          ? new Date(new Date(loan.disbursed).getTime() + getProductDays(loan.product) * 86400000)
          : null;
        if (engine.totalAmountDue > 0) {
          totalOwed += engine.totalAmountDue;
          if (dueDate && (!nextDueDate || dueDate < nextDueDate)) nextDueDate = dueDate;
        }
        return {
          ref: loan.loan_no || loan.id?.slice(0, 8),
          principal: engine.principal ?? loan.amount,
          interest: engine.interestDue ?? 0,
          penalty: engine.penaltyDue ?? engine.penalty ?? 0,
          totalDue: engine.totalAmountDue ?? 0,
          totalPaid: paid,
          status: loan.status,
          disbursed: loan.disbursed ? new Date(loan.disbursed).toDateString() : 'N/A',
          dueDate: dueDate ? dueDate.toDateString() : 'N/A',
        };
      });

      if (nextDueDate) {
        daysLeft = Math.ceil((nextDueDate.getTime() - Date.now()) / 86400000);
      }

      const ctx = {
        name: dashboardData.customer.name,
        phone: dashboardData.customer.phone,
        totalOwed,
        nextDueDate: nextDueDate ? nextDueDate.toDateString() : null,
        daysLeft,
        loanDetails,
        payments: [...dashboardData.payments]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 8)
          .map(p => ({
            amount: p.amount,
            date: p.date ? new Date(p.date).toDateString() : 'N/A',
            method: p.method || 'M-Pesa',
          })),
        paybill: '4166191',
        account: dashboardData.customer.id_no || dashboardData.customer.id
      };

      const validHistory = messages
        .filter(m => m.content && !m.content.includes("having trouble connecting") && !m.content.includes("jaribu tena"))
        .slice(-6);

      const { data, error } = await supabase.functions.invoke('portal-chat', {
        body: { 
          message: text,
          history: validHistory, 
          customerContext: ctx
        }
      });

      if (error) throw error;
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I am having trouble connecting right now. Tafadhali jaribu tena baadaye." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
          background: 'linear-gradient(135deg, #00E599, #00b377)', color: '#fff', border: 'none',
          boxShadow: '0 8px 24px rgba(0, 229, 153, 0.4)', display: isOpen ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 9999, transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <MessageCircle size={28} />
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: 360, maxWidth: 'calc(100vw - 48px)',
          height: 500, maxHeight: 'calc(100vh - 48px)', background: 'var(--card-bg, #0d1321)',
          backdropFilter: 'blur(28px)', border: '1px solid var(--card-border, rgba(255,255,255,0.08))',
          borderRadius: 20, display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          zIndex: 9999, overflow: 'hidden', animation: 'slideUp 0.3s ease-out'
        }}>
          <div style={{
            padding: '16px 20px', background: 'linear-gradient(to right, rgba(0, 229, 153, 0.1), transparent)',
            borderBottom: '1px solid var(--card-border, rgba(255,255,255,0.08))', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0, 229, 153, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E599' }}>
                <Bot size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Adequate Assistant</h3>
                <span style={{ fontSize: 11, color: '#00E599', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: '#00E599', display: 'inline-block' }}></span>
                  Online
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg, i) => {
              const isBot = msg.role === 'assistant';
              return (
                <div key={i} style={{ display: 'flex', gap: 12, alignSelf: isBot ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                  {isBot && (
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(0, 229, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E599', flexShrink: 0 }}>
                      <Bot size={14} />
                    </div>
                  )}
                  <div style={{
                    background: isBot ? 'rgba(255,255,255,0.05)' : '#00E599',
                    color: isBot ? '#F8FAFC' : '#050811', padding: '12px 16px',
                    borderRadius: isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px', fontSize: 14, lineHeight: 1.5
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            
            {isTyping && (
              <div style={{ display: 'flex', gap: 12, alignSelf: 'flex-start', maxWidth: '85%' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(0, 229, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E599' }}>
                  <Loader2 size={14} className="cp-spin" />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '4px 16px 16px 16px', color: '#94A3B8', fontSize: 14 }}>
                  typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid var(--card-border, rgba(255,255,255,0.08))', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={toggleListen}
                style={{
                  background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid', borderColor: isListening ? '#EF4444' : 'transparent',
                  color: isListening ? '#EF4444' : '#94A3B8', width: 44, height: 44,
                  borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s'
                }}
                title={isListening ? "Stop listening" : "Speak to type"}
              >
                <Mic size={20} />
              </button>
              
              <input 
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? "Listening..." : "Type a message..."}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border, rgba(255,255,255,0.08))',
                  borderRadius: 12, padding: '0 16px', color: '#fff', fontSize: 14, outline: 'none'
                }}
              />
              
              <button 
                onClick={() => handleSend()}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? '#00E599' : 'rgba(255,255,255,0.05)',
                  color: input.trim() ? '#050811' : '#64748B', border: 'none',
                  width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'not-allowed',
                  flexShrink: 0, transition: 'all 0.2s'
                }}
              >
                <Send size={18} style={{ marginLeft: 2 }} />
              </button>
            </div>
            
            {messages.length === 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                <button onClick={() => handleSend('What is my current balance?')} style={quickBtnStyle}>My Balance</button>
                <button onClick={() => handleSend('How do I repay my loan?')} style={quickBtnStyle}>How to Repay</button>
                <button onClick={() => handleSend('Nidai kiasi gani?')} style={quickBtnStyle}>Deni langu</button>
              </div>
            )}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cp-spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

const quickBtnStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#cbd5e1',
  borderRadius: 100,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};
