
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
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-slate-50 rounded-full opacity-50 blur-3xl"></div>
      
      <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
            輸入 YouTube 影片連結
          </label>
          <input
            type="text"
            placeholder="在此貼上 YouTube 網址..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="w-full px-6 py-5 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-slate-900 outline-none transition-all disabled:opacity-50 text-slate-700 font-medium text-lg"
          />
        </div>

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
              <span className="text-lg">AI 正在分析單字...</span>
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
