
import React, { useState, useEffect } from 'react';
import { Flashcard, VideoSet } from './types';
import YouTubeInput from './components/YouTubeInput';
import FlashcardItem from './components/FlashcardItem';
import { extractVocabFromVideo } from './services/geminiService';

const App: React.FC = () => {
  const [videoSets, setVideoSets] = useState<VideoSet[]>(() => {
    const saved = localStorage.getItem('vocab_master_sets');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
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

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualWord, setManualWord] = useState({ word: '', pos: 'n.', trans: '', example: '' });

  const setApiKeyIntoGlobal = (key: string) => {
    if (!key) return;
    if (!(window as any).process) (window as any).process = { env: {} };
    if (!(window as any).process.env) (window as any).process.env = {};
    (window as any).process.env.API_KEY = key;
  };

  useEffect(() => {
    if (currentKey) setApiKeyIntoGlobal(currentKey);
    setIsInitializing(false);
  }, [currentKey]);

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
      alert("請輸入正確的 API Key");
    }
  };

  const handleProcessVideo = async (url: string) => {
    if (!currentKey) {
      setShowKeyConfig(true);
      return;
    }
    setIsLoading(true);
    try {
      const { transcript, cards, detectedTitle, sources } = await extractVocabFromVideo(url);
      const newSet: VideoSet = {
        id: `set-${Date.now()}`,
        url,
        title: detectedTitle || `單字集 - ${new Date().toLocaleDateString()}`,
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

  const addManualCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSetId || !manualWord.word || !manualWord.trans) return;

    const newCard: Flashcard = {
      id: `manual-${Date.now()}`,
      word: manualWord.word,
      partOfSpeech: manualWord.pos,
      translation: manualWord.trans,
      example: manualWord.example || '使用者手動新增的單字',
      status: 'new'
    };

    setVideoSets(prev => prev.map(set => {
      if (set.id === currentSetId) {
        return { ...set, cards: [...set.cards, newCard] };
      }
      return set;
    }));

    setManualWord({ word: '', pos: 'n.', trans: '', example: '' });
    setShowManualForm(false);
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
    if (confirm("確定要刪除此單字集嗎？")) setVideoSets(prev => prev.filter(s => s.id !== setId));
  };

  const currentSet = videoSets.find(s => s.id === currentSetId);

  if (isInitializing) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">載入中...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 px-4 pt-8 md:pt-12 relative">
      {showKeyConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl relative animate-in zoom-in duration-200">
            <button onClick={() => setShowKeyConfig(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>
            <h3 className="text-xl font-black text-slate-900 mb-6 text-center">Pro API Key 設定</h3>
            <form onSubmit={handleSaveKey} className="space-y-4">
              <input 
                autoFocus
                type="text"
                placeholder="貼上您的 Gemini API Key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold">儲存配置</button>
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
            <p className="text-slate-500 text-sm">影片單字大師</p>
            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">Pro 版本</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setShowKeyConfig(true)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200">🔑 設定</button>
          {view !== 'home' && <button onClick={() => setView('home')} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold border border-indigo-100 transition-all active:scale-95">返回</button>}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="space-y-12">
            <YouTubeInput onProcess={handleProcessVideo} isLoading={isLoading} />
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">我的單字收藏 ({videoSets.length})</h2>
              {videoSets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 font-medium">貼上連結或手動新增單字！</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videoSets.map(set => (
                    <div key={set.id} onClick={() => { setCurrentSetId(set.id); setView('setDetail'); }} className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer relative">
                      <button onClick={(e) => deleteSet(e, set.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <h3 className="font-bold text-slate-800 mb-2 line-clamp-2 pr-8">{set.title}</h3>
                      <p className="text-[10px] text-slate-400 mb-4 uppercase tracking-wider">{new Date(set.createdAt).toLocaleDateString()}</p>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-wider">{set.cards.length} 單字</span>
                        <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black rounded-full uppercase tracking-wider">已學會: {set.cards.filter(c => c.status === 'learned').length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'setDetail' && currentSet && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-2">{currentSet.title}</h2>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed italic">"{currentSet.transcript}"</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => startLearning(currentSet.id, 'all')} className="py-5 bg-slate-900 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all">全量學習</button>
                <button onClick={() => startLearning(currentSet.id, 'learning')} className="py-5 rounded-2xl font-black border-2 border-indigo-100 bg-white text-indigo-600 active:scale-95 transition-all">複習還在學</button>
              </div>
            </div>

            {/* 手動新增表單 */}
            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
              {!showManualForm ? (
                <button 
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-xl">+</span> 手動增加自訂單字
                </button>
              ) : (
                <form onSubmit={addManualCard} className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input 
                      className="col-span-2 px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="單字 (例如: Perspective)"
                      value={manualWord.word}
                      onChange={e => setManualWord({...manualWord, word: e.target.value})}
                      required
                    />
                    <select 
                      className="px-2 py-3 rounded-xl border border-indigo-100 bg-white font-bold text-slate-600"
                      value={manualWord.pos}
                      onChange={e => setManualWord({...manualWord, pos: e.target.value})}
                    >
                      <option>n.</option><option>v.</option><option>adj.</option><option>adv.</option><option>phr.</option>
                    </select>
                  </div>
                  <input 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="中文翻譯"
                    value={manualWord.trans}
                    onChange={e => setManualWord({...manualWord, trans: e.target.value})}
                    required
                  />
                  <textarea 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="例句 (選填)"
                    rows={2}
                    value={manualWord.example}
                    onChange={e => setManualWord({...manualWord, example: e.target.value})}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100">儲存單字</button>
                    <button type="button" onClick={() => setShowManualForm(false)} className="px-6 py-3 bg-white text-slate-400 rounded-xl font-bold border border-slate-200">取消</button>
                  </div>
                </form>
              )}
            </div>
            
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">目前單字列表</h3>
              <div className="divide-y divide-slate-50">
                {currentSet.cards.map(card => (
                  <div key={card.id} className="py-4 flex justify-between items-center group">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-slate-800 text-lg">{card.word}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-black uppercase">{card.partOfSpeech}</span>
                        {card.id.startsWith('manual-') && <span className="text-[8px] bg-indigo-100 text-indigo-500 px-1 rounded font-black uppercase">自訂</span>}
                      </div>
                      <p className="text-sm text-slate-500 font-medium">{card.translation}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${card.status === 'learned' ? 'bg-green-50 text-green-500' : 'bg-slate-50 text-slate-300'}`}>
                      {card.status === 'learned' ? '已學會' : '還在學'}
                    </span>
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
              <div className="h-1.5 flex-1 mx-6 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-slate-900 transition-all duration-500" style={{ width: `${((currentIndex + 1) / activeCards.length) * 100}%` }} />
              </div>
            </div>
            <FlashcardItem key={activeCards[currentIndex].id} card={activeCards[currentIndex]} onSwipeRight={() => handleSwipe('learned')} onSwipeLeft={() => handleSwipe('learning')} />
          </div>
        )}

        {view === 'summary' && (
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-50 text-center max-w-lg mx-auto animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-slate-900 text-white rounded-full flex items-center justify-center text-4xl mx-auto mb-8 shadow-inner transform -rotate-6">✨</div>
            <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">練習完成！</h2>
            <p className="text-slate-500 mb-10 leading-relaxed font-medium">不論是 AI 提取還是手動新增，<br/>每一份努力都在累積您的詞彙實力。</p>
            <button onClick={() => setView('home')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-100 active:scale-95 transition-all">
              回到首頁
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
