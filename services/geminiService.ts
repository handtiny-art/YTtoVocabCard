
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
  
  // gemini-2.5-flash-lite-latest 是專門為高頻率、輕量任務設計的
  // 在免費方案下，它的 Quota 表現最穩定
  const modelName = 'gemini-2.5-flash-lite-latest';
  
  const systemInstruction = `You are an English teacher. 
1. Use Google Search to find info/transcript for the YouTube URL provided.
2. Return a summary and 10 difficult vocabulary words.
3. You MUST respond ONLY with a JSON block. No explanation before or after.

JSON Structure:
{
  "detectedTitle": "Video Title",
  "summary": "Chinese Summary",
  "vocabulary": [
    {"word": "word", "partOfSpeech": "n/v/adj", "translation": "中文", "example": "English sentence"}
  ]
}`;

  const prompt = `Analyze this video: ${url}. Return the JSON list now.`;

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
          // 絕對不可在此設定 responseMimeType，否則會報 400 錯誤
          temperature: 0.1,
        }
      });

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) throw new Error("AI 未能產出正確的單字格式，請再試一次。");

      const result = JSON.parse(jsonMatch[0]);
      
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
      // 判斷是否為頻率限制 (429) 或配額耗盡
      const isRateLimit = error.message?.includes("429") || error.message?.includes("quota");
      
      if (isRateLimit && attempt < maxRetries) {
        const waitTime = 5000; // 等待 5 秒後重試
        if (onRetry) onRetry(attempt + 1);
        await sleep(waitTime);
        continue;
      }
      break;
    }
  }

  if (lastError?.message?.includes("429")) {
    throw new Error("Google 伺服器目前太忙（免費版限制）。請等待約 15 秒後再點擊一次按鈕。");
  }
  throw new Error(lastError?.message || "分析失敗，請檢查網址是否正確。");
};
