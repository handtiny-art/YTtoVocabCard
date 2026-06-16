import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { translations, LocaleType } from '../locale';

interface FeedbackModalProps {
  userId: string;
  locale: LocaleType;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ userId, locale, onClose }) => {
  const t = translations[locale];
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const handleSubmit = async () => {
    if (rating === 0) return;
    setStatus('submitting');
    await supabase.from('feedback').insert({ user_id: userId, rating, comment: comment.trim() || null });
    setStatus('done');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-300">
        {status === 'done' ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🙏</div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.feedbackThanks}</h3>
            <p className="text-slate-500 text-sm mb-8">{t.feedbackThanksDetail}</p>
            <button onClick={onClose} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black">{t.okBtn}</button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-800">{t.feedbackTitle}</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="text-slate-500 text-sm mb-6">{t.feedbackSubtitle}</p>

            {/* 星星評分 */}
            <div className="flex justify-center gap-3 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="text-4xl transition-transform active:scale-90 hover:scale-110"
                >
                  {star <= (hovered || rating) ? '⭐' : '☆'}
                </button>
              ))}
            </div>

            {/* 文字留言 */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t.feedbackPlaceholder}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-slate-900 outline-none transition-all resize-none text-slate-700 text-sm mb-6"
            />

            <button
              onClick={handleSubmit}
              disabled={rating === 0 || status === 'submitting'}
              className={`w-full py-4 rounded-2xl font-black text-base transition-all ${rating === 0 || status === 'submitting' ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white active:scale-95'}`}
            >
              {status === 'submitting' ? '送出中...' : t.feedbackSubmit}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
