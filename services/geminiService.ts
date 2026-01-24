
import { GoogleGenAI } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  // Fix: Always initialize GoogleGenAI directly with process.env.API_KEY right before making a call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    I need you to analyze this specific YouTube video: ${url}
    
    STEP 1: Use Google Search to find the EXACT content, transcript, or detailed summary of this video.
    STEP 2: Based on the video content, identify 10-12 advanced English vocabulary words used in it.
    STEP 3: Format your ENTIRE response as a valid JSON object ONLY. Do not add markdown backticks.
    
    JSON Structure:
    {
      "detectedTitle": "Full Video Title",
      "summary": "A detailed 150-word summary of the video content in English.",
      "vocabulary": [
        {
          "word": "word",
          "partOfSpeech": "n/v/adj/adv",
          "translation": "Traditional Chinese translation",
          "example": "The specific sentence from the video containing this word"
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const responseText = response.text || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("AI 回傳內容無法解析為單字卡，請再試一次。");
    }

    const result = JSON.parse(jsonMatch[0]);
    
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
    
    // 如果是找不到實體或 404，通常代表 API Key 沒過或模型權限問題
    if (error.message?.includes("not found") || error.message?.includes("404") || error.message?.includes("API_KEY")) {
      throw new Error("API 金鑰無效或未授權。請點擊右上角「設定金鑰」並選擇一個已啟用計費的專案金鑰。");
    }
    
    throw error;
  }
};
