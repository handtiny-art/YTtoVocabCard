/**
 * Native Text-to-Speech English Pronunciation Utility
 */
export const speakWord = (word: string) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    // Cancel any ongoing speech to avoid overlap
    window.speechSynthesis.cancel();

    // Clean up word formatting from any potential phonetics or special characters
    const cleanWord = word.replace(/[^a-zA-Z\s.-]/g, '').trim();
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Slightly slower rate for clear learner comprehension

    // Retrieve and find a high quality English voice (preferably US or Google US)
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                  voices.find(v => v.lang === 'en-US') ||
                  voices.find(v => v.lang.startsWith('en-US')) ||
                  voices.find(v => v.lang.startsWith('en'));

    if (voice) {
      utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  } else {
    console.warn("Speech synthesis is not supported on this device/browser.");
  }
};
