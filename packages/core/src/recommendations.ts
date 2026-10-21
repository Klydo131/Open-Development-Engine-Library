import type { Lesson, Library, Practice } from './model.ts';
export type Suggestion = { lessonId: string; title: string; reason: string; duration: string; steps: string[]; category: string };
export function suggestLesson(lesson: Lesson): Suggestion {
  // Deliberately excludes URLs, filenames, account data, behavior and other libraries.
  const words = `${lesson.title} ${lesson.tags.join(' ')} ${lesson.notes}`.toLowerCase();
  let category = 'Make it your own';
  let steps = ['Explain one idea in your own words without looking at the source.', 'Make a small example that uses the idea in your everyday life.', 'Compare your example with the lesson. Write what you would change.'];
  if (/\b(music|piano|guitar|chord|rhythm|audio)\b/.test(words)) {
    category = 'Practice a pattern';
    steps = ['Choose a short musical phrase or rhythm from your lesson.', 'Practice slowly for five minutes, then try it without the source.', 'Listen back or reflect: what became easier, and what needs another try?'];
  } else if (/\b(physics|science|motion|force|gravity|energy)\b/.test(words)) {
    category = 'Test an idea';
    steps = ['Choose one concept and predict what a simple, safe observation will show.', 'Use an everyday example or a paper calculation. Record the result.', 'Compare the result with your prediction and explain any difference.'];
  } else if (/\b(code|coding|programming|javascript|python|software)\b/.test(words)) {
    category = 'Build a tiny example';
    steps = ['Write the smallest example of one concept from the lesson.', 'Try a normal input, an empty input and an unexpected input.', 'Explain what worked and revise one thing that surprised you.'];
  }
  return {lessonId: lesson.id, title: category, category, reason: `From “${lesson.title}” · matched on this device using lesson text and topics.`, duration: '15–20 min', steps};
}
export function recommend(library: Library): Suggestion[] {
  if (!library.recommendations) return [];
  const started = new Set(library.practices.map(p => p.lessonId));
  return [...library.lessons].reverse().filter(l => !started.has(l.id)).sort((a,b) => Number(b.learned) - Number(a.learned)).map(suggestLesson);
}
export function startPractice(suggestion: Suggestion, id: string): Practice {
  return {id, lessonId: suggestion.lessonId, title: suggestion.title, steps: [...suggestion.steps], completed: suggestion.steps.map(() => false), reflection: ''};
}
