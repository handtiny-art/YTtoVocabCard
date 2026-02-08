
import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, VideoSet } from './types';
import YouTubeInput from './components/YouTubeInput';
import FlashcardItem from './components/FlashcardItem';
import { extractVocabFromVideo } from './services/geminiService';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [videoSets, setVideoSets] = useState<VideoSet[]>([]);
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<'home' | 'setDetail' | 'learning' | 'summary'>('home');
  const [hasKey, setHasKey] = useState<boolean>(true); // Default true to prevent flicker
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback for environments without aistudio bridge
        setHasKey(!!process.env.API_KEY);
      }
      setIsCheckingKey(false);
    };
    checkKey();
    
    const savedSets = localStorage.getItem('vocab_master_sets');
    if (savedSets) {
      try {
        setVideoSets(JSON.parse(savedSets));
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('vocab_master_sets', JSON.stringify(videoSets));
  }, [videoSets]);

  const handleOpenKeySelector = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Assume selection successful and proceed
      setHasKey(true);
    } else {
      alert("此環境不支援金鑰選取對話框。請確認您在正確的環境中運行。");
    }
  };

  const handleProcessVideo = async (url: string) => {
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
      console.error("Error processing video:", error);
      const errMsg = error.message || "";
      
      if (errMsg.includes("Requested entity was not found") || errMsg.includes("權限") || errMsg.includes("API")) {
        alert("金鑰無效或權限不足（請確認金鑰來自已啟用計費的專案）。將為您重新開啟金鑰選擇器。");
        setHasKey(false);
      } else {
        alert(errMsg || "學習集產生失敗，請稍後再試。");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateCardStatus = (setId: string, cardId: string, status: 'learning' | 'learned') => {
    setVideoSets(prev => prev.map(set => {
      if (set.id === setId) {
        return {
          ...set,
          cards: set.cards.map(card => 
            card.id === cardId ? { ...card, status } : card
          )
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
    if (mode === 'learning') {
      cardsToReview = targetSet.cards.filter(c => c.status !== 'learned');
    }

    if (cardsToReview.length === 0) {
      alert("目前沒有需要學習的單字！");
      return;
    }

    setCurrentSetId(setId);
    setActiveCards(cardsToReview);
    setCurrentIndex(0);
    setView('learning');
  };

  const deleteSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    if (confirm("確定要刪除這個影片資料夾嗎？")) {
      setVideoSets(prev => prev.filter(s => s.id !== setId));
      if (currentSetId === setId) setView('home');
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(videoSets, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `vocab-master-backup-${new Date().toISOString().split('T')[0]}.json`);
    linkElement.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          setVideoSets(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newSets = importedData.filter(s => !existingIds.has(s.id));
            return [...newSets, ...prev];
          });
          alert("匯入成功！");
        }
      } catch (err) { alert("讀取失敗"); }
    };
    reader.readAsText(file);
  };

  const currentSet = videoSets.find(s => s.id === currentSetId);

  // Mandatory Setup View
  if (!hasKey && !isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-8 transform rotate-12">
            🔑
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">啟動 VocabMaster</h1>
          <p className="text-slate-500 mb-8 leading-relaxed font-medium">
            為了精確分析 YouTube 影片並提取單字，我們需要連結您的 <b>Google AI Studio API Key</b>。
            <br/><br/>
            請確保選取的是一個來自 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-bold">已啟用計費 (Paid)</a> 專案的金鑰。
          </p>
          <button 
            onClick={handleOpenKeySelector}
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 transition-all active:scale-95 mb-4"
          >
            立即連結 API 金鑰
          </button>
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Powered by Gemini 3 Pro & Google Search</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32 px-4 pt-8 md:pt-12">
      <header className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
        <div className="cursor-pointer group" onClick={() => setView('home')}>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="text-indigo-600 group-hover:scale-110 transition-transform inline-block">Vocab</span>Master
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-sm">影片單字圖書館</p>
            <div 
              onClick={handleOpenKeySelector}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-black uppercase cursor-pointer hover:bg-green-100 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              API Connected
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleOpenKeySelector}
            className="p-2 bg-white text-slate-400 rounded-xl hover:text-indigo-600 border border-slate-100 transition-colors"
            title="更換金鑰"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          {view !== 'home' && (
            <button onClick={() => setView('home')} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200">
              返回主頁
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="space-y-10">
            <YouTubeInput onProcess={handleProcessVideo} isLoading={isLoading} />
            
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  我的收藏 ({videoSets.length})
                </h2>
                <div className="flex gap-2">
                  <button onClick={exportData} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">Export</button>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600">Import</button>
                  <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
                </div>
              </div>

              {videoSets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                  尚無收藏，請匯入 YouTube 網址開始！
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videoSets.map(set => (
                    <div key={set.id} onClick={() => { setCurrentSetId(set.id); setView('setDetail'); }} className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden">
                      <button onClick={(e) => deleteSet(e, set.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <h3 className="font-bold text-slate-800 mb-1 line-clamp-2 pr-8 text-sm group-hover:text-indigo-600">{set.title}</h3>
                      <p className="text-[10px] text-slate-400 mb-3 uppercase">{new Date(set.createdAt).toLocaleDateString()} · {set.cards.length} WORDS</p>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-md uppercase">Mastered {set.cards.filter(c => c.status === 'learned').length}</span>
                        <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-md uppercase">Learning {set.cards.filter(c => c.status !== 'learned').length}</span>
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
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800 mb-2 leading-tight">{currentSet.title}</h2>
                <div className="flex flex-wrap gap-3">
                  <a href={currentSet.url} target="_blank" rel="noreferrer" className="text-indigo-500 text-xs font-bold hover:underline">WATCH VIDEO ↗</a>
                  {currentSet.sources && currentSet.sources.length > 0 && (
                    <div className="flex gap-2 items-center">
                      <span className="text-slate-300">|</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Sources:</span>
                      {currentSet.sources.map((src, i) => (
                        <a key={i} href={src.url} target="_blank" rel="noreferrer" className="text-slate-400 text-[10px] hover:text-indigo-500 underline truncate max-w-[100px]">{src.title}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-slate-50 p-5 rounded-2xl mb-8 border border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">AI Content Analysis</h4>
                <p className="text-slate-600 leading-relaxed text-sm italic">"{currentSet.transcript}"</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => startLearning(currentSet.id, 'all')} className="py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100">全部複習 ({currentSet.cards.length})</button>
                <button onClick={() => startLearning(currentSet.id, 'learning')} className={`py-4 rounded-2xl font-bold border-2 ${currentSet.cards.filter(c => c.status !== 'learned').length > 0 ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'}`}>複習剩餘 ({currentSet.cards.filter(c => c.status !== 'learned').length})</button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Vocabulary List</h3>
              <div className="divide-y divide-slate-100">
                {currentSet.cards.map(card => (
                  <div key={card.id} className="py-4 flex justify-between items-center group">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-lg">{card.word}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-black uppercase">{card.partOfSpeech}</span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">{card.translation}</p>
                    </div>
                    <div className="ml-4">
                      <span className={`text-[10px] font-black uppercase ${card.status === 'learned' ? 'text-green-500' : 'text-amber-500'}`}>
                        {card.status === 'learned' ? 'Mastered' : 'Learning'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'learning' && activeCards.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-8 px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{currentIndex + 1} OF {activeCards.length}</span>
              <div className="h-1.5 flex-1 mx-6 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${((currentIndex + 1) / activeCards.length) * 100}%` }} />
              </div>
            </div>
            <FlashcardItem key={activeCards[currentIndex].id} card={activeCards[currentIndex]} onSwipeRight={() => handleSwipe('learned')} onSwipeLeft={() => handleSwipe('learning')} />
          </div>
        )}

        {view === 'summary' && (
          <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-200 text-center animate-in fade-in zoom-in max-w-lg mx-auto">
            <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">🎉</div>
            <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">PROGRESS SAVED</h2>
            <p className="text-slate-500 mb-8 font-medium">複習完成！持續練習是進步的關鍵。</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => setView('setDetail')} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">回到學習集</button>
              <button onClick={() => setView('home')} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black">回主畫面</button>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto flex justify-around items-center">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-black uppercase mb-0.5">Videos</span>
            <span className="text-slate-900 font-black text-lg">{videoSets.length}</span>
          </div>
          <div className="w-px h-6 bg-slate-100"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-black uppercase mb-0.5">Vocabs</span>
            <span className="text-slate-900 font-black text-lg">{videoSets.reduce((acc, set) => acc + set.cards.length, 0)}</span>
          </div>
          <div className="w-px h-6 bg-slate-100"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-black uppercase mb-0.5">Mastery</span>
            <span className="text-indigo-600 font-black text-lg">
              {videoSets.reduce((acc, set) => acc + set.cards.length, 0) > 0 
                ? Math.round((videoSets.reduce((acc, set) => acc + set.cards.filter(c => c.status === 'learned').length, 0) / videoSets.reduce((acc, set) => acc + set.cards.length, 0)) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
