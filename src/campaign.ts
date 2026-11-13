export const TILE = 32;
export const WIDTH = 640;
export const HEIGHT = 360;

export interface Point { x: number; y: number }
export interface EchoSample extends Point { at: number; face: number; frame: number }
export const ECHO_LIMIT = 16000;
export const ECHO_PAD_RADIUS = 24;
export type Rect = readonly [x: number, y: number, width: number, height: number];
export type ObjectKind = 'pickup' | 'breaker' | 'terminal' | 'cage' | 'door' | 'log' | 'echo' | 'pad' | 'radio' | 'emitter' | 'lever' | 'exit';
export interface StationObject {
  id: string;
  kind: ObjectKind;
  at: readonly [number, number];
  label: string;
}
export interface Room { name: string; area: Rect; surface: 'metro' | 'work' | 'lab' | 'archive' | 'tunnel' | 'exit' }
export interface Prop { type: 'column' | 'crate' | 'rack' | 'tank' | 'train' | 'console'; area: Rect }
export interface Gate { id: string; area: Rect; opensWith: string }
export interface Patrol { id: string; at: readonly [number, number]; path: readonly (readonly [number, number])[] }
export interface Sector {
  name: string;
  location: string;
  subtitle: string;
  lessonIntro: string;
  width: number;
  height: number;
  spawn: readonly [number, number];
  rooms: Room[];
  corridors: Rect[];
  props: Prop[];
  gates: Gate[];
  objects: StationObject[];
  patrols: Patrol[];
  tracks?: Rect[];
}

export const toPoint = (at: readonly [number, number]): Point => ({ x: at[0] * TILE, y: at[1] * TILE });

