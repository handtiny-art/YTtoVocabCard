
// Fix: Use responseSchema and responseMimeType for structured JSON output as recommended in the guidelines.
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  // 每次呼叫時才初始化，確保能抓到從 aistudio 對話框注入的最新 process.env.API_KEY
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("偵測不到 API 金鑰。請點擊右上角「設定 API Key」並選擇一個金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    I need you to analyze this specific YouTube video: ${url}
    
    STEP 1: Use Google Search to find the EXACT content, transcript, or detailed summary of this video.
    STEP 2: Based on the video content, identify 10-12 advanced English vocabulary words used in it.
    STEP 3: Return the results in a structured JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedTitle: {
              type: Type.STRING,
              description: "The full title of the analyzed video."
            },
            summary: {
              type: Type.STRING,
              description: "A detailed 150-word summary of the video content in English."
            },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  partOfSpeech: { type: Type.STRING, description: "n, v, adj, or adv." },
                  translation: { type: Type.STRING, description: "Traditional Chinese translation." },
                  example: { type: Type.STRING, description: "The sentence from the video containing this word." }
                },
                required: ["word", "partOfSpeech", "translation", "example"]
              }
            }
          },
          required: ["detectedTitle", "summary", "vocabulary"]
        }
      }
    });

    const responseText = response.text || "";
    if (!responseText) {
      throw new Error("AI 雖然有回覆，但無法獲取內容。");
    }

    let result;
    try {
      // Even with responseSchema, search grounding might sometimes include citations. 
      // We attempt to parse the trimmed text directly first.
      result = JSON.parse(responseText.trim());
    } catch (e) {
      // Fallback: regex for JSON ifcitations were appended outside the object
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("無法解析單字內容。請確保該影片有公開資訊且金鑰權限正確。");
      }
      result = JSON.parse(jsonMatch[0]);
    }
    
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "參考來源",
            url: chunk.web.uri
          });
        }
      });
    }

    const cards: Flashcard[] = result.vocabulary.map((v: any, index: number) => ({
      id: `card-${Date.now()}-${index}`,
      word: v.word,
      partOfSpeech: v.partOfSpeech,
      translation: v.translation,
      example: v.example,
      status: 'new'
    }));

    return {
      transcript: result.summary,
      detectedTitle: result.detectedTitle,
      cards,
      sources
    };
  } catch (error: any) {
    console.error("Gemini Service Error Detail:", error);
    
    const errMsg = error.message || "";
    
    // 針對 Gemini 3 與 Google Search 常見的金鑰/權限錯誤進行詳細提示
    if (errMsg.includes("Requested entity was not found.") || errMsg.includes("not found") || errMsg.includes("404") || errMsg.includes("403") || errMsg.includes("permission")) {
      throw new Error("發生權限錯誤。請確認：\n1. 您已點擊右上角「設定 API Key」重新選取金鑰。\n2. 您所選的金鑰必須來自一個「已啟用計費 (Paid)」的 Google Cloud 專案。\n3. 免費版金鑰可能不支援 Google Search 搜尋功能。\n(Original error: Requested entity was not found.)");
    }
    
    throw new Error(`分析失敗: ${errMsg}`);
  }
};
