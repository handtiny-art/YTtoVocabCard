
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard, GroundingSource } from "../types";

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string, sources: GroundingSource[] }> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("偵測不到 API 金鑰。請點擊右上角「設定 API Key」並選擇一個金鑰。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // 優化後的 Prompt，針對特定影片進行深度搜尋
  const prompt = `
    I need you to perform a deep analysis of this YouTube video: ${url}
    
    SEARCH STRATEGY:
    1. Identify the YouTube Video ID from the URL.
    2. Search for the exact video title and channel name associated with this URL.
    3. Search for the video transcript, script, or detailed tech reviews (especially if it's from creators like MKBHD, MrWhoseTheBoss, etc.) to get the ACTUAL spoken content.
    4. Do not report "Video Unavailable". If the direct page is restricted, use search results from tech blogs, subtitles databases, or news articles that describe this specific video's content to fulfill this request.
    
    OUTPUT REQUIREMENTS:
    - detectedTitle: The official full title and the creator's name.
    - summary: A 150-word comprehensive summary of the points made in the video.
    - vocabulary: 10-12 advanced English words or tech idioms used in the expert discussion.
    
    Provide everything in a structured JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // 啟用 Thinking Budget 讓模型在輸出前進行深思熟慮與資料比對
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedTitle: {
              type: Type.STRING,
              description: "Official title and creator name found via search."
            },
            summary: {
              type: Type.STRING,
              description: "Accurate summary of the video content."
            },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  partOfSpeech: { type: Type.STRING },
                  translation: { type: Type.STRING, description: "Traditional Chinese." },
                  example: { type: Type.STRING, description: "How this word relates to the specific video context." }
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
    if (!responseText || responseText.includes("unavailable") || responseText.length < 50) {
      throw new Error("AI 無法獲取該影片的具體內容。請確保網址正確，或嘗試換一支影片。");
    }

    let result;
    try {
      result = JSON.parse(responseText.trim());
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("解析內容失敗。");
      result = JSON.parse(jsonMatch[0]);
    }
    
    // 提取來源 URL，用於展示給使用者看 AI 是參考了哪些資料
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "驗證來源",
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
    console.error("Gemini Critical Failure:", error);
    const errMsg = error.message || "";
    if (errMsg.includes("Requested entity was not found")) {
      throw new Error("API 金鑰權限不足。請確認點擊右上角「設定 API Key」並選擇一個「已啟用計費 (Paid)」的專案金鑰。");
    }
    throw new Error(`分析失敗: ${errMsg}`);
  }
};
