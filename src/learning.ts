import first from '../content/questions/chapter-01.json';
import second from '../content/questions/chapter-02.json';
import third from '../content/questions/chapter-03.json';
import fourth from '../content/questions/chapter-04.json';
import fifth from '../content/questions/chapter-05.json';
import sixth from '../content/questions/chapter-06.json';
import oral from '../content/questions/oral.json';

type TextKey = { correct: string; alternatives: string[]; match?: 'strict-yo' };
type Field = TextKey & { label: string };
interface BaseQuestion {
  id: string;
  topic: string;
  subtopic: string;
  prompt: string;
  materials: string[];
  explanation: string;
  hints: string[];
  rubric: string[];
}
type SelectionQuestion = BaseQuestion & {
  interaction: 'choice' | 'multi';
  options: { id: string; label: string }[];
  answer: { correct: string[] };
};
type TextQuestion = BaseQuestion & { interaction: 'text'; answer: TextKey };
type FieldsQuestion = BaseQuestion & { interaction: 'fields'; answer: { fields: Field[] } };
export type WrittenQuestion = SelectionQuestion | TextQuestion | FieldsQuestion;
export type VoiceQuestion = BaseQuestion & { answer: { model: string; alternatives: string[] } };

export const terminals: Record<string, { name: string; chapter: number; questions: string[] }> = {
  'platform-terminal': {
    name: 'Панель ремонтной клетки', chapter: 0,
    questions: ['C01-01', 'C01-03', 'C02-01', 'C02-05', 'C03-03'],
  },
  'service-terminal': {
    name: 'Терминал перехода', chapter: 0,
    questions: ['C03-04', 'C03-05', 'C03-14'],
  },
  'lab-terminal': {
    name: 'Анализатор записей', chapter: 1,
    questions: ['C04-01', 'C04-02', 'C04-04', 'C04-03'],
  },
  'archive-terminal': {
    name: 'Архивный каталог', chapter: 1,
    questions: ['C04-07', 'C04-16', 'C04-06', 'C04-13'],
  },
  'route-terminal': {
    name: 'Панель маршрута', chapter: 2,
    questions: ['C05-03', 'C05-04', 'C05-05', 'C05-06', 'C05-17'],
  },
  'shutter-terminal': {
    name: 'Терминал заслонки', chapter: 2,
    questions: ['C06-03', 'C06-07', 'C06-05'],
  },
};

// Finished terminals in older saves keep the assignments the player could access.
const originalQuestionIds = new Set([
  'C01-01', 'C02-01', 'C03-03', 'C03-05',
  'C04-01', 'C04-03', 'C04-06',
  'C05-03', 'C05-04', 'C05-06', 'C06-03', 'C06-05',
]);

const requested = new Set(Object.values(terminals).flatMap(terminal => terminal.questions));
export const questions = new Map(
  [first, second, third, fourth, fifth, sixth].flatMap(bank => bank.questions)
    .filter(question => requested.has(question.id))
    .map(question => [question.id, question as unknown as WrittenQuestion]),
);
const finalVoice = oral.questions.find(question => question.id === 'V06-01');
if (questions.size !== requested.size || !finalVoice) throw new Error('В кампании есть ссылка на отсутствующее задание.');
export const voiceQuestion: VoiceQuestion = finalVoice;

export function terminalQuestionIds(id: string, originalTerminals: readonly string[]): string[] {
  const ids = terminals[id].questions;
  return originalTerminals.includes(id) ? ids.filter(questionId => originalQuestionIds.has(questionId)) : ids;
}

export function reportQuestions(lessonChapter?: number, originalTerminals: readonly string[] = []) {
  return Object.entries(terminals)
    .filter(([, terminal]) => lessonChapter === undefined || terminal.chapter === lessonChapter)
    .flatMap(([id, terminal]) => terminalQuestionIds(id, originalTerminals)
      .map(questionId => ({ question: questions.get(questionId)!, chapter: terminal.chapter })));
}

function normalize(text: string, strictYo = false): string {
  const tidy = text.normalize('NFC').trim().toLocaleLowerCase('ru')
    .replace(/\s+/gu, ' ').replace(/\s*([,;:])\s*/gu, '$1').replace(/\.$/u, '');
  return strictYo ? tidy : tidy.replace(/ё/gu, 'е');
}

function match(value: string, key: TextKey): boolean {
  const strict = key.match === 'strict-yo';
  return [key.correct, ...key.alternatives].some(candidate => normalize(candidate, strict) === normalize(value, strict));
}

export function evaluate(question: WrittenQuestion, values: string[]): boolean[] {
  switch (question.interaction) {
    case 'choice':
    case 'multi': {
      const chosen = new Set(values);
      return [chosen.size === question.answer.correct.length && question.answer.correct.every(id => chosen.has(id))];
    }
    case 'text':
      return [match(values[0] ?? '', question.answer)];
    case 'fields':
      return question.answer.fields.map((field, i) => match(values[i] ?? '', field));
  }
}

export function answerText(question: WrittenQuestion): string {
  switch (question.interaction) {
    case 'text':
      return question.answer.correct;
    case 'fields':
      return question.answer.fields.map(field => `${field.label} — ${field.correct}`).join(' · ');
    default:
      return question.options.filter(option => question.answer.correct.includes(option.id))
        .map(option => option.label).join(' · ');
  }
}