export const sectors: Sector[] = [
  {
    name: 'Последний поезд',
    location: 'Платформа',
    subtitle: 'Ответь на сигнал Дани',
    lessonIntro: 'Даня отправил сообщение с закрытой станции. Мира только что спустилась на платформу. Найди комплект и верни питание.',
    width: 66, height: 43, spawn: [9.6, 28.7],
    rooms: [
      { name: 'Вестибюль', area: [3, 24, 13, 12], surface: 'metro' },
      { name: 'Билетная касса', area: [5, 12, 12, 9], surface: 'work' },
      { name: 'Платформа 0', area: [22, 16, 25, 17], surface: 'metro' },
      { name: 'Кабельный коллектор', area: [23, 4, 16, 9], surface: 'work' },
      { name: 'Сигнальная кабина', area: [49, 6, 13, 11], surface: 'work' },
      { name: 'Ремонтный пост', area: [50, 22, 12, 13], surface: 'work' },
      { name: 'Технический переход', area: [47, 37, 15, 4], surface: 'tunnel' },
    ],
    corridors: [[9, 20, 4, 5], [15, 27, 8, 4], [29, 12, 4, 5], [38, 8, 12, 4], [45, 15, 6, 4], [46, 25, 5, 4], [54, 34, 4, 4]],
    props: [
      { type: 'console', area: [3.3, 25.6, 2, 1] }, { type: 'rack', area: [13.5, 13.2, 2, 2.6] },
      { type: 'crate', area: [17.5, 27.1, 1.8, .65] }, { type: 'train', area: [23, 31, 21, 1.25] },
      { type: 'column', area: [26.6, 22, 1.2, 1.3] }, { type: 'column', area: [31.7, 22, 1.2, 1.3] },
      { type: 'column', area: [37.3, 22, 1.2, 1.3] }, { type: 'column', area: [42.1, 22, 1.2, 1.3] },
      { type: 'crate', area: [32, 28.5, 2.8, 1] }, { type: 'crate', area: [41, 27, 1.3, 1.3] },
      { type: 'rack', area: [24, 6, 3, 3] }, { type: 'tank', area: [34, 5.5, 2.5, 2] },
      { type: 'console', area: [52, 7.5, 2.5, 1] }, { type: 'rack', area: [59, 9, 1.5, 4] },
      { type: 'crate', area: [59.5, 32, 1.3, 1.2] },
    ],
    gates: [
      { id: 'platform-gate', area: [20.6, 27, .8, 4], opensWith: 'kit' },
      { id: 'repair-gate', area: [48.25, 25, .8, 4], opensWith: 'power' },
      { id: 'service-gate', area: [54, 35.8, 4, .8], opensWith: 'platformExit' },
    ],
    objects: [
      { id: 'kit', kind: 'pickup', at: [8.6, 14.7], label: 'Взять ремонтный комплект' },
      { id: 'ticket-log', kind: 'log', at: [14.4, 18.6], label: 'Служебный журнал' },
      { id: 'yellow', kind: 'breaker', at: [30.8, 6.2], label: 'Жёлтый рубильник' },
      { id: 'blue', kind: 'breaker', at: [55.3, 8.2], label: 'Синий рубильник' },
      { id: 'platform-terminal', kind: 'terminal', at: [54.1, 24.1], label: 'Панель ремонтной клетки' },
      { id: 'byte', kind: 'cage', at: [58.3, 24.2], label: 'Открыть клетку Байта' },
      { id: 'service-terminal', kind: 'terminal', at: [53.1, 31.3], label: 'Терминал перехода' },
      { id: 'next', kind: 'exit', at: [59.5, 38.6], label: 'В лабораторию' },
    ],
    patrols: [{ id: 'lantern', at: [34.6, 24.7], path: [[44.4, 24.7], [44.4, 19.3], [28.8, 19.3], [28.8, 25.8]] }],
    tracks: [[22, 30, 25, 3]],
  },
  {
    name: 'Архив смен',
    location: 'Лаборатория',
    subtitle: 'Найди подлинную запись',
    lessonIntro: 'Мира освободила ремонтного робота Байта. Вместе они ищут подлинное сообщение Дани в архиве станции.',
    width: 76, height: 43, spawn: [5.5, 29.5],
    rooms: [
      { name: 'Технический тамбур', area: [3, 24, 13, 12], surface: 'work' },
      { name: 'Стол реконструкции', area: [7, 9, 16, 12], surface: 'lab' },
      { name: 'Камера возврата', area: [27, 10, 19, 19], surface: 'lab' },
      { name: 'Хранилище плёнок', area: [49, 5, 12, 13], surface: 'archive' },
      { name: 'Архив смен', area: [53, 22, 18, 16], surface: 'archive' },
      { name: 'Тоннельный спуск', area: [66, 9, 7, 10], surface: 'tunnel' },
    ],
    corridors: [[12, 20, 4, 5], [15, 27, 13, 4], [22, 13, 6, 4], [45, 13, 5, 4], [45, 24, 9, 4], [56, 17, 4, 6], [67, 18, 4, 5]],
    props: [
      { type: 'crate', area: [8, 32.5, 2, 1.4] }, { type: 'rack', area: [8, 11, 2, 5] },
      { type: 'console', area: [18, 16.4, 3, 1.7] },
      { type: 'tank', area: [29, 11.5, 2.5, 2.7] }, { type: 'tank', area: [41.5, 11.5, 2.5, 2.7] },
      { type: 'rack', area: [35.2, 16, 2, 4.5] }, { type: 'column', area: [34, 25.1, 1.2, 1.3] },
      { type: 'rack', area: [51, 7.4, 2, 5.6] }, { type: 'rack', area: [56.3, 6.5, 2, 4] },
      { type: 'rack', area: [59.9, 24, 1.8, 5.5] }, { type: 'rack', area: [65, 26, 1.8, 6] },
      { type: 'rack', area: [55, 31.5, 3.2, 1.7] }, { type: 'crate', area: [69, 33, 1.4, 1.4] },
    ],
    gates: [
      { id: 'echo-north', area: [47.3, 13, .85, 4], opensWith: 'echoSolved' },
      { id: 'echo-east', area: [48.3, 24, .85, 4], opensWith: 'echoSolved' },
      { id: 'archive-door', area: [67, 20.5, 4, .85], opensWith: 'archiveOpen' },
    ],
    objects: [
      { id: 'lab-terminal', kind: 'terminal', at: [14.8, 11.9], label: 'Анализатор записей' },
      { id: 'lab-log', kind: 'log', at: [20.5, 11], label: 'Инструкция Беловой' },
      { id: 'echo', kind: 'echo', at: [35.5, 23.0], label: 'Стойка записи ЭХО' },
      { id: 'pad-a', kind: 'pad', at: [31.0, 18.6], label: 'Площадка А' },
      { id: 'pad-b', kind: 'pad', at: [41.0, 18.6], label: 'Площадка Б' },
      { id: 'film', kind: 'pickup', at: [58.4, 12.2], label: 'Забрать оригинал записи' },
      { id: 'archive-terminal', kind: 'terminal', at: [64, 33.4], label: 'Архивный каталог' },
      { id: 'next', kind: 'exit', at: [69.5, 11.5], label: 'В тоннель эвакуации' },
    ],
    patrols: [{ id: 'archive-watch', at: [63.5, 24.8], path: [[68, 24.8], [68, 33.4], [60.5, 33.4], [55.4, 28]] }],
  },
  {
    name: 'Живой выход',
    location: 'Аварийный тоннель',
    subtitle: 'Выведи Даню на поверхность',
    lessonIntro: 'Подлинная запись привела Миру и Байта к аварийному тоннелю. Даня ждёт за стеклом шлюза.',
    width: 80, height: 45, spawn: [5.5, 28.5],
    rooms: [
      { name: 'Вход в коллектор', area: [3, 23, 14, 13], surface: 'tunnel' },
      { name: 'Шлюз Дани', area: [10, 7, 13, 11], surface: 'work' },
      { name: 'Контур безопасности', area: [27, 17, 25, 18], surface: 'tunnel' },
      { name: 'Излучатель А', area: [29, 5, 15, 9], surface: 'lab' },
      { name: 'Излучатель Б', area: [32, 37, 14, 6], surface: 'lab' },
      { name: 'Пульт эвакуации', area: [57, 18, 11, 13], surface: 'work' },
      { name: 'Выход на поверхность', area: [71, 13, 6, 18], surface: 'exit' },
    ],
    corridors: [[13, 17, 4, 7], [16, 26, 12, 4], [34, 13, 5, 5], [36, 34, 5, 4], [51, 23, 7, 5], [67, 23, 5, 5]],
    props: [
      { type: 'crate', area: [8, 32.5, 1.5, 1.4] }, { type: 'rack', area: [11, 8.4, 2, 4.2] },
      { type: 'column', area: [30, 26.5, 1.6, 1.6] }, { type: 'crate', area: [31.5, 19, 3, 1.7] },
      { type: 'column', area: [36.8, 22, 1.3, 1.5] }, { type: 'column', area: [37.2, 29, 1.3, 1.5] },
      { type: 'crate', area: [43.5, 24.1, 1.6, 3.1] }, { type: 'column', area: [47.5, 31, 1.2, 1.2] },
      { type: 'tank', area: [31.4, 7.7, 2.4, 1.6] }, { type: 'tank', area: [41.5, 8.9, 1.4, 2.3] },
      { type: 'crate', area: [33.4, 39.3, 2, 1.7] }, { type: 'console', area: [42.5, 39, 2.4, 1.1] },
      { type: 'rack', area: [57.8, 19, 2, 2.6] }, { type: 'console', area: [65, 19.6, 2, 1.2] },
    ],
    gates: [
      { id: 'tunnel-gate', area: [24, 26, .85, 4], opensWith: 'danya' },
      { id: 'contour-gate', area: [54.3, 23, .85, 5], opensWith: 'emittersOff' },
      { id: 'surface-gate', area: [69.25, 23, .85, 5], opensWith: 'shutter' },
    ],
    objects: [
      { id: 'danya', kind: 'radio', at: [17.9, 10.5], label: 'Связаться с Даней' },
      { id: 'belova-log', kind: 'log', at: [19.8, 14.8], label: 'Запись инженера Беловой' },
      { id: 'emitter-a', kind: 'emitter', at: [37.0, 7.7], label: 'Излучатель А' },
      { id: 'emitter-b', kind: 'emitter', at: [40.0, 40.7], label: 'Излучатель Б' },
      { id: 'route-terminal', kind: 'terminal', at: [59.6, 25.8], label: 'Панель маршрута' },
      { id: 'shutter-terminal', kind: 'terminal', at: [64.8, 25.8], label: 'Терминал заслонки' },
      { id: 'lever', kind: 'lever', at: [64.6, 28.7], label: 'Ручной рычаг' },
      { id: 'surface', kind: 'exit', at: [74.2, 16.7], label: 'Подняться на поверхность' },
    ],
    patrols: [{ id: 'contour-watch', at: [46.8, 28.6], path: [[46.8, 19.8], [42, 19.8], [41.5, 30.5], [47.4, 30.5]] }],
  },
];

