import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env.local"));
  } catch {
    // .env.local is optional
  }
}

// 伺服器端 Supabase client（使用 service role key，可繞過 RLS），用於讀寫共享的影片快取。
// 若未設定 SUPABASE_SERVICE_ROLE_KEY，快取功能會自動停用，不影響其他功能。
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

if (!supabaseAdmin) {
  console.warn("[Server] SUPABASE_SERVICE_ROLE_KEY 未設定，影片快取功能停用。");
}

async function createServer() {
  const app = express();
  app.use(express.json());

  // API route to fetch YouTube transcript and title
  app.get("/api/transcript", async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }

    const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    const videoId = videoIdMatch ? videoIdMatch[1] : videoUrl;
    
    console.log(`[Server] Processing Video ID: ${videoId}`);

    try {
      // 先查共享快取，命中則直接回傳，不消耗 Supadata 額度
      if (supabaseAdmin) {
        const { data: cached } = await supabaseAdmin
          .from('video_cache')
          .select('title, transcript')
          .eq('video_id', videoId)
          .maybeSingle();

        if (cached?.transcript) {
          console.log(`[Server] Cache hit for transcript: ${videoId}`);
          return res.json({
            transcript: cached.transcript,
            title: cached.title || "YouTube Video",
            videoId,
            cached: true,
          });
        }
      }

      const SUPADATA_API_KEY = (req.headers['x-supadata-key'] as string)
        || process.env.SUPADATA_API_KEY;

      if (!SUPADATA_API_KEY) {
        throw new Error("尚未設定 Supadata API Key。請在設定頁面中填入。");
      }

      console.log(`[Server] Fetching data for Video ID: ${videoId}`);

      // Parallelize transcript and title fetching
      const [transcriptResponse, oEmbedResponse] = await Promise.all([
        fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`, {
          headers: { 'x-api-key': SUPADATA_API_KEY }
        }),
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).catch(() => null)
      ]);

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Supadata error: ${errorText}`);
      }

      const transcriptData = await transcriptResponse.json() as { lang?: string; content: { text: string }[] };

      if (!transcriptData || !transcriptData.content) {
        throw new Error("無法取得影片逐字稿，請確認影片是否有字幕。");
      }

      // 只允許英文影片
      const lang = transcriptData.lang || '';
      if (lang && !lang.startsWith('en')) {
        console.log(`[Server] Rejected non-English video: ${videoId} (lang: ${lang})`);
        return res.status(422).json({ error: 'non_english_video', lang });
      }

      const fullText = transcriptData.content.map(item => item.text).join(' ').substring(0, 10000);
      
      let title = "YouTube Video";
      if (oEmbedResponse && oEmbedResponse.ok) {
        const oEmbedData = await oEmbedResponse.json() as { title: string };
        title = oEmbedData.title;
      }

      console.log(`[Server] Success. Transcript length: ${fullText.length}`);

      if (supabaseAdmin) {
        supabaseAdmin
          .from('video_cache')
          .upsert({ video_id: videoId, title, transcript: fullText, updated_at: new Date().toISOString() })
          .then(({ error }) => {
            if (error) console.error("[Server] Failed to cache transcript:", error.message);
          });
      }

      res.json({
        transcript: fullText,
        title: title,
        videoId: videoId
      });
    } catch (error: any) {
      console.error("Transcript error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch transcript." });
    }
  });

  // API route to analyze transcript using Gemini or OpenAI
  app.post("/api/analyze", async (req, res) => {
    const { transcript, title, provider, geminiKey, openaiKey, videoId } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "Missing transcript" });
    }

    // 驗證身份：必須是登入用戶才能呼叫 AI
    const WEEKLY_LIMIT = 3;
    const authHeader = req.headers['authorization'] as string;
    const accessToken = authHeader?.replace('Bearer ', '');
    let userId: string | null = null;

    if (supabaseAdmin && accessToken) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // 先查共享快取，命中則直接回傳，不消耗 Gemini/OpenAI 額度
    if (videoId && supabaseAdmin) {
      const { data: cached } = await supabaseAdmin
        .from('video_cache')
        .select('summary, vocabulary')
        .eq('video_id', videoId)
        .maybeSingle();

      if (cached?.vocabulary) {
        console.log(`[Server] Cache hit for analysis: ${videoId}`);
        return res.json({ summary: cached.summary, vocabulary: cached.vocabulary, cached: true });
      }
    }

    // 額度檢查（只在需要真正呼叫 AI 時才計入）
    if (supabaseAdmin && userId) {
      const now = new Date();
      const day = now.getUTCDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(now);
      weekStart.setUTCDate(now.getUTCDate() - daysFromMonday);
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      const resetDate = new Date(weekStart);
      resetDate.setUTCDate(weekStart.getUTCDate() + 7);
      const resetDateStr = resetDate.toISOString().slice(0, 10);

      const { data: usage } = await supabaseAdmin
        .from('weekly_usage')
        .select('conversion_count, exceeded_attempts')
        .eq('user_id', userId)
        .eq('week_start', weekStartStr)
        .maybeSingle();

      const count = usage?.conversion_count ?? 0;

      if (count >= WEEKLY_LIMIT) {
        await supabaseAdmin.from('weekly_usage').upsert({
          user_id: userId,
          week_start: weekStartStr,
          conversion_count: count,
          exceeded_attempts: (usage?.exceeded_attempts ?? 0) + 1,
        }, { onConflict: 'user_id,week_start' });
        console.log(`[Server] Quota exceeded for user ${userId} (${count}/${WEEKLY_LIMIT})`);
        return res.status(429).json({ error: 'quota_exceeded', resetDate: resetDateStr });
      }

      // 額度扣除
      await supabaseAdmin.from('weekly_usage').upsert({
        user_id: userId,
        week_start: weekStartStr,
        conversion_count: count + 1,
        exceeded_attempts: usage?.exceeded_attempts ?? 0,
      }, { onConflict: 'user_id,week_start' });
      console.log(`[Server] Usage recorded for user ${userId}: ${count + 1}/${WEEKLY_LIMIT}`);
    }

    const systemInstruction = `你是一位專精於 CEFR 分級的資深英語老師。
請根據提供的逐字稿執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量要求：請盡可能找出所有符合難度要求的進階詞彙，不要限制數量。
3. 內容摘要：產生一段約 80 字的繁體中文內容摘要 (summary)。
4. 每個單字包含以下屬性：
   - word: 英文單字或片語
   - level: CEFR 難度分級 (B2, C1, C2)
   - english_definition: 簡短的英文解釋/定義 (2-12個英文單字)
   - chinese_translation: 精準的繁體中文翻譯
   - sentence: 影片中含有此單字的原句 (影片原句)

輸出規範：嚴格 JSON 格式。
範例格式：
{
  "summary": "...",
  "vocabulary": [
    { "word": "resilience", "level": "C1", "english_definition": "the capacity to recover quickly from difficulties", "chinese_translation": "彈性，復原力，韌性", "sentence": "Some people show incredible resilience in times of crisis." }
  ]
}`;

    const truncatedTranscript = transcript.substring(0, 8000);
    const userPrompt = `影片標題：${title || "YouTube Video"}\n逐字稿內容：\n---\n${truncatedTranscript}\n---`;

    const cacheVocabulary = (parsed: { summary: string; vocabulary: unknown }) => {
      if (videoId && supabaseAdmin) {
        supabaseAdmin
          .from('video_cache')
          .upsert({ video_id: videoId, summary: parsed.summary, vocabulary: parsed.vocabulary, updated_at: new Date().toISOString() })
          .then(({ error }) => {
            if (error) console.error("[Server] Failed to cache analysis:", error.message);
          });
      }
    };

    if (provider === 'openai') {
      const apiKey = openaiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "尚未設定 OpenAI API Key。請在設定頁面中填寫。" });
      }
      const openai = new OpenAI({ apiKey });
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" }
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("OpenAI 沒有返回任何內容。");
        const parsed = JSON.parse(content);
        cacheVocabulary(parsed);
        return res.json(parsed);
      } catch (error: any) {
        console.error("OpenAI server error:", error);
        return res.status(500).json({ error: `OpenAI 分析失敗: ${error.message}` });
      }
    } else {
      // Gemini
      const apiKey = geminiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "尚未設定 Gemini API Key。請在設定頁面中填寫。" });
      }
      const ai = new GoogleGenAI({ apiKey });
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
          },
        });
        const content = response.text;
        if (!content) throw new Error("Gemini 沒有返回任何內容。");
        const parsed = JSON.parse(content);
        cacheVocabulary(parsed);
        return res.json(parsed);
      } catch (error: any) {
        console.error("Gemini server error:", error);
        return res.status(500).json({ error: `Gemini 分析失敗: ${error.message}` });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    const distPath = path.resolve(__dirname, "../dist");
    app.use(express.static(distPath));
    
  }

  return app;
}

const appPromise = createServer();

// For local development
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  appPromise.then(app => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
}

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
