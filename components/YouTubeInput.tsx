
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
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold mb-4 text-slate-800">1. 匯入 YouTube 影片</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="yt-url" className="block text-sm font-medium text-slate-600 mb-1">
            YouTube 網址
          </label>
          <input
            id="yt-url"
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !url}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              AI 分析中...
            </>
          ) : (
            '產生單字卡'
          )}
        </button>
      </form>
      <p className="mt-3 text-xs text-slate-400">
        * 我們將使用 AI 分析影片內容並提取實用單字
      </p>
    </div>
  );
};

export default YouTubeInput;