export interface Line { speaker: string; text: string }
export const line = (speaker: string, text: string): Line => ({ speaker, text });
export const intro: Line[][] = [
  [
    line('Даня · сообщение', 'Я на нулевой. Захвати фонарь. Тут есть кое-что про аварию, о чём у нас дома никогда не говорят.'),
    line('Мира', 'Даня? Я на станции. Напиши хоть одно слово, чтобы я знала, что ты здесь.'),
    line('Станция', 'Гостевой пропуск зарегистрирован. Входные ворота закрыты.'),
    line('Байт · служебная связь', 'Если слышишь меня, найди комплект в билетной кассе. Потом иди по жёлтому кабелю. Без света здесь лучше не задерживаться.'),
  ],
  [
    line('Байт', 'В этой камере станция записывала действия операторов. Можно было отрепетировать эвакуацию, никуда не уходя.'),
    line('Мира', 'Пока я вижу, что кто-то нажал дверь три секунды назад. Хотя дверь никто не трогал.'),
    line('Байт', 'Это повтор. Сначала включи анализатор. Потом попробуем поставить на две площадки тебя и твою запись.'),
  ],
  [
    line('Даня · живой канал', 'Мира, я за стеклом. Тут есть ручной ключ. Если я открою свою дверь, у тебя перекроется проход.'),
    line('Мира', 'Пока не трогай ключ. Я найду, откуда питается защита.'),
    line('Байт', 'Два излучателя держат Контур. Импульсник берёт их, когда у них открывается защитная решётка.'),
  ],
];

export const logs: Record<string, { title: string; lines: Line[] }> = {
  'ticket-log': {
    title: 'Схема резервного питания',
    lines: [line('Журнал дежурного', 'Порядок подачи питания: жёлтый рубильник в кабельном коллекторе, затем синий в сигнальной кабине. Схема уцелела потому, что её нарисовали на бумаге.')],
  },
  'lab-log': {
    title: 'Две площадки',
    lines: [line('Белова · инструкция', 'Запишите путь от стойки до площадки А. Задержитесь на ней, пока стойка не сохранит запись. Затем вернитесь к стойке и запустите повтор. Пока эхо удерживает площадку А, встаньте на площадку Б.')],
  },
  'belova-log': {
    title: 'Механическая заслонка',
    lines: [line('Белова · запись', 'Если карта показывает две одинаковые двери, ищите след ключа и механическую защёлку. Рычаг удерживает заслонку, пока второй оператор доворачивает ключ.')],
  },
};
