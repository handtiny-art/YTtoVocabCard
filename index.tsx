// 在檔案最上方加入這一行，把 Supabase 引入進來
import { createClient } from '@supabase/supabase-js';

// 填入你的 Supabase 專案資訊
const SUPABASE_URL = '你的_SUPABASE_URL';
const SUPABASE_ANON_KEY = '你的_SUPABASE_ANON_KEY';

// 建立 supabase 連線客戶端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
