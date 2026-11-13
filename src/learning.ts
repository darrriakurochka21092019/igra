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

export const terminals: Record<string, { name: string; questions: string[] }> = {
  'platform-terminal': { name: 'Панель ремонтной клетки', questions: ['C01-01', 'C02-01', 'C03-03'] },
  'service-terminal': { name: 'Терминал перехода', questions: ['C03-05'] },
  'lab-terminal': { name: 'Анализатор записей', questions: ['C04-01', 'C04-03'] },
  'archive-terminal': { name: 'Архивный каталог', questions: ['C04-06'] },
  'route-terminal': { name: 'Панель маршрута', questions: ['C05-03', 'C05-04', 'C05-06'] },
  'shutter-terminal': { name: 'Терминал заслонки', questions: ['C06-03', 'C06-05'] },
};

const requested = new Set(Object.values(terminals).flatMap(terminal => terminal.questions));
export const questions = new Map(
  [first, second, third, fourth, fifth, sixth].flatMap(bank => bank.questions)
    .filter(question => requested.has(question.id))
    .map(question => [question.id, question as unknown as WrittenQuestion]),
);
const finalVoice = oral.questions.find(question => question.id === 'V06-01');
if (questions.size !== requested.size || !finalVoice) throw new Error('В кампании есть ссылка на отсутствующее задание.');
export const voiceQuestion: VoiceQuestion = finalVoice;

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
