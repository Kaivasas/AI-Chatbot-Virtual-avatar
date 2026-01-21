"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utill/supabase/client';
import * as PIXI from 'pixi.js';
import { Ticker } from '@pixi/ticker';
import type { Cubism4InternalModel, Live2DModel } from 'pixi-live2d-display';
import { Mic, SendHorizontal } from 'lucide-react';
import { useAudioLipSync } from '@/utill/audio';

export default function Home() {
  const router = useRouter();
  const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || 'http://localhost:5500';
  const audio = useAudioLipSync();

  const [status, setStatus] = useState('สถานะ: กำลังโหลด...');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [isSending, setIsSending] = useState(false);
  type ChatMessage = { role: 'user' | 'assistant'; text: string; ts: number };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState<string>('');
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const formatTimeTH = (ms: number) => {
    const s = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
    return s.replace(':', '.') + ' น.';
  };
  const [showResetModal, setShowResetModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  // Refs สำหรับ Chat History
  const messagesRef = useRef<ChatMessage[]>([]);

  // Refs สำหรับ ชื่อผู้ใช้งาน
  const profileNameRef = useRef<string>('');
  const asrBufferRef = useRef<string>('');
  const isPressingRef = useRef<boolean>(false);

  
  // คอมเมนต์: ตัดตัวแปรสถานะท่าทางระหว่างพูดออกเพื่อความเรียบง่าย

  

  const startNewConversation = () => {
    setMessages([]);
  };

  const openResetModal = () => {
    setDeleteConfirmText('');
    setResetError(null);
    setShowResetModal(true);
  };

  const confirmResetAll = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setResetLoading(true);
    setResetError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) throw new Error('ต้องเข้าสู่ระบบ');
      await supabase.from('messages').delete().eq('user_id', user.id);
      startNewConversation();
      setShowResetModal(false);
    } catch (e: any) {
      setResetError(e?.message || 'ลบประวัติไม่สำเร็จ');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSummarizeMemory = async () => {
    try {
      setStatus('สถานะ: กำลังสรุปความทรงจำ... 🧠');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch(`${CHAT_API_URL}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });

      const data = await res.json();
      console.log(data); // ดูผลลัพธ์ใน Console
      setStatus('สถานะ: สรุปความทรงจำเสร็จสิ้น! ✅');

      // หน่วงเวลาแป๊บหนึ่งแล้วคืนสถานะพร้อม
      setTimeout(() => setStatus('สถานะ: พร้อม'), 3000);
    } catch (error) {
      console.error(error);
      setStatus('❌ เกิดข้อผิดพลาดในการสรุป');
    }
  };

  const loadUserMessages = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const res = await supabase
      .from('messages')
      .select('role,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (res.error) return;
    const rows = (res.data as any) || [];
    setMessages(rows.map((r: any) => ({ role: r.role, text: r.content, ts: new Date(r.created_at).getTime() })));
  };

  const loadProfile = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const res = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (res.error) return;
    const dn = (res.data as any)?.display_name || '';
    setProfileDisplayName(dn);
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    profileNameRef.current = profileDisplayName;
  }, [profileDisplayName]);

  

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      await loadUserMessages();
      await loadProfile();
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          loadUserMessages();
          loadProfile();
        }
      });
      unsub = () => sub.subscription?.unsubscribe();
    };
    init();
    return () => {
      try { unsub && unsub(); } catch { }
    };
  }, []);

  

  

  

  

  // ฟังก์ชันเริ่มท่าทางพูด (สุ่มหนึ่งท่าจาก TapBody)
  const startTalkingMotion = () => {
    try {
      const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
      const mm: any = model?.internalModel?.motionManager;
      if (!model || !mm) return;
      // TapBody group ใน Haru.model3.json มี 4 ท่า เลือกสุ่มหนึ่งท่า
      const idx = Math.floor(Math.random() * 4);
      if (typeof mm.startMotion === 'function') {
        // priority 2 (ถ้ามี) เพื่อให้แสดงระหว่าง idle
        try { mm.startMotion('TapBody', idx, 2); } catch { mm.startMotion('TapBody', idx); }
      }
    } catch { }
  };

  // ฟังก์ชันหยุดท่าทางพูด และปล่อยให้ idle ทำงานต่อ
  const stopTalkingMotion = () => {
    try {
      const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
      const mm: any = model?.internalModel?.motionManager;
      if (!model || !mm) return;
      if (typeof mm.stopAllMotions === 'function') {
        mm.stopAllMotions();
      } else if (typeof mm.stopAll === 'function') {
        mm.stopAll();
      }
      // ปล่อยให้ idle ทำงานเองตามค่าใน model
      try { if (mm.setIdleMotionEnabled) mm.setIdleMotionEnabled(true); } catch { }
    } catch { }
  };

  // ... (ส่วน useEffect, loadLive2D, SpeechRecognition เหมือนเดิมทุกประการ) ...
  useEffect(() => {
    // ... (ส่วนของ SpeechRecognition และ loadLive2D เหมือนเดิมทุกประการ) ...

    // Initialize SpeechRecognition
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setStatus('❌ ขออภัยค่ะ เบราว์เซอร์ของคุณไม่รองรับ Web Speech API');
    } else {
      recognitionRef.current = new SpeechRecognitionClass();
      recognitionRef.current.lang = 'th-TH';
      recognitionRef.current.interimResults = true;
      recognitionRef.current.continuous = true;

      recognitionRef.current.onresult = (event) => {
        try {
          const start = (event as any).resultIndex || 0;
          for (let i = start; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              const transcript = res[0].transcript;
              asrBufferRef.current = (asrBufferRef.current ? asrBufferRef.current + ' ' : '') + (transcript || '').trim();
            }
          }
        } catch {}
      };

      recognitionRef.current.onend = async () => {
        if (isPressingRef.current) {
          try { recognitionRef.current?.start(); } catch {}
          return;
        }
        setIsRecognizing(false);
        const t = asrBufferRef.current.trim();
        asrBufferRef.current = '';
        if (t) {
          audio.ensureAudioContext();
          setMessages((prev) => [...prev, { role: 'user', text: t, ts: Date.now() }]);
          await sendTextToBackend(t);
        } else {
          setStatus((prev) => (prev === 'สถานะ: กำลังฟัง... 👂' ? 'สถานะ: พร้อม' : prev));
        }
      };

      recognitionRef.current.onerror = (event) => {
        const err = (event as any).error;
        if (isPressingRef.current && err === 'no-speech') {
          try { recognitionRef.current?.start(); } catch {}
          return;
        }
        setStatus(`❌ ข้อผิดพลาด: ${err}`);
        setIsRecognizing(false);
        asrBufferRef.current = '';
      };
    }

    // Load Live2D
    const loadLive2D = async () => {
      const loadCubismScript = () => {
        return new Promise((resolve, reject) => {
          if (document.querySelector('script[src*="live2dcubismcore.min.js"]')) {
            resolve(true);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/live2dcubismcore@latest/live2dcubismcore.min.js';
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load Cubism 4 core'));
          document.body.appendChild(script);
        });
      };

      try {
        await loadCubismScript();
        const { Live2DModel } = await import('pixi-live2d-display/cubism4');

        if (typeof window !== 'undefined') {
          (window as any).PIXI = PIXI;
        }

        Live2DModel.registerTicker(Ticker);

        if (!canvasRef.current) return;

        const app = new PIXI.Application({
          view: canvasRef.current,
          width: 520,
          height: 780,
          transparent: true,
        });
        appRef.current = app;

        const model = await Live2DModel.from('/Haru/Haru.model3.json');
        app.stage.addChild(model as unknown as PIXI.DisplayObject);
        model.scale.set(0.33);
        const cx = app.renderer.width * 0.5;
        const mw = model.width;
        model.x = Math.round(cx - mw * 0.5);
        model.y = 60;
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRect(0, 0, app.renderer.width, app.renderer.height);
        mask.endFill();
        app.stage.addChild(mask);
        (model as any).mask = mask;

        (window as any).live2dModel = model;

        model.autoInteract = false;
        app.stage.interactive = true;
        app.stage.interactiveChildren = false;
        app.stage.hitArea = new PIXI.Rectangle(0, 0, app.renderer.width, app.renderer.height);
        app.stage.on('pointerdown', (event) => {
          const point = event.data.global;
          model.focus(point.x, point.y);
        });

        if (recognitionRef.current) {
          setStatus('สถานะ: พร้อม');
        }

      } catch (error) {
        console.error('Error loading Live2D:', error);
        setStatus('❌ โหลด Avatar ไม่สำเร็จ');
      }
    };

    loadLive2D();

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      audio.bufferSourceRef.current?.stop();
      appRef.current?.destroy(true, { children: true });
      audio.audioContextRef.current?.close();
    };
  }, []);


  

  // ⚠️ [แก้ไขทั้งหมด] ฟังก์ชัน sendTextToBackend
  const sendTextToBackend = async (text: string, opts?: { fromASR?: boolean }) => {

    setStatus('สถานะ: กำลังรอ AI (Streaming)...');
    audio.audioQueueRef.current = [];
    if (audio.bufferSourceRef.current) audio.bufferSourceRef.current.stop();

    try {
      const currentMessages = messagesRef.current;
      const chatHistory = currentMessages.slice(-5).map(m => ({ role: m.role, content: m.text }));
      const currentName = profileNameRef.current || 'ผู้ใช้งาน';
      const { data: { user } } = await supabase.auth.getUser();

      const response = await fetch(`${CHAT_API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          history: chatHistory,
          user_name: currentName,
          user_id: user?.id
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        buffer += chunkStr;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.error) return;

            // A. เก็บสะสมข้อความ
            if (data.text) {
              accumulatedText += data.text;
              
              // 🔥 [แก้ตรงนี้] อัปเดตข้อความบนหน้าจอ "ทันที" แบบ Real-time
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                
                // กรณี 1: ถ้าข้อความล่าสุดเป็นของ AI อยู่แล้ว -> ให้อัปเดตเนื้อหาเดิม (ไม่สร้างใหม่)
                if (lastMsg && lastMsg.role === 'assistant') {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = {
                        ...lastMsg,
                        text: accumulatedText // แทนที่ด้วยข้อความที่ยาวขึ้นเรื่อยๆ
                    };
                    return newMessages;
                } 
                // กรณี 2: ถ้าเพิ่งเริ่มตอบ (ข้อความล่าสุดยังเป็น User) -> สร้างกล่องใหม่
                else {
                    return [
                        ...prev, 
                        { role: 'assistant', text: accumulatedText, ts: Date.now() }
                    ];
                }
              });
            }

            // B. เสียงเล่นทันทีเหมือนเดิม
            if (data.audio) {
              audio.audioQueueRef.current.push(data.audio);
              setStatus('สถานะ: Alice กำลังพูด... 🔊');
              audio.processAudioQueue(appRef.current || undefined);
            }
          } catch (e) {
            console.error("JSON Parse Error (ข้าม):", e);
          }
        }
      }

      setStatus('สถานะ: พร้อม');

    } catch (error) {
      console.error('Error:', error);
      setStatus('สถานะ: Error เชื่อมต่อไม่ได้');
    }
  };

  // ฟังก์ชันเล่นเสียงต่อเนื่อง (Queue Processor)
  

  const handleMicPressStart = () => {
    audio.ensureAudioContext();
    asrBufferRef.current = '';
    isPressingRef.current = true;
    try {
      recognitionRef.current?.start();
      setIsRecognizing(true);
      setStatus('สถานะ: กำลังฟัง... 👂');
    } catch {
      setStatus('สถานะ: พร้อม');
    }
  };

  const handleMicPressEnd = () => {
    isPressingRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
  };


  // ... (ส่วน getButtonProps และ return เหมือนเดิม) ...
  const micDisabled = !recognitionRef.current || status.includes('กำลังโหลด') || isSending;

  const handleSubmitTypedText = async () => {
    if (isSending || status.includes('กำลังรอ AI')) return;
    const text = typedText.trim();
    if (!text) return;
    setIsSending(true);
    setTypedText('');
    audio.ensureAudioContext();
    setMessages((prev) => [...prev, { role: 'user', text, ts: Date.now() }]);
    await sendTextToBackend(text);
    setIsSending(false);
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch { }
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { }
    router.replace('/login');
  };

  // ออโต้สโครลไปท้ายรายการเมื่อมีข้อความใหม่ (ถ้าผู้ใช้ยังอยู่ท้าย)
  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100vh', boxSizing: 'border-box', background: '#2a2a2a', padding: 0 }}>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <button onClick={handleLogout} style={{ position: 'absolute', top: 10, left: 20, background: '#ff6b6b', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>Logout</button>
        <button onClick={openResetModal} style={{ position: 'absolute', top: 58, left: 20, background: '#2f2f2f', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>เริ่มบทสนทนาใหม่</button>
        <button onClick={handleSummarizeMemory} style={{ position: 'absolute', top: 106, left: 20, background: '#4a90e2', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
          สรุปความทรงจำ 🧠
        </button>
        <canvas ref={canvasRef} width={520} height={780} />
      </div>

      <div style={{ width: 480, height: 'min(800px, 92vh)', borderRadius: 36, border: '14px solid #2f2f2f', background: '#cf8f8f', position: 'relative', boxShadow: '0 16px 40px rgba(0,0,0,0.25)', marginRight: 64 }}>

        <div
          ref={chatListRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
          }}
          style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 96, overflowY: 'auto', padding: '8px', borderRadius: 12 }}
        >
          {messages.map((m, idx) => (
            <div
              key={m.ts + '-' + idx}
              style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 8, marginBottom: '12px' }}
            >
              {m.role === 'user' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '78%' }}>
                  <div style={{ fontSize: 12, color: '#111', fontWeight: 600, marginBottom: 4 }}>{profileDisplayName || 'ผู้ใช้'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, color: '#222', opacity: 0.7 }}>{formatTimeTH(m.ts)}</div>
                    <div style={{ maxWidth: '100%', padding: '10px 12px', borderRadius: 8, background: '#cfeaf7', color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>{m.text}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '78%' }}>
                  <div style={{ fontSize: 12, color: '#111', fontWeight: 700, marginBottom: 4 }}>อลิส</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ maxWidth: '100%', padding: '10px 12px', borderRadius: 8, background: '#f1f1f1', border: '1px solid #e0e0e0', color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>{m.text}</div>
                    <div style={{ fontSize: 11, color: '#222', opacity: 0.7 }}>{formatTimeTH(m.ts)}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ position: 'absolute', bottom: 20, left: 20, right: 160, background: '#e0a8a8', borderRadius: 24, display: 'flex', alignItems: 'center', padding: '0 14px', height: 50, zIndex: 2 }}>
          <input
            type="text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!isSending && !status.includes('กำลังรอ AI')) handleSubmitTypedText(); } }}
            placeholder="พิมพ์ข้อความ..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 6px', color: '#111' }}
          />
        </div>
        <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', alignItems: 'center', gap: 14, zIndex: 50 }}>
          <button onPointerDown={handleMicPressStart} onPointerUp={handleMicPressEnd} onPointerLeave={handleMicPressEnd} disabled={micDisabled} style={{ width: 52, height: 52, background: isRecognizing ? '#808080' : '#2f2f2f', borderRadius: 999, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: micDisabled ? 'not-allowed' : 'pointer', opacity: micDisabled ? 0.6 : 1, boxShadow: '0 6px 14px rgba(0,0,0,0.25)' }} aria-label="กดค้างเพื่อพูด">
            <Mic size={28} strokeWidth={2} color="#fff" />
          </button>
          <button onClick={handleSubmitTypedText} disabled={!typedText.trim() || status.includes('กำลังรอ AI') || isSending} style={{ width: 52, height: 52, background: '#2f2f2f', borderRadius: 999, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !typedText.trim() || status.includes('กำลังรอ AI') || isSending ? 'not-allowed' : 'pointer', opacity: !typedText.trim() || status.includes('กำลังรอ AI') || isSending ? 0.6 : 1, boxShadow: '0 6px 14px rgba(0,0,0,0.25)' }} aria-label="ส่งข้อความ">
            <SendHorizontal size={28} strokeWidth={2} color="#fff" />
          </button>
        </div>

        {showResetModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ width: 520, maxWidth: '92%', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 12px 36px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>ลบประวัติการแชททั้งหมด</div>
              <div style={{ color: '#555', marginBottom: 14, textAlign: 'center' }}>พิมพ์คำว่า DELETE เพื่อยืนยันการลบ</div>
              <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="พิมพ์ DELETE" style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', margin: '0 8px 14px 8px', fontSize: 14, boxSizing: 'border-box' }} />
              {resetError && <div style={{ color: '#c0392b', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{resetError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setShowResetModal(false)} disabled={resetLoading} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', color: '#333', cursor: 'pointer' }}>ยกเลิก</button>
                <button onClick={confirmResetAll} disabled={deleteConfirmText !== 'DELETE' || resetLoading} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: deleteConfirmText === 'DELETE' && !resetLoading ? '#e74c3c' : '#f5b7b1', color: '#fff', cursor: deleteConfirmText === 'DELETE' && !resetLoading ? 'pointer' : 'not-allowed' }}>{resetLoading ? 'กำลังลบ...' : 'ยืนยันลบ'}</button>
              </div>
            </div>
          </div>
        )}
      </div>



    </div>
  );
}