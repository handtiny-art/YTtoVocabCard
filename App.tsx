
import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, VideoSet } from './types';
import YouTubeInput from './components/YouTubeInput';
import FlashcardItem from './components/FlashcardItem';
import { fetchTranscript, analyzeTranscript } from './services/vocabService';

const App: React.FC = () => {
  const [videoSets, setVideoSets] = useState<VideoSet[]>(() => {
    const saved = localStorage.getItem('vocab_master_sets');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  const [currentKey, setCurrentKey] = useState<string>(() => {
    return localStorage.getItem('VOCAB_MASTER_GEMINI_KEY') || '';
  });

  const [openaiKey, setOpenaiKey] = useState<string>(() => {
    return localStorage.getItem('VOCAB_MASTER_OPENAI_KEY') || '';
  });

  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>(() => {
    return (localStorage.getItem('VOCAB_MASTER_AI_PROVIDER') as 'gemini' | 'openai') || 'gemini';
  });

  const [supadataKey, setSupadataKey] = useState<string>(() => {
    return localStorage.getItem('VOCAB_MASTER_SUPADATA_KEY') || '';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<'home' | 'setDetail' | 'learning' | 'summary'>('home');
  
  const [showConfig, setShowConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('VOCAB_MASTER_GEMINI_KEY') || '');
  const [openaiKeyInput, setOpenaiKeyInput] = useState(() => localStorage.getItem('VOCAB_MASTER_OPENAI_KEY') || '');
  const [supadataKeyInput, setSupadataKeyInput] = useState(() => localStorage.getItem('VOCAB_MASTER_SUPADATA_KEY') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showSupadataKey, setShowSupadataKey] = useState(false);
  const [importText, setImportText] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualWord, setManualWord] = useState({ word: '', pos: 'n.', trans: '', example: '', englishDefinition: '' });

  const [selectedCard, setSelectedCard] = useState<Flashcard | null>(null);
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [editForm, setEditForm] = useState<Flashcard | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isAlert?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void, confirmText = "確定", cancelText = "取消") => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      isAlert: false
    });
  };

  const showCustomAlert = (title: string, message: string, onConfirmAction?: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: "確定",
      onConfirm: () => {
        if (onConfirmAction) onConfirmAction();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      isAlert: true
    });
  };

  const handleOpenCard = (card: Flashcard) => {
    setSelectedCard(card);
    setEditForm({ ...card });
    setIsEditingCard(false);
  };

  const handleSaveCardEdit = () => {
    if (!editForm || !currentSetId) return;
    
    setVideoSets(prev => prev.map(set => {
      if (set.id === currentSetId) {
        return {
          ...set,
          cards: set.cards.map(c => c.id === editForm.id ? editForm : c)
        };
      }
      return set;
    }));

    setSelectedCard(editForm);
    setIsEditingCard(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const cleanGeminiKey = apiKeyInput.trim();
    const cleanOpenaiKey = openaiKeyInput.trim();
    const cleanSupadataKey = supadataKeyInput.trim();
    
    let message = "";

    // Gemini Key
    if (cleanGeminiKey !== currentKey) {
      setCurrentKey(cleanGeminiKey);
      localStorage.setItem('VOCAB_MASTER_GEMINI_KEY', cleanGeminiKey);
      setApiKeyIntoGlobal(cleanGeminiKey);
      message += "Gemini API 金鑰已變更\n";
    }

    // OpenAI Key
    if (cleanOpenaiKey !== openaiKey) {
      setOpenaiKey(cleanOpenaiKey);
      localStorage.setItem('VOCAB_MASTER_OPENAI_KEY', cleanOpenaiKey);
      message += "OpenAI API 金鑰已變更\n";
    }

    // Supadata Key
    if (cleanSupadataKey !== supadataKey) {
      setSupadataKey(cleanSupadataKey);
      localStorage.setItem('VOCAB_MASTER_SUPADATA_KEY', cleanSupadataKey);
      message += "Supadata API 金鑰已變更\n";
    }

    // 關閉設定與數據中心彈窗
    setShowConfig(false);

    // 顯示自定義設定成功提示
    const alertBody = message ? `${message}\n設定已成功儲存入瀏覽器本機快取！` : "設定已成功儲存！";
    showCustomAlert("設定已儲存", alertBody);
  };

  const [loadingStep, setLoadingStep] = useState<'idle' | 'fetching' | 'analyzing'>('idle');

  const handleProcessVideo = async (url: string) => {
    setIsLoading(true);
    setLoadingStep('fetching');

    try {
      // 階段 1: 獲取逐字稿
      const { transcript, detectedTitle } = await fetchTranscript(url, supadataKey);
      
      setLoadingStep('analyzing');

      // 階段 2: AI 分析
      const { summary, cards } = await analyzeTranscript(transcript, detectedTitle, {
        provider: aiProvider,
        geminiKey: currentKey,
        openaiKey: openaiKey
      });

      const newSet: VideoSet = {
        id: `set-${Date.now()}`,
        url,
        title: detectedTitle,
        transcript: summary,
        cards,
        sources: [],
        createdAt: Date.now()
      };

      setVideoSets(prev => [newSet, ...prev]);
      setCurrentSetId(newSet.id);
      setView('setDetail');
    } catch (error: any) {
      showCustomAlert("分析失敗", error.message || "未知錯誤，請確認影片網址或 API 金鑰。");
    } finally {
      setIsLoading(false);
      setLoadingStep('idle');
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
      status: 'new',
      englishDefinition: manualWord.englishDefinition || ''
    };

    setVideoSets(prev => prev.map(set => {
      if (set.id === currentSetId) {
        return { ...set, cards: [...set.cards, newCard] };
      }
      return set;
    }));

    setManualWord({ word: '', pos: 'n.', trans: '', example: '', englishDefinition: '' });
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
    if (cardsToReview.length === 0) {
      showCustomAlert("學習提示", "沒有需要學習的單字！");
      return;
    }
    setCurrentSetId(setId);
    setActiveCards(cardsToReview);
    setCurrentIndex(0);
    setView('learning');
  };

  const deleteSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    showCustomConfirm("刪除單字集", "確定要刪除此單字集嗎？這會一併清除該集的所有單字卡，且無法復原喔！", () => {
      setVideoSets(prev => prev.filter(s => s.id !== setId));
    });
  };

  const handleDeleteCard = (cardId: string, confirmRequired = true) => {
    if (!currentSetId) return;
    
    const performDeletion = () => {
      setVideoSets(prev => prev.map(set => {
        if (set.id === currentSetId) {
          return {
            ...set,
            cards: set.cards.filter(c => c.id !== cardId)
          };
        }
        return set;
      }));
    };

    if (confirmRequired) {
      showCustomConfirm("刪除單字卡", "確定要刪除此單字卡嗎？", performDeletion);
    } else {
      performDeletion();
    }
  };

  // 數據管理功能
  const exportAsFile = () => {
    const dataStr = JSON.stringify(videoSets, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `vocab_master_backup_${new Date().toISOString().slice(0,10)}.json`);
    linkElement.click();
  };

  const copyDataToClipboard = () => {
    const dataStr = JSON.stringify(videoSets);
    navigator.clipboard.writeText(dataStr).then(() => {
      showCustomAlert("複製成功", "所有單字數據已成功複製到剪貼簿！您可以將其貼在記事本中妥善保存。");
    });
  };

  const handleImportText = () => {
    try {
      const importedData = JSON.parse(importText.trim());
      if (Array.isArray(importedData)) {
        setVideoSets(importedData);
        showCustomAlert("還原成功", "已成功從備份數據碼還原所有單字收藏！");
        setImportText('');
        setShowConfig(false);
      } else {
        showCustomAlert("格式不正確", "貼上的數據並非有效的單字集陣列，請重新確認。");
      }
    } catch (err) {
      showCustomAlert("格式錯誤", "無效的數據格式，請確認是否複製完整。");
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;
    fileReader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          setVideoSets(importedData);
          showCustomAlert("還原成功", "已成功從 JSON 備份檔案還原所有單字收藏！");
          setShowConfig(false);
        } else {
          showCustomAlert("還原失敗", "檔案內容結構不符，無法還原。");
        }
      } catch (err) {
        showCustomAlert("還原失敗", "檔案讀取或解析失敗，可能檔案已損壞。");
      }
    };
    fileReader.readAsText(file);
  };

  const currentSet = videoSets.find(s => s.id === currentSetId);

  if (isInitializing) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">載入中...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 px-4 pt-8 md:pt-12 relative">
      {/* 設定與數據中心彈窗 */}
      {showConfig && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowConfig(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center transition-all">✕</button>
            
            <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
              <span className="w-10 h-10 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-sm italic">YT</span>
              YTtoVocab 系統設定與數據中心
            </h3>

            {/* AI 狀態與金鑰區塊 */}
            <div className="mb-10 space-y-6">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-6">
                <button 
                  onClick={() => {
                    setAiProvider('gemini');
                    localStorage.setItem('VOCAB_MASTER_AI_PROVIDER', 'gemini');
                  }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${aiProvider === 'gemini' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                >
                  Gemini (預設)
                </button>
                <button 
                  onClick={() => {
                    setAiProvider('openai');
                    localStorage.setItem('VOCAB_MASTER_AI_PROVIDER', 'openai');
                  }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${aiProvider === 'openai' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                >
                  ChatGPT (GPT-4o)
                </button>
              </div>

              <form onSubmit={handleSaveKey} className="space-y-6">
                {aiProvider === 'gemini' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Gemini API 金鑰 (選填)</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"}
                        placeholder="貼上 Gemini API Key..."
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400 ml-1">註：若留空則使用系統預設免費額度此處為選填。請至 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-emerald-500 underline font-bold">AI Studio</a> 申請</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">OpenAI API 金鑰 (ChatGPT - 選填)</label>
                    <div className="relative">
                      <input 
                        type={showOpenaiKey ? "text" : "password"}
                        placeholder="貼上 OpenAI API Key..."
                        value={openaiKeyInput}
                        onChange={(e) => setOpenaiKeyInput(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showOpenaiKey ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400 ml-1">註：使用 ChatGPT 可以選填此 API Key，留空則嘗試以伺服器預設對接。請至 <a href="https://platform.openai.com/api-keys" target="_blank" className="text-blue-500 underline font-bold">OpenAI Platform</a> 申請</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Supadata API 金鑰 (獲取影片內容 - 選填)</label>
                  <div className="relative">
                    <input 
                      type={showSupadataKey ? "text" : "password"}
                      placeholder="貼上 Supadata API Key..."
                      value={supadataKeyInput}
                      onChange={(e) => setSupadataKeyInput(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowSupadataKey(!showSupadataKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSupadataKey ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 ml-1">註：請至 <a href="https://supadata.ai" target="_blank" className="text-emerald-500 underline font-bold">supadata.ai</a> 申請免費 Key</p>
                </div>

                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold active:scale-95 transition-all shadow-lg shadow-slate-100">儲存設定</button>
              </form>
            </div>

            <div className="h-px bg-slate-100 mb-8" />

            {/* 備份還原區塊 */}
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">備份數據 (防遺失必備)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={copyDataToClipboard} className="py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-100 transition-all border border-indigo-100">一鍵複製數據碼</button>
                  <button onClick={exportAsFile} className="py-4 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all border border-slate-200">下載 JSON 檔案</button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">還原數據</label>
                <textarea 
                  className="w-full h-24 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono"
                  placeholder="在此貼上您之前複製的數據碼..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={handleImportText} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 active:scale-95 transition-all">貼上還原</button>
                  <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 bg-white text-emerald-600 border border-emerald-100 rounded-2xl font-bold active:scale-95 transition-all">選擇檔案還原</button>
                </div>
              </div>
            </div>

            <p className="mt-8 text-[11px] text-slate-400 leading-relaxed font-medium">
              💡 <span className="text-amber-500 font-bold">重要提醒</span>：由於瀏覽器安全限制，資料是跟隨網址儲存的。若網址（URL）發生變動，舊資料會「隱形」。請務必養成隨手「複製數據碼」存放在記事本的習慣。
            </p>
          </div>
        </div>
      )}

      <header className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
        <div className="cursor-pointer" onClick={() => setView('home')}>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            YTtoVocab
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-sm">YouTube 影片單字大師</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {videoSets.length > 0 && <span className="hidden md:inline text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest">資料已即時存檔</span>}
          <button onClick={() => setShowConfig(true)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-all">
            ⚙️ 設定
          </button>
          {view !== 'home' && <button onClick={() => setView('home')} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold border border-indigo-100 transition-all active:scale-95">返回首頁</button>}
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="space-y-12">
            <YouTubeInput onProcess={handleProcessVideo} isLoading={isLoading} loadingStep={loadingStep} aiProvider={aiProvider} />
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">我的單字收藏 ({videoSets.length})</h2>
              {videoSets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-400 font-medium">
                  貼上連結，或點擊「設定」還原先前的備份紀錄！
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videoSets.map(set => (
                    <div key={set.id} onClick={() => { setCurrentSetId(set.id); setView('setDetail'); }} className="group bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:translate-y-[-4px] transition-all cursor-pointer relative">
                      <button onClick={(e) => deleteSet(e, set.id)} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 p-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <h3 className="font-bold text-slate-800 mb-3 line-clamp-2 pr-10 text-lg leading-snug">{set.title}</h3>
                      <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-widest font-black">{new Date(set.createdAt).toLocaleDateString()} 更新</p>
                      <div className="flex gap-2">
                        <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-wider">{set.cards.length} 個單字</span>
                        <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-wider">進度: {set.cards.filter(c => c.status === 'learned').length} / {set.cards.length}</span>
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
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-2xl font-black text-slate-800 mb-3">{currentSet.title}</h2>
              <p className="text-slate-500 text-sm mb-10 leading-relaxed italic border-l-4 border-indigo-100 pl-4">"{currentSet.transcript}"</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => startLearning(currentSet.id, 'all')} className="py-5 bg-slate-900 text-white rounded-2xl font-black shadow-lg shadow-slate-200 active:scale-95 transition-all text-lg">全部複習</button>
                <button onClick={() => startLearning(currentSet.id, 'learning')} className="py-5 rounded-2xl font-black border-2 border-indigo-100 bg-white text-indigo-600 active:scale-95 transition-all text-lg">複習還在學</button>
              </div>
            </div>

            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
              {!showManualForm ? (
                <button 
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-xl">+</span> 手動增加單字卡
                </button>
              ) : (
                <form onSubmit={addManualCard} className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input 
                      className="col-span-2 px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="英文單字 (如: Resilience)"
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
                    placeholder="英文解釋/定義 (選填)"
                    value={manualWord.englishDefinition}
                    onChange={e => setManualWord({...manualWord, englishDefinition: e.target.value})}
                  />
                  <input 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="中文翻譯"
                    value={manualWord.trans}
                    onChange={e => setManualWord({...manualWord, trans: e.target.value})}
                    required
                  />
                  <textarea 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="例句內容 (選填)"
                    rows={2}
                    value={manualWord.example}
                    onChange={e => setManualWord({...manualWord, example: e.target.value})}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100">儲存</button>
                    <button type="button" onClick={() => setShowManualForm(false)} className="px-6 py-3 bg-white text-slate-400 rounded-xl font-bold border border-slate-200">取消</button>
                  </div>
                </form>
              )}
            </div>
            
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 ml-1">目前單字列表</h3>
              <div className="divide-y divide-slate-100">
                {currentSet.cards.map(card => (
                  <div 
                    key={card.id} 
                    onClick={() => handleOpenCard(card)}
                    className="py-4 px-4 -mx-4 rounded-2xl flex justify-between items-center group hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{card.word}</span>
                        {card.partOfSpeech && card.partOfSpeech !== 'n/a' && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-black uppercase">{card.partOfSpeech}</span>
                        )}
                        {card.cefrLevel && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase">{card.cefrLevel}</span>
                        )}
                        {card.id.startsWith('manual-') && <span className="text-[8px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">自訂</span>}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {card.englishDefinition && (
                          <p className="text-xs text-slate-400 font-medium italic line-clamp-1">{card.englishDefinition}</p>
                        )}
                        <p className="text-sm text-slate-500 font-medium">{card.translation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-full ${card.status === 'learned' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}>
                        {card.status === 'learned' ? '已學會' : '還在學'}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCard(card.id);
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="刪除此單字卡"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <span className="text-slate-300 group-hover:translate-x-1 group-hover:text-indigo-400 transition-all text-xs">➔</span>
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
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{currentIndex + 1} / {activeCards.length}</span>
              <div className="h-2 flex-1 mx-8 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-slate-900 transition-all duration-700" style={{ width: `${((currentIndex + 1) / activeCards.length) * 100}%` }} />
              </div>
            </div>
            <FlashcardItem key={activeCards[currentIndex].id} card={activeCards[currentIndex]} onSwipeRight={() => handleSwipe('learned')} onSwipeLeft={() => handleSwipe('learning')} />
          </div>
        )}

        {view === 'summary' && (
          <div className="bg-white p-16 rounded-[3rem] shadow-2xl border border-slate-50 text-center max-w-lg mx-auto animate-in zoom-in duration-500">
            <div className="w-28 h-28 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center text-5xl mx-auto mb-10 shadow-2xl transform -rotate-6">🏆</div>
            <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">練習結束！</h2>
            <p className="text-slate-500 mb-12 leading-relaxed font-medium text-lg">今天的努力，<br/>是明天實力的累積。</p>
            <button onClick={() => setView('setDetail')} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black text-xl shadow-xl shadow-slate-200 active:scale-95 transition-all">
              返回單字列表
            </button>
          </div>
        )}
      </main>

      {/* 獨立單字卡詳細與編輯彈窗 */}
      {selectedCard && editForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => { setSelectedCard(null); setEditForm(null); }} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center transition-all"
            >
              ✕
            </button>

            {!isEditingCard ? (
              /* 預覽視圖 */
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] block mb-2">單字內容</span>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black text-slate-950">{selectedCard.word}</h2>
                    {selectedCard.partOfSpeech && selectedCard.partOfSpeech !== 'n/a' && (
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg uppercase">
                        {selectedCard.partOfSpeech}
                      </span>
                    )}
                    {selectedCard.cefrLevel && (
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg border border-indigo-100">
                        {selectedCard.cefrLevel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl space-y-4">
                  {selectedCard.englishDefinition && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">English Definition (英文解釋)</p>
                      <p className="text-slate-700 font-semibold leading-relaxed">{selectedCard.englishDefinition}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">中文翻譯</p>
                    <p className="text-slate-950 text-lg font-bold">{selectedCard.translation}</p>
                  </div>
                </div>

                {selectedCard.example && (
                  <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/30">
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1.5">Context Sentence (例句/影片原句)</p>
                    <p className="text-indigo-900 italic font-medium">"{selectedCard.example}"</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button 
                    onClick={() => setIsEditingCard(true)}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-lg hover:bg-slate-850 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    ✏️ 編輯單字內容
                  </button>
                  <button 
                    onClick={() => {
                      showCustomConfirm("刪除單字卡", "確定要刪除這個單字卡嗎？", () => {
                        handleDeleteCard(selectedCard.id, false);
                        setSelectedCard(null);
                        setEditForm(null);
                      });
                    }}
                    className="py-4 px-5 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black active:scale-95 transition-all flex items-center justify-center gap-2"
                    title="刪除此單字"
                  >
                    🗑️ 刪除單字
                  </button>
                  <button 
                    onClick={() => { setSelectedCard(null); setEditForm(null); }}
                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all"
                  >
                    關閉
                  </button>
                </div>
              </div>
            ) : (
              /* 編輯視圖 */
              <div className="space-y-6">
                <h3 className="text-xl font-black text-slate-900 mb-2">編輯單字內容</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">英文單字</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900"
                      value={editForm.word}
                      onChange={(e) => setEditForm({ ...editForm, word: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">詞性 (Part of Speech)</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900 font-bold text-slate-600"
                        value={editForm.partOfSpeech}
                        onChange={(e) => setEditForm({...editForm, partOfSpeech: e.target.value})}
                      >
                        <option value="n/a">n/a</option>
                        <option value="n.">n.</option>
                        <option value="v.">v.</option>
                        <option value="adj.">adj.</option>
                        <option value="adv.">adv.</option>
                        <option value="phr.">phr.</option>
                        <option value="conj.">conj.</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">CEFR 難度分級</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900 font-bold text-slate-600"
                        value={editForm.cefrLevel || 'B2'}
                        onChange={(e) => setEditForm({...editForm, cefrLevel: e.target.value})}
                      >
                        <option value="B2">B2</option>
                        <option value="C1">C1</option>
                        <option value="C2">C2</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">English Definition (英文解釋)</label>
                    <textarea 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium"
                      rows={2}
                      value={editForm.englishDefinition || ''}
                      onChange={(e) => setEditForm({ ...editForm, englishDefinition: e.target.value })}
                      placeholder="簡短英文解釋..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">中文翻譯</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900"
                      value={editForm.translation}
                      onChange={(e) => setEditForm({ ...editForm, translation: e.target.value })}
                      placeholder="中文意思..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">影片原句 (Example Sentence)</label>
                    <textarea 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm italic"
                      rows={3}
                      value={editForm.example}
                      onChange={(e) => setEditForm({ ...editForm, example: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={handleSaveCardEdit}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    💾 儲存修改
                  </button>
                  <button 
                    onClick={() => setIsEditingCard(false)}
                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 整合式自訂對話框 (解決 IFrame 中 native alert / confirm 受限問題) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200" id="custom-dialog-container">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 text-center animate-in scale-in duration-300" id="custom-dialog-card">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6 ${confirmModal.isAlert ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-600'}`} id="custom-dialog-icon">
              {confirmModal.isAlert ? 'ℹ️' : '⚠️'}
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2" id="custom-dialog-title">{confirmModal.title}</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed font-semibold text-center" id="custom-dialog-msg">{confirmModal.message}</p>
            
            <div className="flex gap-3" id="custom-dialog-actions">
              {!confirmModal.isAlert && (
                <button 
                  id="custom-dialog-cancel-btn"
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-sm transition-all active:scale-95"
                >
                  {confirmModal.cancelText || '取消'}
                </button>
              )}
              <button 
                id="custom-dialog-confirm-btn"
                onClick={confirmModal.onConfirm} 
                className={`flex-1 py-3.5 text-white rounded-2xl font-black text-sm transition-all active:scale-95 ${confirmModal.isAlert ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100' : 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-100'}`}
              >
                {confirmModal.confirmText || '確定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
