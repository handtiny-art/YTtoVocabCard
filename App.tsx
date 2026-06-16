
import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Flashcard, VideoSet } from './types';
import YouTubeInput from './components/YouTubeInput';
import FlashcardItem from './components/FlashcardItem';
import { AppLogo } from './components/AppLogo';
import AdBanner from './components/AdBanner';
import FeedbackModal from './components/FeedbackModal';
import { fetchTranscript, analyzeTranscript } from './services/vocabService';
import { translations, LocaleType } from './locale';
import { speakWord } from './utils/speech';
import { supabase } from './services/supabaseClient';
import * as dataService from './services/dataService';
import { REQUIRE_USER_API_KEY } from './config';

const App: React.FC = () => {
  const [locale, setLocale] = useState<LocaleType>(() => {
    return (localStorage.getItem('vocab_master_lang') as LocaleType) || 'zh';
  });

  const t = translations[locale];

  const [videoSets, setVideoSets] = useState<VideoSet[]>([]);

  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);

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
  const [showFeedback, setShowFeedback] = useState(false);
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

  useEffect(() => {
    localStorage.setItem('vocab_master_lang', locale);
  }, [locale]);

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void, confirmText = t.confirm, cancelText = t.cancel) => {
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

  const showCustomAlert = (title: string, message: string, onConfirmAction?: () => void, confirmText = t.confirm) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      onConfirm: () => {
        if (onConfirmAction) onConfirmAction();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      isAlert: true
    });
  };

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    return match ? match[1] : url;
  };

  const handleOpenCard = (card: Flashcard) => {
    setSelectedCard(card);
    setEditForm({ ...card });
    setIsEditingCard(false);
  };

  const handleSaveCardEdit = async () => {
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

    try {
      await dataService.updateCard(editForm);
    } catch (error: any) {
      showCustomAlert(t.syncErrorTitle, error.message || t.syncErrorDetail);
    }
  };

  const setApiKeyIntoGlobal = (key: string) => {
    if (!key) return;
    if (!(window as any).process) (window as any).process = { env: {} };
    if (!(window as any).process.env) (window as any).process.env = {};
    (window as any).process.env.API_KEY = key;
  };

  useEffect(() => {
    if (currentKey) setApiKeyIntoGlobal(currentKey);
  }, [currentKey]);

  // 監聽登入狀態：啟動時取得現有 session，並訂閱後續變化
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 登入後從 Supabase 載入該用戶的單字收藏
  useEffect(() => {
    if (!session) {
      setVideoSets([]);
      return;
    }

    setIsDataLoading(true);
    dataService.fetchVideoSets(session.user.id)
      .then(sets => setVideoSets(sets))
      .catch(() => showCustomAlert(t.loadDataErrorTitle, t.loadDataErrorDetail))
      .finally(() => setIsDataLoading(false));
  }, [session]);

  const handleSignIn = async () => {
    try {
      await dataService.signInWithGoogle();
    } catch (error: any) {
      showCustomAlert(t.signInErrorTitle, error.message || t.signInErrorDetail);
    }
  };

  const handleSignOut = async () => {
    await dataService.signOut();
    setView('home');
    setCurrentSetId(null);
  };

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
      message += locale === 'zh' ? "Gemini API 金鑰已變更\n" : "Gemini API Key updated\n";
    }

    // OpenAI Key
    if (cleanOpenaiKey !== openaiKey) {
      setOpenaiKey(cleanOpenaiKey);
      localStorage.setItem('VOCAB_MASTER_OPENAI_KEY', cleanOpenaiKey);
      message += locale === 'zh' ? "OpenAI API 金鑰已變更\n" : "OpenAI API Key updated\n";
    }

    // Supadata Key
    if (cleanSupadataKey !== supadataKey) {
      setSupadataKey(cleanSupadataKey);
      localStorage.setItem('VOCAB_MASTER_SUPADATA_KEY', cleanSupadataKey);
      message += locale === 'zh' ? "Supadata API 金鑰已變更\n" : "Supadata API Key updated\n";
    }

    // 關閉設定與數據中心彈窗
    setShowConfig(false);

    // 顯示自定義設定成功提示
    const alertBody = message ? `${message}\n${t.settingsSavedDetail}` : t.settingsSavedDetail;
    showCustomAlert(t.settingsSaved, alertBody);
  };

  const [loadingStep, setLoadingStep] = useState<'idle' | 'fetching' | 'analyzing'>('idle');

  const handleProcessVideo = async (url: string) => {
    if (!session) return;

    // 若使用者自己已經轉換過同一支影片，直接跳到舊的單字卡組，避免重複轉換
    const videoId = extractVideoId(url);
    const existingSet = videoSets.find(s => extractVideoId(s.url) === videoId);
    if (existingSet) {
      showCustomAlert(t.alreadyConvertedTitle, t.alreadyConvertedDetail, () => {
        setCurrentSetId(existingSet.id);
        setView('setDetail');
      }, t.okBtn);
      return;
    }

    setIsLoading(true);
    setLoadingStep('fetching');

    try {
      // 階段 1: 獲取逐字稿
      const { transcript, detectedTitle, videoId } = await fetchTranscript(url, supadataKey);

      setLoadingStep('analyzing');

      // 階段 2: AI 分析
      const { summary, cards } = await analyzeTranscript(transcript, detectedTitle, {
        provider: aiProvider,
        geminiKey: currentKey,
        openaiKey: openaiKey,
        videoId,
        accessToken: session.access_token
      });

      // 階段 3: 寫入 Supabase（video_sets + flashcards）
      const newSet = await dataService.createVideoSet(session.user.id, {
        url,
        title: detectedTitle,
        transcript: summary,
        cards
      });

      setVideoSets(prev => [newSet, ...prev]);
      setCurrentSetId(newSet.id);
      setView('setDetail');
    } catch (error: any) {
      if (error.message === 'quota_exceeded') {
        const resetDate = error.resetDate
          ? new Date(error.resetDate).toLocaleDateString(locale === 'zh' ? 'zh-TW' : 'en-US', { month: 'long', day: 'numeric' })
          : '';
        showCustomAlert(t.quotaExceededTitle, t.quotaExceededDetail(resetDate), undefined, t.okBtn);
      } else if (error.message === 'non_english_video') {
        showCustomAlert(t.nonEnglishTitle, t.nonEnglishDetail, undefined, t.okBtn);
      } else {
        showCustomAlert(t.analyzeFailed, error.message || t.analyzeFailedDetail);
      }
    } finally {
      setIsLoading(false);
      setLoadingStep('idle');
    }
  };

  const addManualCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !currentSetId || !manualWord.word || !manualWord.trans) return;

    try {
      const newCard = await dataService.insertCard(session.user.id, currentSetId, {
        word: manualWord.word,
        partOfSpeech: manualWord.pos,
        translation: manualWord.trans,
        example: manualWord.example || (locale === 'zh' ? '使用者手動新增的單字' : 'Manually added word'),
        status: 'new',
        englishDefinition: manualWord.englishDefinition || ''
      });

      setVideoSets(prev => prev.map(set => {
        if (set.id === currentSetId) {
          return { ...set, cards: [...set.cards, newCard] };
        }
        return set;
      }));

      setManualWord({ word: '', pos: 'n.', trans: '', example: '', englishDefinition: '' });
      setShowManualForm(false);
    } catch (error: any) {
      showCustomAlert(t.syncErrorTitle, error.message || t.syncErrorDetail);
    }
  };

  const updateCardStatus = async (setId: string, cardId: string, status: 'learning' | 'learned') => {
    const targetSet = videoSets.find(s => s.id === setId);
    const targetCard = targetSet?.cards.find(c => c.id === cardId);
    if (!targetCard) return;

    setVideoSets(prev => prev.map(set => {
      if (set.id === setId) {
        return {
          ...set,
          cards: set.cards.map(card => card.id === cardId ? { ...card, status } : card)
        };
      }
      return set;
    }));

    try {
      await dataService.updateCard({ ...targetCard, status });
    } catch (error: any) {
      showCustomAlert(t.syncErrorTitle, error.message || t.syncErrorDetail);
    }
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
      showCustomAlert(t.reviewHint, t.noWordsToReview);
      return;
    }
    setCurrentSetId(setId);
    setActiveCards(cardsToReview);
    setCurrentIndex(0);
    setView('learning');
  };

  const deleteSet = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    showCustomConfirm(t.deleteSetTitle, t.deleteSetConfirm, async () => {
      setVideoSets(prev => prev.filter(s => s.id !== setId));
      try {
        await dataService.deleteVideoSet(setId);
      } catch (error: any) {
        showCustomAlert(t.syncErrorTitle, error.message || t.syncErrorDetail);
      }
    });
  };

  const handleDeleteCard = (cardId: string, confirmRequired = true) => {
    if (!currentSetId) return;

    const performDeletion = async () => {
      setVideoSets(prev => prev.map(set => {
        if (set.id === currentSetId) {
          return {
            ...set,
            cards: set.cards.filter(c => c.id !== cardId)
          };
        }
        return set;
      }));

      try {
        await dataService.deleteCard(cardId);
      } catch (error: any) {
        showCustomAlert(t.syncErrorTitle, error.message || t.syncErrorDetail);
      }
    };

    if (confirmRequired) {
      showCustomConfirm(t.deleteCardTitle, t.deleteCardConfirm, performDeletion);
    } else {
      performDeletion();
    }
  };

  // 數據管理功能（僅供本地匯出備份）
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
      showCustomAlert(t.copiedTitle, t.copiedDetail);
    });
  };

  const currentSet = videoSets.find(s => s.id === currentSetId);

  if (isAuthLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">{t.loading}</div>;

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl text-center">
          <AppLogo size={56} className="shadow-md mx-auto mb-6" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">{t.loginTitle}</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">{t.loginSubtitle}</p>
          <button
            onClick={handleSignIn}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-lg shadow-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            🔐 {t.signInWithGoogleBtn}
          </button>
          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-black"
          >
            🌐 {locale === 'zh' ? 'English' : '繁中'}
          </button>
        </div>
      </div>
    );
  }

  if (isDataLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">{t.loading}</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 px-4 pt-8 md:pt-12 relative animate-in fade-in duration-300">
      {/* 意見回饋彈窗 */}
      {showFeedback && session?.user && (
        <FeedbackModal userId={session.user.id} locale={locale} onClose={() => setShowFeedback(false)} />
      )}

      {/* 設定與數據中心彈窗 */}
      {showConfig && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowConfig(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center transition-all">✕</button>
            
            <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
              <AppLogo size={36} className="shadow-sm" />
              {t.configTitle}
            </h3>

            {/* AI 狀態與金鑰區塊（僅在允許使用者自填 API Key 時顯示） */}
            {REQUIRE_USER_API_KEY && (
            <div className="mb-10 space-y-6">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-6">
                <button 
                  onClick={() => {
                    setAiProvider('gemini');
                    localStorage.setItem('VOCAB_MASTER_AI_PROVIDER', 'gemini');
                  }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${aiProvider === 'gemini' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {t.defaultGemini}
                </button>
                <button 
                  onClick={() => {
                    setAiProvider('openai');
                    localStorage.setItem('VOCAB_MASTER_AI_PROVIDER', 'openai');
                  }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${aiProvider === 'openai' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {t.chatGpt}
                </button>
              </div>

              <form onSubmit={handleSaveKey} className="space-y-6">
                {aiProvider === 'gemini' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t.geminiKeyLabel}</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"}
                        placeholder={locale === 'zh' ? "貼上 Gemini API Key..." : "Paste Gemini API Key..."}
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
                    <p className="mt-2 text-[10px] text-slate-400 ml-1">
                      {locale === 'zh' ? (
                        <>註：若留空則使用系統預設免費額度此處為選填。請至 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-emerald-500 underline font-bold">AI Studio</a> 申請</>
                      ) : (
                        <>Note: Leave blank to use system default free limits. Obtain keys from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-emerald-500 underline font-bold">AI Studio</a></>
                      )}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t.openaiKeyLabel}</label>
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
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-605"
                      >
                        {showOpenaiKey ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400 ml-1">
                      {locale === 'zh' ? (
                        <>註：使用 ChatGPT 可以選填此 API Key，留空則嘗試以伺服器預設對接。請至 <a href="https://platform.openai.com/api-keys" target="_blank" className="text-blue-500 underline font-bold">OpenAI Platform</a> 申請</>
                      ) : (
                        <>Note: Leave blank to attempt using system default proxy. Obtain keys from <a href="https://platform.openai.com/api-keys" target="_blank" className="text-blue-500 underline font-bold">OpenAI Platform</a></>
                      )}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t.supadataKeyLabel}</label>
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
                  <p className="mt-2 text-[10px] text-slate-400 ml-1">
                    {locale === 'zh' ? (
                      <>註：請至 <a href="https://supadata.ai" target="_blank" className="text-emerald-500 underline font-bold">supadata.ai</a> 申請免費 Key</>
                    ) : (
                      <>Note: Register at <a href="https://supadata.ai" target="_blank" className="text-emerald-500 underline font-bold">supadata.ai</a> to get a free key</>
                    )}
                  </p>
                </div>

                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold active:scale-95 transition-all shadow-lg shadow-slate-100">{t.saveSettings}</button>
              </form>
            </div>
            )}

            <div className="h-px bg-slate-100 mb-8" />

            {/* 匯出備份區塊 */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t.backupLabel}</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={copyDataToClipboard} className="py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-100 transition-all border border-indigo-100">{t.copyDataCode}</button>
                <button onClick={exportAsFile} className="py-4 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all border border-slate-200">{t.downloadJson}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
        <div className="cursor-pointer flex items-center gap-3.5" onClick={() => setView('home')}>
          <AppLogo size={46} className="shadow-md hover:scale-[1.03] active:scale-95 transition-all" />
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              YTtoVocab
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-slate-500 text-sm">{t.subtitle}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {videoSets.length > 0 && <span className="hidden md:inline text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest">{t.autosaved}</span>}
          <button 
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} 
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-sm flex items-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
            title={locale === 'zh' ? 'Switch to English' : '切換至繁中'}
          >
            🌐 {locale === 'zh' ? 'English' : '繁中'}
          </button>
          <button onClick={() => setShowFeedback(true)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all">
            💬 {t.feedbackBtn}
          </button>
          <button onClick={() => setShowConfig(true)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-all">
            {t.settings}
          </button>
          {view !== 'home' && <button onClick={() => setView('home')} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold border border-indigo-100 transition-all active:scale-95">{t.backHome}</button>}
          <button onClick={handleSignOut} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-sm font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all" title={session?.user?.email || ''}>
            {t.signOutBtn}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="space-y-12">
            <YouTubeInput onProcess={handleProcessVideo} isLoading={isLoading} loadingStep={loadingStep} aiProvider={aiProvider} locale={locale} />
            {isLoading && (
              <AdBanner slot={import.meta.env.VITE_ADSENSE_SLOT_LOADING || ''} />
            )}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">{t.myCollections} ({videoSets.length})</h2>
              {videoSets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-400 font-medium">
                  {t.emptyCollections}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videoSets.map((set) => (
                    <React.Fragment key={set.id}>
                    <div onClick={() => { setCurrentSetId(set.id); setView('setDetail'); }} className="group bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:translate-y-[-4px] transition-all cursor-pointer relative">
                      <button onClick={(e) => deleteSet(e, set.id)} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 p-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <h3 className="font-bold text-slate-800 mb-3 line-clamp-2 pr-10 text-lg leading-snug">{set.title}</h3>
                      <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-widest font-black">{new Date(set.createdAt).toLocaleDateString()} {t.updated}</p>
                      <div className="flex gap-2">
                        <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-wider">{set.cards.length} {t.wordsCount}</span>
                        <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-wider">{t.progress}: {set.cards.filter(c => c.status === 'learned').length} / {set.cards.length}</span>
                      </div>
                    </div>
                    </React.Fragment>
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
                <button onClick={() => startLearning(currentSet.id, 'all')} className="py-5 bg-slate-900 text-white rounded-2xl font-black shadow-lg shadow-slate-200 active:scale-95 transition-all text-lg">{t.reviewAll}</button>
                <button onClick={() => startLearning(currentSet.id, 'learning')} className="py-5 rounded-2xl font-black border-2 border-indigo-100 bg-white text-indigo-600 active:scale-95 transition-all text-lg">{t.reviewLearning}</button>
              </div>
            </div>

            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
              {!showManualForm ? (
                <button 
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-xl">+</span> {t.addManualBtn}
                </button>
              ) : (
                <form onSubmit={addManualCard} className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input 
                      className="col-span-2 px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder={t.wordPlaceholder}
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
                    placeholder={t.englishDefPlaceholder}
                    value={manualWord.englishDefinition}
                    onChange={e => setManualWord({...manualWord, englishDefinition: e.target.value})}
                  />
                  <input 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={t.chineseTransPlaceholder}
                    value={manualWord.trans}
                    onChange={e => setManualWord({...manualWord, trans: e.target.value})}
                    required
                  />
                  <textarea 
                    className="w-full px-4 py-3 rounded-xl border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder={t.examplePlaceholder}
                    rows={2}
                    value={manualWord.example}
                    onChange={e => setManualWord({...manualWord, example: e.target.value})}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100">{t.saveBtn}</button>
                    <button type="button" onClick={() => setShowManualForm(false)} className="px-6 py-3 bg-white text-slate-400 rounded-xl font-bold border border-slate-200">{t.cancel}</button>
                  </div>
                </form>
              )}
            </div>
            
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 ml-1">{t.wordListHeader}</h3>
              <div className="divide-y divide-slate-100">
                {currentSet.cards.map(card => (
                  <div 
                    key={card.id} 
                    onClick={() => handleOpenCard(card)}
                    className="py-4 px-4 -mx-4 rounded-2xl flex justify-between items-center group hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{card.word}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakWord(card.word);
                          }}
                          className="p-1 px-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all active:scale-90"
                          title={t.pronounceTooltip}
                        >
                          🔊
                        </button>
                        {card.partOfSpeech && card.partOfSpeech !== 'n/a' && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-black uppercase">{card.partOfSpeech}</span>
                        )}
                        {card.cefrLevel && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase">{card.cefrLevel}</span>
                        )}
                        {card.id.startsWith('manual-') && <span className="text-[8px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">{t.customBadge}</span>}
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
                        {card.status === 'learned' ? t.learnedBadge : t.learningBadge}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCard(card.id);
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title={t.deleteCardTooltip}
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
            <FlashcardItem key={activeCards[currentIndex].id} card={activeCards[currentIndex]} onSwipeRight={() => handleSwipe('learned')} onSwipeLeft={() => handleSwipe('learning')} locale={locale} />
          </div>
        )}

        {view === 'summary' && (
          <div className="bg-white p-16 rounded-[3rem] shadow-2xl border border-slate-50 text-center max-w-lg mx-auto animate-in zoom-in duration-500">
            <div className="w-28 h-28 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center text-5xl mx-auto mb-10 shadow-2xl transform -rotate-6">🏆</div>
            <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">{t.sessionFinished}</h2>
            <p className="text-slate-500 mb-10 leading-relaxed font-medium text-lg">
              {t.sessionQuote.split('\n').map((line, idx) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < t.sessionQuote.split('\n').length - 1 && <br/>}
                </React.Fragment>
              ))}
            </p>
            <AdBanner slot={import.meta.env.VITE_ADSENSE_SLOT_REVIEW || ''} className="mb-8 rounded-2xl overflow-hidden" />
            <button onClick={() => setView('setDetail')} className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black text-xl shadow-xl shadow-slate-200 active:scale-95 transition-all">
              {t.backToListBtn}
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
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] block mb-2">{t.wordContentHeader}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-black text-slate-950">{selectedCard.word}</h2>
                    <button 
                      type="button"
                      onClick={() => speakWord(selectedCard.word)}
                      className="w-8 h-8 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm transition-all active:scale-95 shadow-sm"
                      title={t.pronounceTooltip}
                    >
                      🔊
                    </button>
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
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{t.englishDefinitionHeader}</p>
                      <p className="text-slate-700 font-semibold leading-relaxed">{selectedCard.englishDefinition}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{t.chineseTranslationHeader}</p>
                    <p className="text-slate-950 text-lg font-bold">{selectedCard.translation}</p>
                  </div>
                </div>

                {selectedCard.example && (
                  <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/30">
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1.5">{t.contextSentenceHeader}</p>
                    <p className="text-indigo-900 italic font-medium">"{selectedCard.example}"</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button 
                    onClick={() => setIsEditingCard(true)}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-lg hover:bg-slate-850 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {t.editCardBtn}
                  </button>
                  <button 
                    onClick={() => {
                      showCustomConfirm(t.deleteCardTitle, t.deleteCardConfirm, () => {
                        handleDeleteCard(selectedCard.id, false);
                        setSelectedCard(null);
                        setEditForm(null);
                      });
                    }}
                    className="py-4 px-5 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black active:scale-95 transition-all flex items-center justify-center gap-2"
                    title={t.deleteCardTooltip}
                  >
                    {t.deleteCardBtn}
                  </button>
                  <button 
                    onClick={() => { setSelectedCard(null); setEditForm(null); }}
                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all"
                  >
                    {t.close}
                  </button>
                </div>
              </div>
            ) : (
              /* 編輯視圖 */
              <div className="space-y-6">
                <h3 className="text-xl font-black text-slate-900 mb-2">{t.editCardBtn}</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.wordLabel}</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900"
                      value={editForm.word}
                      onChange={(e) => setEditForm({ ...editForm, word: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.posLabel}</label>
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
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.difficultyLabel}</label>
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
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.englishDefinitionHeader}</label>
                    <textarea 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium"
                      rows={2}
                      value={editForm.englishDefinition || ''}
                      onChange={(e) => setEditForm({ ...editForm, englishDefinition: e.target.value })}
                      placeholder="e.g. The ability to recover quickly from difficulties."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.chineseTranslationHeader}</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900"
                      value={editForm.translation}
                      onChange={(e) => setEditForm({ ...editForm, translation: e.target.value })}
                      placeholder="..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t.exampleSentenceLabel}</label>
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
                    💾 {t.saveChangesBtn}
                  </button>
                  <button 
                    onClick={() => setIsEditingCard(false)}
                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-all"
                  >
                    {t.cancel}
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
