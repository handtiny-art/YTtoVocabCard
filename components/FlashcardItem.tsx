
import React, { useState, useRef } from 'react';
import { Flashcard } from '../types';
import { translations } from '../locale';
import { speakWord } from '../utils/speech';

interface FlashcardItemProps {
  card: Flashcard;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  locale?: 'zh' | 'en';
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({ card, onSwipeRight, onSwipeLeft, locale = 'zh' }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const touchStartX = useRef<number | null>(null);
  const t = translations[locale];

  const handleSwipe = (direction: 'left' | 'right') => {
    setSwipeDir(direction);
    setTimeout(() => {
      if (direction === 'right') onSwipeRight();
      else onSwipeLeft();
      setSwipeDir(null);
      setIsFlipped(false);
    }, 400);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;
    
    if (Math.abs(diff) > 100) {
      if (diff > 0) handleSwipe('right');
      else handleSwipe('left');
    }
    touchStartX.current = null;
  };

  return (
    <div 
      className={`relative w-full max-w-sm aspect-[3/4] transition-all duration-500 transform 
        ${swipeDir === 'right' ? 'translate-x-[150%] rotate-45 opacity-0' : ''}
        ${swipeDir === 'left' ? '-translate-x-[150%] -rotate-45 opacity-0' : ''}
        perspective-1000 touch-none`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        className={`relative w-full h-full transition-transform duration-700 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
      >
        {/* Front */}
        <div className="absolute inset-0 bg-white rounded-3xl shadow-xl border-2 border-slate-100 flex flex-col items-center justify-center p-8 backface-hidden">
          <div className="flex flex-col items-center">
            {card.cefrLevel && (
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-md mb-2 uppercase tracking-wider border border-indigo-100">
                {card.cefrLevel}
              </span>
            )}
            <span className="text-indigo-500 font-black mb-4 uppercase tracking-[0.3em] text-[10px]">{t.cardLabel}</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-800 text-center break-words">{card.word}</h1>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); speakWord(card.word); }}
            className="mt-3 w-10 h-10 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 text-indigo-600 rounded-full flex items-center justify-center text-lg transition-all active:scale-95 hover:scale-105 shadow-sm"
            title={t.pronounceTooltip}
          >
            🔊
          </button>
          {card.phonetic && (
            <p className="mt-2 text-slate-400 font-mono text-sm">{card.phonetic}</p>
          )}
          <div className="mt-8 flex items-center gap-2 text-slate-300">
            <svg className="w-4 h-4 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16l-4-4m0 0l4-4m-4 4h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="text-[10px] font-bold uppercase tracking-widest">{t.swipeTip}</p>
            <svg className="w-4 h-4 animate-bounce-x-rev" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 bg-indigo-600 rounded-3xl shadow-xl border-2 border-indigo-400 flex flex-col items-center justify-center p-8 backface-hidden rotate-y-180">
          <div className="w-full h-full flex flex-col justify-between">
            <div className="text-center">
              <div className="flex flex-col items-center gap-1 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-white font-black text-xl italic tracking-tight">{card.word}</span>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); speakWord(card.word); }}
                    className="w-8 h-8 bg-white/10 hover:bg-white/25 border border-white/20 text-white rounded-full flex items-center justify-center text-sm transition-all active:scale-95 hover:scale-105 shadow-sm"
                    title={t.pronounceTooltip}
                  >
                    🔊
                  </button>
                </div>
                <div className="flex justify-center gap-2 mt-1">
                  {card.partOfSpeech && card.partOfSpeech !== 'n/a' && (
                    <span className="inline-block px-3 py-1 bg-white/25 text-white text-[10px] font-black rounded-full uppercase tracking-wider">
                      {card.partOfSpeech}
                    </span>
                  )}
                  {card.cefrLevel && (
                    <span className="inline-block px-3 py-1 bg-white/40 text-white text-[10px] font-black rounded-full uppercase tracking-wider">
                      {card.cefrLevel}
                    </span>
                  )}
                </div>
              </div>
              {card.englishDefinition ? (
                <div className="mb-4">
                  <p className="text-white/80 text-xs font-black uppercase tracking-widest mb-1.5">{t.definitionLabel}</p>
                  <p className="text-white text-base font-semibold leading-relaxed max-w-[280px] text-center mx-auto mb-3">
                    {card.englishDefinition}
                  </p>
                  <div className="w-12 h-px bg-white/20 mx-auto my-3" />
                  <p className="text-white/80 text-xs font-black uppercase tracking-widest mb-1">{t.translationLabel}</p>
                  <h2 className="text-2xl font-black text-white text-center">{card.translation}</h2>
                </div>
              ) : (
                <>
                  <h2 className="text-3xl font-bold text-white mb-2">{card.translation}</h2>
                </>
              )}
              {card.phonetic && <p className="text-white/60 font-mono text-xs">{card.phonetic}</p>}
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm p-5 rounded-2xl border border-white/20">
              <p className="text-[9px] text-white/50 font-black mb-2 uppercase tracking-[0.2em]">{t.contextLabel}</p>
              <p className="text-white italic leading-relaxed text-sm font-medium">"{card.example}"</p>
            </div>

            <p className="text-center text-white/40 text-[10px] font-bold uppercase tracking-widest mt-4">{t.clickTip}</p>
          </div>
        </div>
      </div>

      {/* Swipe Actions */}
      <div className="absolute -bottom-24 left-0 right-0 flex justify-between gap-4">
        <button 
          onClick={(e) => { e.stopPropagation(); handleSwipe('left'); }}
          className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black flex flex-col items-center justify-center active:scale-95 transition-all shadow-sm group hover:border-amber-200 hover:text-amber-500"
        >
          <span className="text-xs mb-1 group-hover:-translate-x-1 transition-transform">←</span>
          <span className="text-[10px] uppercase">{t.swipeLearning}</span>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleSwipe('right'); }}
          className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black flex flex-col items-center justify-center active:scale-95 transition-all shadow-lg shadow-indigo-100 group"
        >
          <span className="text-xs mb-1 group-hover:translate-x-1 transition-transform">→</span>
          <span className="text-[10px] uppercase">{t.swipeLearned}</span>
        </button>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .backface-hidden { backface-visibility: hidden; }
        .transform-style-3d { transform-style: preserve-3d; }
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes bounce-x {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-5px); }
        }
        @keyframes bounce-x-rev {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(5px); }
        }
        .animate-bounce-x { animation: bounce-x 1s infinite; }
        .animate-bounce-x-rev { animation: bounce-x-rev 1s infinite; }
      `}</style>
    </div>
  );
};

export default FlashcardItem;
