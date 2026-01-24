
import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard } from "../types";

// 初始化時直接使用 process.env.API_KEY，系統會自動注入
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractVocabFromVideo = async (url: string): Promise<{ transcript: string, cards: Flashcard[], detectedTitle: string }> => {
  const prompt = `
    TASK: Analyze the YouTube video at this EXACT URL: ${url}

    OPERATIONAL PROTOCOL:
    1. USE Google Search to identify the SPECIFIC title and the core content of the video linked above.
    2. DO NOT rely on general knowledge. You MUST extract information that is unique to this specific video's dialogue or subtitles.
    3. If the video content cannot be found, provide a response based on its metadata (title/description) but flag it in the summary.

    OUTPUT REQUIREMENTS:
    - detectedTitle: The actual full title of the video you identified.
    - summary: A 150-200 word summary of the video's actual content in English.
    - vocabulary: 10-15 high-level (CEFR B2-C2) words or idioms used in this video.
      - word: The word/phrase.
      - partOfSpeech: n, v, adj, adv, or idiom.
      - translation: Accurate Traditional Chinese.
      - example: The context from the video where it appeared.

    STRICT CONSTRAINTS:
    - If the word is not in the video, DO NOT include it. 
    - No hallucinations. Accuracy relative to the provided URL is the most important metric.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', 
    contents: prompt,
    config: {
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
        },
        required: ["detectedTitle", "summary", "vocabulary"]
      }
    }
  });

  const result = JSON.parse(response.text);
  
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
    cards
  };
};
