
import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, VideoSet } from './types';
import YouTubeInput from './components/YouTubeInput';
import FlashcardItem from './components/FlashcardItem';
import { extractVocabFromVideo } from './services/geminiService';

const App: React.FC = () => {
  // 1. 延遲初始化：從 localStorage 讀取初始狀態，避免重新整理時被空陣列蓋掉
  const [videoSets, setVideoSets] = useState<VideoSet[]>(() => {
    const saved = localStorage.getItem('vocab_master_sets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved sets", e);
        return [];
      }
    }
    return [];
  });

  const [currentKey, setCurrentKey] = useState<string>(() => {
    return localStorage.getItem('VOCAB_MASTER_API_KEY') || '';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<'home' | 'setDetail' | 'learning' | 'summary'>('home');
  
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  // 全域注入金鑰的輔助函式
  const setApiKeyIntoGlobal = (key: string) => {
    if (!key) return;
    if (!(window as any).process) (window as any).process = { env: {} };
    if (!(window as any).process.env) (window as any).process.env = {};
    (window as any).process.env.API_KEY = key;
  };

  // 初始化處理
  useEffect(() => {
    if (currentKey) {
      setApiKeyIntoGlobal(currentKey);
    }
    setIsInitializing(false);
  }, [currentKey]);

  // 當 videoSets 變動時，自動儲存到 localStorage
  useEffect(() => {
    localStorage.setItem('vocab_master_sets', JSON.stringify(videoSets));
  }, [videoSets]);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = apiKeyInput.trim();
    if (cleanKey.length > 10) {
      setCurrentKey(cleanKey);
      localStorage.setItem('VOCAB_MASTER_API_KEY', cleanKey);
      setApiKeyIntoGlobal(cleanKey);
      setShowKeyConfig(false);
      setApiKeyInput('');
    } else {
      alert("請貼上正確且完整的 API Key");
    }
  };

  const handleProcessVideo = async (url: string) => {
    if (!currentKey) {
      setShowKeyConfig(true);
      return;
    }
    setApiKeyIntoGlobal(currentKey);
    
    setIsLoading(true);
    try {
      const { transcript, cards, detectedTitle, sources } = await extractVocabFromVideo(url);
      const newSet: VideoSet = {
        id: `set-${Date.now()}`,
        url,
        title: detectedTitle || `影片學習集 - ${new Date().toLocaleDateString()}`,
        transcript,
        cards,
        sources,
        createdAt: Date.now()
      };
      setVideoSets(prev => [newSet, ...prev]);
      setCurrentSetId(newSet.id);
      setView('setDetail');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateCardStatus = (setId: string, cardId: string, status: 'learning' | 'learned') => {
    setVideoSets(prev => prev.map(set => {
      if (set.id === setId) {
        return {
          ...set,
          cards: set.cards.map(card => card.id === cardId ? { ...card, status } : card)
        };
      }
      return set;
    }));
  };

  const handleSwipe = (status: 'learning' | 'learned') => {
    if (!currentSetId) return;
    const currentCard = activeCards[currentIndex];
    if (!currentCard) return;
    updateCardStatus(currentSetId, currentCard.id, status);
    if (currentIndex < activeCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setView('summary');
    }
  };

  const startLearning = (setId: string, mode: 'all' | 'learning') => {
    const targetSet = videoSets.find(s => s.id === setId);
    if (!targetSet) return;
    let cardsToReview = targetSet.cards;
    if (mode === 'learning') cardsToReview = targetSet.cards.filter(c => c.status !== 'learned');
    if (cardsToReview.length === 0) return alert("沒有需要學習的單字！");
    setCurrentSetId(setId);
    setActiveCards(cardsToReview);
    setCurrentIndex(0);
    setView('learning');
  };

  const deleteSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    if (confirm("確定要刪除嗎？")) setVideoSets(prev => prev.filter(s => s.id !== setId));
  };

  const currentSet = videoSets.find(s => s.id === currentSetId);

  if (isInitializing) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">Loading...</div>;

  if (!currentKey) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in duration-300 text-center">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 transform rotate-12">🔑</div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">請輸入 API 金鑰</h1>
          <p className="text-slate-500 text-sm mb-8">請貼上您的 Google Gemini API Key 以啟動 AI 分析功能</p>
          <form onSubmit={handleSaveKey} className="space-y-4">
            <input 
              autoFocus
              type="text"
              placeholder="請在此貼上 API Key..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 transition-all font-mono text-sm"
            />
            <button type="submit" className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 transition-all active:scale-95">
              儲存並開始使用
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-slate-100">
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 text-xs font-bold hover:underline">
              去 Google AI Studio 申請免費金鑰 ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32 px-4 pt-8 md:pt-12 relative">
      {showKeyConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl relative animate-in zoom-in duration-200">
            <button onClick={() => setShowKeyConfig(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>
            <h3 className="text-xl font-black text-slate-900 mb-6">設定 API Key</h3>
            <form onSubmit={handleSaveKey} className="space-y-4">
              <input 
                autoFocus
                type="text"
                placeholder="貼上 API Key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold">更新金鑰</button>
            </form>
          </div>
        </div>
      )}

      <header className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
        <div className="cursor-pointer" onClick={() => setView('home')}>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            <span className="text-indigo-600">Vocab</span>Master
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-sm">影片單字圖書館</p>
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-black uppercase">Auto-Save ON</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setShowKeyConfig(true)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200">🔑 設定</button>
          {view !== 'home' && <button onClick={() => setView('home')} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold border border-indigo-100">返回</button>}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="space-y-10">
            <YouTubeInput onProcess={handleProcessVideo} isLoading={isLoading} />
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">我的收藏 ({videoSets.length})</h2>
              {videoSets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">尚無收藏，請貼上網址開始分析！</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videoSets.map(set => (
                    <div key={set.id} onClick={() => { setCurrentSetId(set.id); setView('setDetail'); }} className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative">
                      <button onClick={(e) => deleteSet(e, set.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <h3 className="font-bold text-slate-800 mb-1 line-clamp-2 pr-8">{set.title}</h3>
                      <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-wider">{new Date(set.createdAt).toLocaleDateString()} · {set.cards.length} WORDS</p>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-md uppercase">Mastered {set.cards.filter(c => c.status === 'learned').length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'setDetail' && currentSet && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6">{currentSet.title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => startLearning(currentSet.id, 'all')} className="py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100">全部複習 ({currentSet.cards.length})</button>
                <button onClick={() => startLearning(currentSet.id, 'learning')} className="py-4 rounded-2xl font-bold border-2 border-amber-100 bg-amber-50 text-amber-600">複習剩餘</button>
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">單字列表</h3>
              <div className="divide-y divide-slate-100">
                {currentSet.cards.map(card => (
                  <div key={card.id} className="py-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{card.word}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase">{card.partOfSpeech}</span>
                      </div>
                      <p className="text-sm text-slate-500">{card.translation}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase ${card.status === 'learned' ? 'text-green-500' : 'text-amber-500'}`}>{card.status === 'learned' ? 'Mastered' : 'New'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'learning' && activeCards.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-8 px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{currentIndex + 1} / {activeCards.length}</span>
              <div className="h-1.5 flex-1 mx-6 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${((currentIndex + 1) / activeCards.length) * 100}%` }} />
              </div>
            </div>
            <FlashcardItem key={activeCards[currentIndex].id} card={activeCards[currentIndex]} onSwipeRight={() => handleSwipe('learned')} onSwipeLeft={() => handleSwipe('learning')} />
          </div>
        )}

        {view === 'summary' && (
          <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-200 text-center max-w-lg mx-auto">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🎉</div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">練習完成！</h2>
            <button onClick={() => setView('home')} className="mt-8 w-full py-4 bg-indigo-600 text-white rounded-2xl font-black">回主畫面</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
