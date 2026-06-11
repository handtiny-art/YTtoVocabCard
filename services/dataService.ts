import { supabase } from './supabaseClient';
import { Flashcard, VideoSet } from '../types';

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

const mapCardRow = (row: any): Flashcard => ({
  id: row.id,
  word: row.word,
  partOfSpeech: row.part_of_speech || 'n/a',
  translation: row.translation || '',
  example: row.example_sentence || '',
  cefrLevel: row.cefr_level || 'B2',
  status: row.status,
  englishDefinition: row.english_definition || '',
});

const mapSetRow = (row: any): VideoSet => ({
  id: row.id,
  url: row.url,
  title: row.title,
  transcript: row.transcript || '',
  cards: (row.flashcards || []).map(mapCardRow),
  createdAt: new Date(row.created_at).getTime(),
});

const cardToRow = (card: Omit<Flashcard, 'id'>) => ({
  word: card.word,
  part_of_speech: card.partOfSpeech,
  translation: card.translation,
  example_sentence: card.example,
  english_definition: card.englishDefinition || '',
  cefr_level: card.cefrLevel || 'B2',
  status: card.status,
});

export const fetchVideoSets = async (userId: string): Promise<VideoSet[]> => {
  const { data, error } = await supabase
    .from('video_sets')
    .select('*, flashcards(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapSetRow);
};

export const createVideoSet = async (
  userId: string,
  set: { url: string; title: string; transcript: string; cards: Flashcard[] }
): Promise<VideoSet> => {
  const { data: setRow, error: setError } = await supabase
    .from('video_sets')
    .insert({ user_id: userId, url: set.url, title: set.title, transcript: set.transcript })
    .select()
    .single();

  if (setError) throw new Error(setError.message);

  let cards: Flashcard[] = [];
  if (set.cards.length > 0) {
    const rows = set.cards.map(card => ({
      ...cardToRow(card),
      set_id: setRow.id,
      user_id: userId,
    }));

    const { data: cardRows, error: cardError } = await supabase
      .from('flashcards')
      .insert(rows)
      .select();

    if (cardError) throw new Error(cardError.message);
    cards = (cardRows || []).map(mapCardRow);
  }

  return mapSetRow({ ...setRow, flashcards: cards.map(c => ({
    id: c.id,
    word: c.word,
    part_of_speech: c.partOfSpeech,
    translation: c.translation,
    example_sentence: c.example,
    english_definition: c.englishDefinition,
    cefr_level: c.cefrLevel,
    status: c.status,
  })) });
};

export const insertCard = async (userId: string, setId: string, card: Omit<Flashcard, 'id'>): Promise<Flashcard> => {
  const { data, error } = await supabase
    .from('flashcards')
    .insert({ ...cardToRow(card), set_id: setId, user_id: userId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapCardRow(data);
};

export const updateCard = async (card: Flashcard): Promise<void> => {
  const { error } = await supabase
    .from('flashcards')
    .update(cardToRow(card))
    .eq('id', card.id);

  if (error) throw new Error(error.message);
};

export const deleteCard = async (cardId: string): Promise<void> => {
  const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
  if (error) throw new Error(error.message);
};

export const deleteVideoSet = async (setId: string): Promise<void> => {
  const { error } = await supabase.from('video_sets').delete().eq('id', setId);
  if (error) throw new Error(error.message);
};
