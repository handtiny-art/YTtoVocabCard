
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

// 指數退避等待函數
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const extractVocabFromVideo = async (
  url: string, 
  onRetry?: (attempt: number) => void
): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    throw new Error("偵測不到有效的 API 金鑰。請點擊右上角「🔑 設定」並貼上正確的金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // 使用 gemini-flash-lite-latest：對免費金鑰最友善、限制最寬鬆
  const modelName = 'gemini-flash-lite-latest';
  
  const systemInstruction = `你是一位專業英語老師。透過搜尋獲取 YouTube 影片內容並提取 10 個核心單字。`;

  const prompt = `分析影片：${url}。
  請執行：
  1. 取得標題 (detectedTitle)。
  2. 撰寫 100 字中文化摘要 (summary)。
  3. 提取 10 個核心單字 (word, partOfSpeech, translation, example)。
  輸出格式：JSON。`;

  let lastError: any = null;
  const maxRetries = 3;

  // 實作重試迴圈
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedTitle: { type: Type.STRING },
              summary: { type: Type.STRING },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    example: { type: Type.STRING }
                  },
                  required: ["word", "partOfSpeech", "translation", "example"]
                }
              }
            }
          }
        }
      });

      const responseText = response.text || "";
      let result;
      try {
        result = JSON.parse(responseText.trim());
      } catch (e) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI 回傳格式不正確。");
        result = JSON.parse(jsonMatch[0]);
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
        transcript: result.summary,
        detectedTitle: result.detectedTitle || "影片單字集",
        cards: result.vocabulary.map((v: any, index: number) => ({
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
      const isRateLimit = error.message?.includes("429") || error.message?.includes("quota");
      
      if (isRateLimit && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        if (onRetry) onRetry(attempt + 1);
        await sleep(waitTime);
        continue;
      }
      break;
    }
  }

  // 如果噴錯了，給予友善的錯誤提示
  if (lastError?.message?.includes("429")) {
    throw new Error("目前 Google API 請求過於頻繁（免費版金鑰限制）。請稍等 10 秒後再試一次，或是改用付費版金鑰。");
  }
  throw new Error(lastError?.message || "分析失敗，請檢查網路或金鑰。");
};
