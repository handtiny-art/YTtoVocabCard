
import React, { useState } from 'react';

interface YouTubeInputProps {
  onProcess: (url: string) => void;
  isLoading: boolean;
}

const YouTubeInput: React.FC<YouTubeInputProps> = ({ onProcess, isLoading }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onProcess(url);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-8 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
      {/* 裝飾背景 */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-indigo-50 rounded-full opacity-50 blur-3xl"></div>
      
      <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
        <div>
          <div className="flex justify-between items-end mb-3 ml-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
              YouTube Video URL
            </label>
            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">一鍵 AI 自動抓取</span>
          </div>
          <input
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="w-full px-6 py-5 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none transition-all disabled:opacity-50 text-slate-700 font-medium"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 disabled:bg-slate-100 disabled:text-slate-300 shadow-lg shadow-indigo-100 active:scale-[0.98]"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-lg">AI 正在抓取內容並分析中...</span>
            </>
          ) : (
            <>
              <span className="text-lg">立即分析並製作單字卡</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </>
          )}
        </button>
      </form>
      
      <p className="mt-5 text-center text-[11px] text-slate-400 font-medium leading-relaxed">
        AI 會自動抓取該影片的逐字稿與摘要，<br/>
        並為您挑選最值得學習的 10 個核心單字。
      </p>
    </div>
  );
};

export default YouTubeInput;
