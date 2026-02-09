
import { GoogleGenAI } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const extractVocabFromVideo = async (
  url: string, 
  onRetry?: (attempt: number) => void
): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。");
  }

  // 重新實例化以確保抓到最新的 Key
  const ai = new GoogleGenAI({ apiKey });
  
  // 使用官方推薦的 gemini-3-flash-preview，這在處理文字、搜尋與免費配額上最穩定
  const modelName = 'gemini-3-flash-preview';
  
  const systemInstruction = `You are an English teacher. 
1. Use Google Search to find information and context for the YouTube URL provided.
2. Return a summary and 10 difficult vocabulary words from the video.
3. You MUST respond ONLY with a JSON block. Do not include any explanation before or after the JSON.

JSON Structure:
{
  "detectedTitle": "Video Title",
  "summary": "100-word Chinese Summary",
  "vocabulary": [
    {"word": "word", "partOfSpeech": "n/v/adj", "translation": "中文", "example": "English sentence context"}
  ]
}`;

  const prompt = `Analyze this video URL and extract 10 key words: ${url}`;

  let lastError: any = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          // 提醒：使用 tools (googleSearch) 時，API 不支援 responseMimeType: "application/json"
          // 因此我們在下方手動解析回傳的字串
          temperature: 0.1,
        }
      });

      const responseText = response.text || "";
      
      // 利用正規表達式尋找字串中的 JSON 區塊
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error("No JSON found in response:", responseText);
        throw new Error("AI 回傳格式不正確，請再試一次。");
      }

      let result;
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error("JSON Parse Error. Raw text:", responseText);
        throw new Error("解析 AI 資料時發生錯誤。");
      }
      
      const sources: GroundingSource[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web && chunk.web.uri) {
            sources.push({ title: chunk.web.title || "來源", url: chunk.web.uri });
          }
        });
      }

      return {
        transcript: result.summary || "暫無摘要",
        detectedTitle: result.detectedTitle || "影片單字集",
        cards: (result.vocabulary || []).map((v: any, index: number) => ({
          id: `card-${Date.now()}-${index}`,
          word: v.word,
          partOfSpeech: v.partOfSpeech,
          translation: v.translation,
          example: v.example,
          status: 'new'
        })),
        sources
      };

    } catch (error: any) {
      lastError = error;
      const msg = error.message || "";
      
      // 如果是模型不存在 (404)，通常代表該區域未支援或名稱寫錯，直接中斷重試
      if (msg.includes("404")) break;

      const isRateLimit = msg.includes("429") || msg.includes("quota");
      if (isRateLimit && attempt < maxRetries) {
        const waitTime = 5000; 
        if (onRetry) onRetry(attempt + 1);
        await sleep(waitTime);
        continue;
      }
      break;
    }
  }

  if (lastError?.message?.includes("429")) {
    throw new Error("目前 Google 伺服器忙碌中。請等待約 15 秒後再重新點擊按鈕。");
  }
  if (lastError?.message?.includes("404")) {
    throw new Error("模型配置錯誤 (404)。請嘗試更換 API Key 或檢查區域支援。");
  }
  throw new Error(lastError?.message || "分析失敗，請檢查網址是否有效。");
};
