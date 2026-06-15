/**
 * 功能開關設定
 */

// 是否要求使用者自行填寫 Gemini / OpenAI / Supadata API Key。
// 設為 false 時，App 完全使用伺服器端設定的 API Key，
// 設定頁面不會顯示任何 API Key 輸入欄位，降低使用門檻。
// 若想恢復「使用者可自行填 Key」的舊版行為，改回 true 即可。
export const REQUIRE_USER_API_KEY = false;
