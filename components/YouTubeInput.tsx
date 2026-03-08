
import React, { useState } from 'react';

interface YouTubeInputProps {
  onProcess: (url: string) => void;
  isLoading: boolean;
  loadingStep: 'idle' | 'fetching' | 'analyzing';
  aiProvider: 'gemini' | 'openai';
}

const YouTubeInput: React.FC<YouTubeInputProps> = ({ onProcess, isLoading, loadingStep, aiProvider }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onProcess(url);
    }
  };

  const getLoadingMessage = () => {
    if (loadingStep === 'fetching') return "正在抓取影片逐字稿...";
    if (loadingStep === 'analyzing') {
      const aiName = aiProvider === 'gemini' ? 'Gemini' : 'ChatGPT';
      return `正在使用 ${aiName} 精選單字...`;
    }
    return "AI 正在分析...";
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-8 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-slate-50 rounded-full opacity-50 blur-3xl"></div>
      
      <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
        <div className="flex justify-between items-end">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
            輸入 YouTube 影片連結
          </label>
          <div className={`mb-3 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter flex items-center gap-1.5 ${aiProvider === 'gemini' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${aiProvider === 'gemini' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`}></div>
            {aiProvider === 'gemini' ? 'Gemini Active' : 'ChatGPT Active'}
          </div>
        </div>
        <input
          type="text"
          placeholder="在此貼上 YouTube 網址..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
          className="w-full px-6 py-5 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-slate-900 outline-none transition-all disabled:opacity-50 text-slate-700 font-medium text-lg"
        />

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className={`w-full py-5 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] ${isLoading || !url.trim() ? 'bg-slate-200 text-slate-400 shadow-none' : 'bg-slate-900 hover:bg-black shadow-slate-100'}`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-lg">{getLoadingMessage()}</span>
            </>
          ) : (
            <span className="text-lg">產生單字卡</span>
          )}
        </button>
      </form>
      
      <p className="mt-5 text-center text-[11px] text-slate-400 font-medium leading-relaxed">
        系統使用高級推理模型，能更精準地抓取影片中的關鍵詞彙與語境。<br/>
        分析過程約需 5-10 秒，請保持網頁開啟。
      </p>
    </div>
  );
};

export default YouTubeInput;
