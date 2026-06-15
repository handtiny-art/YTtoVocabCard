
import { Flashcard, GroundingSource } from "../types";

/**
 * 第一階段：獲取 YouTube 逐字稿 (支援前端直接與後端 Proxy 代理自適應切換)
 */
export const fetchTranscript = async (url: string, supadataKey?: string): Promise<{ transcript: string, detectedTitle: string, videoId: string }> => {
  console.log("[VocabService] 階段 1: 正在自適應獲取逐字稿 (自動選擇前端或後端模式)...");
  
  const videoIdMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
  const videoId = videoIdMatch ? videoIdMatch[1] : url;

  // 1. 若前端有設定 Supadata 密鑰，先嘗試在前端進行直連，確保最大吞吐
  if (supadataKey) {
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const titleRes = await fetch(oEmbedUrl).catch(() => null);
      let detectedTitle = "YouTube Video";
      if (titleRes && titleRes.ok) {
        const titleData = await titleRes.json();
        detectedTitle = titleData.title;
      }

      const response = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'x-api-key': supadataKey,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.content && Array.isArray(data.content)) {
          const fullText = data.content.map((item: any) => item.text).join(' ');
          return {
            transcript: fullText,
            detectedTitle,
            videoId
          };
        }
      }
    } catch (e) {
      console.warn("直接在前端呼叫 Supadata 失敗，自適應切換至後端 proxy...", e);
    }
  }

  // 2. 使用後端 proxy (無痛引導伺服器層級 env variables，不強迫使用者自行填入 API Key)
  console.log("[VocabService] 正在使用後端 proxy 載入影片資料...");
  try {
    const backendUrl = `/api/transcript?url=${encodeURIComponent(url)}`;
    const headers: Record<string, string> = {};
    if (supadataKey) {
      headers['x-supadata-key'] = supadataKey;
    }
    
    const response = await fetch(backendUrl, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error || errorText;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return {
      transcript: data.transcript,
      detectedTitle: data.title,
      videoId: data.videoId || videoId
    };
  } catch (error: any) {
    console.error("Fetch transcript error:", error);
    throw new Error(`獲取影片內容失敗: ${error.message || "處理網路請求發生異常"}`);
  }
};

/**
 * 第二階段：使用 AI 進行分析 (一律導向安全後端 api)
 */
export const analyzeTranscript = async (
  transcript: string,
  title: string,
  config: {
    provider: 'gemini' | 'openai',
    geminiKey?: string,
    openaiKey?: string,
    videoId?: string
  }
): Promise<{ summary: string, cards: Flashcard[] }> => {
  console.log(`[VocabService] 階段 2: 正在透過後端 API 執行 ${config.provider} AI 分析...`);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transcript,
        title,
        provider: config.provider,
        geminiKey: config.geminiKey,
        openaiKey: config.openaiKey,
        videoId: config.videoId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error || errorText;
      } catch (jsonErr) {}
      throw new Error(errorMsg);
    }

    const result = await response.json();
    return formatResult(result);
  } catch (error: any) {
    console.error("AI analyze error:", error);
    throw new Error(`產生單字卡失敗: ${error.message || "伺服器處理 AI 生成請求異常"}`);
  }
};

const formatResult = (result: any) => {
  const cards: Flashcard[] = result.vocabulary.map((v: any, index: number) => {
    // 1. 取得英文解釋 (支援多種常見欄位命名的命名變體)
    const englishDefinition = 
      v.english_definition || 
      v.englishDefinition || 
      v.definition_en || 
      v.definitionEn || 
      v.english_desc || 
      v.english_meaning || 
      '';

    // 2. 取得中文翻譯 (支援英文解釋跟中文翻譯共用/錯置或不同命名規格的分流)
    const translation = 
      v.chinese_translation || 
      v.chineseTranslation || 
      v.translation_zh || 
      v.translationZh || 
      v.translation || 
      v.definition_zh || 
      v.definitionZh || 
      v.definition || 
      '';

    return {
      id: `card-${Date.now()}-${index}`,
      word: v.word || '',
      cefrLevel: v.level || 'B2',
      translation: translation,
      englishDefinition: englishDefinition,
      example: v.sentence || v.example || '',
      partOfSpeech: v.partOfSpeech || v.pos || 'n/a',
      status: 'new'
    };
  });

  return {
    summary: result.summary,
    cards
  };
};
