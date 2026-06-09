import { createClient } from '@supabase/supabase-js';

// 這裡會自動讀取你 Vercel 後台設定的環境變數，不需要把 Key 死寫在程式碼裡，非常安全！
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
