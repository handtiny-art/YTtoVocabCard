
import { GoogleGenAI } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

/**
 * 第一階段：從前端直接呼叫 Supadata (避開 Vercel 10s 限制)
 */
export const fetchTranscript = async (url: string, supadataKey?: string): Promise<{ transcript: string, detectedTitle: string, videoId: string }> => {
  console.log("[VocabService] 階段 1: 正在從瀏覽器直接獲取逐字稿...");
  
  if (!supadataKey) {
    throw new Error("❌ 尚未設定 Supadata API Key。請點擊右上角「⚙️ 設定」填寫。");
  }

  const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  const videoId = videoIdMatch ? videoIdMatch[1] : url;

  try {
    // 1. 獲取標題 (使用 YouTube 公開的 oEmbed API，無 CORS 問題)
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const titleRes = await fetch(oEmbedUrl).catch(() => null);
    let detectedTitle = "YouTube Video";
    if (titleRes && titleRes.ok) {
      const titleData = await titleRes.json();
      detectedTitle = titleData.title;
    }

    // 2. 獲取逐字稿 (直接呼叫 Supadata)
    const response = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: {
        'x-api-key': supadataKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supadata 錯誤: ${errorText || response.statusText}`);
    }

    const data = await response.json();
    if (!data.content || !Array.isArray(data.content)) {
      throw new Error("無法取得影片逐字稿內容。");
    }

    const fullText = data.content.map((item: any) => item.text).join(' ');

    return {
      transcript: fullText,
      detectedTitle,
      videoId
    };
  } catch (error: any) {
    console.error("Fetch error:", error);
    throw new Error(`獲取影片內容失敗: ${error.message || "網路連線異常"}`);
  }
};

/**
 * 第二階段：使用 Gemini 3.1 Flash 進行分析 (更穩定且支援長文本)
 */
export const analyzeTranscript = async (transcript: string, title: string): Promise<{ summary: string, cards: Flashcard[] }> => {
  console.log("[VocabService] 階段 2: 正在使用 Gemini 進行 AI 分析...");
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // 僅取前 8000 字以確保極速回應
  const truncatedTranscript = transcript.substring(0, 8000);

  const systemInstruction = `你是一位專精於 CEFR 分級的資深英語老師。
請根據提供的逐字稿執行以下任務：
1. 篩選準則：僅挑選符合 CEFR B2 到 C2 難度的核心單詞或片語。
2. 數量限制：精選 5-8 個最具代表性的進階詞彙。
3. 內容摘要：產生一段約 80 字的繁體中文內容摘要 (summary)。
4. 每個單字包含：word, level (B2/C1/C2), definition (繁中), sentence (影片原句)。

輸出規範：嚴格 JSON 格式。`;

  const userPrompt = `影片標題：${title}\n逐字稿內容：\n---\n${truncatedTranscript}\n---`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const content = response.text;
    if (!content) throw new Error("AI 分析失敗。");

    const result = JSON.parse(content);
    
    const cards: Flashcard[] = result.vocabulary.map((v: any, index: number) => ({
      id: `card-${Date.now()}-${index}`,
      word: v.word,
      cefrLevel: v.level,
      translation: v.definition,
      example: v.sentence,
      partOfSpeech: 'n/a',
      status: 'new'
    }));

    return {
      summary: result.summary,
      cards
    };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(`AI 分析失敗: ${error.message}`);
  }
};
