
export interface Flashcard {
  id: string;
  word: string;
  partOfSpeech: string;
  translation: string;
  example: string;
  status: 'new' | 'learning' | 'learned';
}

export interface VideoSet {
  id: string;
  url: string;
  title: string;
  transcript: string;
  cards: Flashcard[];
  createdAt: number;
}
