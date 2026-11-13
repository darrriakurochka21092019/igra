import Phaser from 'phaser';
import { intro, line, logs, sectors, type StationObject } from './campaign';
import { element, StationDialogs, type Score } from './dialogs';
import { questions, terminals, voiceQuestion } from './learning';
import { blankProgress, loadProgress, loadSettings, MAX_HEALTH, saveProgress, saveSettings, type PlayMode, type Progress } from './progress';
import { StationSound } from './sound';
import { engineConfig, StationWorld, type WorldStatus } from './world';
import './style.css';

interface Objective { title: string; detail: string; ids: string[] }

const home = element('home');
const play = element('play');
const canvas = element('canvas-host');
const start = element<HTMLButtonElement>('start');
const continueButton = element<HTMLButtonElement>('continue');
const savedLabel = element('saved-label');
const notice = element('notice');
const interactButton = element<HTMLButtonElement>('interact');
const target = element('target');
const hudEcho = element('echo-hud');
const settings = loadSettings();
const sound = new StationSound();
let saved = loadProgress();
let progress: Progress | null = null;
let active = false;
let noticeTimeout: number | undefined;
let worldReady = false;
let bootGame: Phaser.Game | undefined;
let objective: Objective = { title: '', detail: '', ids: [] };

const dialogs = new StationDialogs(
  () => { if (worldReady) world.setPaused(true); },
  () => {
    if (worldReady) world.setPaused(!active || !!progress?.completed);
    if (active) canvas.focus({ preventScroll: true });
  },
);

const world = new StationWorld({
  ready: () => { worldReady = true; if (active && progress) loadChapter(); },
  interact,
  event: worldEvent,
  notice: toast,
  sound: cue => sound.play(cue),
  status: renderWorldStatus,
});

function launchEngine(): void {
  if (bootGame) return;
  bootGame = new Phaser.Game(engineConfig(world));
}

function toast(message: string): void {
  if (!active) return;
  window.clearTimeout(noticeTimeout);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimeout = window.setTimeout(() => { notice.hidden = true; }, 5400);
}

function persist(checkpoint = false): void {
  if (!progress) return;
  if (checkpoint && worldReady) progress.checkpoint = world.setCheckpoint();
  if (saveProgress(progress)) saved = progress;
  else toast('Браузер не смог сохранить прогресс. Пока эта вкладка открыта, можно продолжать.');
}

function refreshHome(): void {
  continueButton.hidden = !saved;
  savedLabel.hidden = !saved;
  start.className = `button ${saved ? 'secondary' : 'primary'}`;
  start.firstChild!.textContent = saved ? 'Новая игра ' : 'Начать игру ';
  continueButton.firstChild!.textContent = saved?.completed ? 'Посмотреть итоги ' : 'Продолжить ';
  savedLabel.textContent = saved ? (saved.completed ? 'Кампания пройдена' : `Сохранение · ${sectors[saved.chapter].name}`) : '';
}

function begin(state: Progress): void {
  progress = state;
  active = true;
  home.hidden = true;
  play.hidden = false;
  sound.unlock(settings.sound);
  if (worldReady) loadChapter();
  else launchEngine();
}

function loadChapter(): void {
  if (!progress) return;
  world.setPaused(true);
  notice.hidden = true;
  const chapter = progress.chapter;
  const sector = sectors[chapter];
  element('game-chapter').textContent = `ГЛАВА 0${chapter + 1} / 03`;
  element('game-title').textContent = sector.name;
  [...element('chapter-progress').children].forEach((child, i) => {
    child.classList.toggle('active', i === chapter);
    child.classList.toggle('done', i < chapter || !!progress?.completed);
    if (i === chapter) child.setAttribute('aria-current', 'step');
    else child.removeAttribute('aria-current');
  });
  world.loadSector(progress, settings);
  bootGame?.scale.refresh();
  refreshObjective();
  persist();
  if (progress.completed) {
    showResults();
  } else if (!progress.flags[`intro${chapter}`]) {
    progress.flags[`intro${chapter}`] = true;
    persist();
    dialogs.story(sector.subtitle, intro[chapter], undefined, `ГЛАВА 0${chapter + 1}`);
  } else {
    world.setPaused(false);
    canvas.focus({ preventScroll: true });
  }
}

function menu(): void {
  active = false;
  world.setPaused(true);
  sound.setMuted(true);
  home.hidden = false;
  play.hidden = true;
  refreshHome();
  (saved ? continueButton : start).focus({ preventScroll: true });
}

function nextChapter(): void {
  if (!progress || progress.chapter >= sectors.length - 1) return;
  progress.chapter++;
  progress.checkpoint = null;
  persist();
  loadChapter();
}

function getObjective(state: Progress): Objective {
  const f = state.flags;
  if (state.completed) return { title: 'Эвакуация завершена', detail: 'Учебный отчёт доступен в журнале.', ids: [] };
  if (state.chapter === 0) {
    if (!f.kit) return { title: 'Найди ремонтный комплект', detail: 'Следуй по указателю в билетную кассу. Карта открывается клавишей M.', ids: ['kit'] };
    if (!f.yellow) return { title: 'Включи жёлтый рубильник', detail: 'Через платформу пройди к кабельному коллектору. Колонны укрывают от луча Фонаря.', ids: ['yellow'] };
    if (!f.blue) return { title: 'Включи синий рубильник', detail: 'Сигнальная кабина соединена с коллектором узким переходом.', ids: ['blue'] };
    if (!f['platform-terminal']) return { title: 'Восстанови панель клетки', detail: 'Питание вернулось. Ищи ремонтный пост к востоку от платформы.', ids: ['platform-terminal'] };
    if (!f.byte) return { title: 'Освободи Байта', detail: 'Панель приняла команды. Открой клетку рядом с терминалом.', ids: ['byte'] };
    if (!f.platformExit) return { title: 'Открой технический переход', detail: 'Восстанови запись о передаче отчёта на терминале внизу ремонтного поста.', ids: ['service-terminal'] };
    return { title: 'Спустись в лабораторию', detail: 'Дверь технического перехода открыта. Байт идёт за тобой.', ids: ['next'] };
  }
  if (state.chapter === 1) {
    if (!f['lab-terminal']) return { title: 'Запусти анализатор', detail: 'Ищи стол реконструкции к северу от тамбура. Восстанови описания на экране.', ids: ['lab-terminal'] };
    if (!f.echoSolved) return { title: 'Запиши свой маршрут', detail: 'У стойки ЭХО нажми E. Запиши путь на А, затем запусти повтор и встань на Б.', ids: ['echo'] };
    if (!f.film) return { title: 'Забери оригинал записи', detail: 'После площадок открылось хранилище плёнок. Оно к северо-востоку от камеры.', ids: ['film'] };
    if (!f.archiveOpen) return { title: 'Открой архивный каталог', detail: 'К югу от хранилища работает охрана. Обойди дрон между стеллажами или отключи его.', ids: ['archive-terminal'] };
    return { title: 'Найди Даню в тоннеле', detail: 'Оригинал записи показывает место аварийного шлюза. Спуск находится на севере.', ids: ['next'] };
  }
  if (!f.danya) return { title: 'Доберись до Дани', detail: 'Поднимись по боковому переходу к стеклянному шлюзу.', ids: ['danya'] };
  if (!f.emittersOff) return {
    title: 'Отключи оба излучателя',
    detail: `Отключено ${Number(!!f['emitter-a']) + Number(!!f['emitter-b'])} из 2. Стреляй в оранжевый сердечник. Предупреждающая полоса скоро станет опасной.`,
    ids: ['emitter-a', 'emitter-b'].filter(id => !f[id]),
  };
  if (!f['route-terminal']) return { title: 'Восстанови маршрут выхода', detail: 'Контур потерял питание. Пройди на восток к панели эвакуации.', ids: ['route-terminal'] };
  if (!f['shutter-terminal'] || !state.voice) return { title: 'Передай команду заслонке', detail: 'Реши задания на пульте и объясни последнее правило вслух.', ids: ['shutter-terminal'] };
  if (!f.shutter) return { title: 'Открой заслонку вручную', detail: 'Даня готов повернуть ключ. Нажми E у ручного рычага.', ids: ['lever'] };
  return { title: 'Поднимись на поверхность', detail: 'Последний проход открыт. Выход находится за лестничным указателем.', ids: ['surface'] };
}

function refreshObjective(): void {
  if (!progress) return;
  objective = getObjective(progress);
  element('objective-title').textContent = objective.title;
  element('objective-detail').textContent = objective.detail;
  if (worldReady) world.setTargets(objective.ids);
  element('combat-label').textContent = progress.flags.kit ? 'ИМПУЛЬСНИК ГОТОВ' : 'СЛУЖЕБНАЯ ЗОНА';
}

function renderWorldStatus(status: WorldStatus): void {
  const health = element('health');
  health.setAttribute('aria-label', `Здоровье: ${status.health} из ${MAX_HEALTH}`);
  [...health.children].forEach((segment, i) => segment.classList.toggle('lost', i >= status.health));
  element<HTMLProgressElement>('dash').value = status.dash;
  element('room-label').textContent = status.room;
  interactButton.hidden = !status.nearest || !!progress?.completed;
  if (status.nearest) interactButton.querySelector('span')!.textContent = status.nearest.label;
  target.hidden = !status.target;
  if (status.target) {
    element('target-arrow').style.transform = `rotate(${status.target.direction}rad)`;
    element('target-label').textContent = `${status.target.object.label} · ${status.target.distance} м`;
  }
  hudEcho.hidden = !status.echo;
  if (status.echo) {
    element('echo-label').textContent = status.echo.label;
    element<HTMLProgressElement>('echo-progress').value = status.echo.ratio;
  }
}

function worldEvent(id: string): void {
  if (!progress) return;
  const flags = progress.flags;
  flags[id] = true;
  if (flags['emitter-a'] && flags['emitter-b'] && !flags.emittersOff) {
    flags.emittersOff = true;
    sound.play('door');
    toast('Оба излучателя отключены. Восточная дверь разблокирована.');
  } else if (id.startsWith('emitter-')) {
    toast('Один излучатель отключён. Найди второй.');
  }
  persist(id === 'echoSolved' || id.startsWith('emitter-'));
  refreshObjective();
}

function mark(id: string, checkpoint = true): void {
  if (!progress) return;
  progress.flags[id] = true;
  persist(checkpoint);
  refreshObjective();
}

function readLog(id: string): void {
  if (!progress) return;
  const log = logs[id];
  if (!log) return;
  if (!progress.notes.includes(id)) {
    progress.notes.push(id);
    persist();
  }
  dialogs.story(log.title, log.lines, undefined, 'НАЙДЕНА ЗАПИСЬ');
}

function interact(object: StationObject): void {
  if (!progress || dialogs.open || progress.completed) return;
  const f = progress.flags;
  const id = object.id;
  sound.play('action');
  if (object.kind === 'log') { readLog(id); return; }
  if (object.kind === 'terminal') { openTerminal(id); return; }
  switch (id) {
    case 'kit':
      mark('kit');
      dialogs.story('Ремонтный комплект', [
        line('Байт · служебная связь', 'Импульсник включается левой кнопкой мыши или клавишей F. Колонна перекроет луч Фонаря, если встать за неё. Можешь пройти мимо охраны или отключить её.'),
        line('Мира', 'Сначала жёлтый рубильник, потом синий. Если перепутаю, вернусь к жёлтому.'),
      ], undefined, 'НАЙДЕН ПРЕДМЕТ');
      return;
    case 'yellow':
      mark('yellow');
      toast('Первая линия под током. Теперь включи синий рубильник.');
      return;
    case 'blue':
      if (!f.yellow) { toast('Синяя линия ждёт питание. Сначала включи жёлтый рубильник.'); return; }
      f.blue = true;
      mark('power');
      sound.play('door');
      dialogs.story('Питание восстановлено', [
        line('Станция', 'Ремонтный пост разблокирован. Канал диагностики клеток снова доступен.'),
        line('Мира', 'Байт, я уже на платформе. Покажи, какой терминал твой.'),
      ]);
      return;
    case 'byte':
      if (!f['platform-terminal']) { toast('Сначала восстанови команды на панели рядом с клеткой.'); return; }
      mark('byte');
      sound.play('door');
      dialogs.story('Одна свободная рука', [
        line('Байт', 'Теперь обе руки работают. Спасибо.'),
        line('Мира', 'Что хлопнуло воротами, когда я вошла?'),
        line('Байт', 'Дежурный контур. В его журнале ты новый оператор. Дальше ищем технический переход.'),
        line('Мира', 'Я пришла за Даней. Покажешь путь, а заодно объяснишь, кто прислал то сообщение.'),
      ]);
      return;
    case 'echo':
      if (!f['lab-terminal']) { toast('Стойка ждёт сигнал анализатора в соседнем помещении.'); return; }
      world.useEcho();
      return;
    case 'film':
      mark('film');
      if (!progress.notes.includes('film')) progress.notes.push('film');
      persist();
      dialogs.story('Невырезанные слова', [
        line('Даня · оригинал сообщения', 'Я на нулевой. Захвати фонарь. И не пускай заслонку обратно, она клинит. Позови кого-нибудь, прежде чем спускаться.'),
        line('Мира', 'В моём сообщении этих слов не было. Кто их убрал?'),
        line('Байт', 'Я. Думал, что иначе никто за ним не придёт.'),
        line('Мира', 'Я бы взяла ключ и позвала помощь. Дальше показывай записи целиком.'),
        line('Байт', 'Целиком. В архиве есть схема ручного выхода. Даня оставил метку у стеклянного шлюза.'),
      ], undefined, 'НАЙДЕНА ЗАПИСЬ');
      return;
    case 'danya':
      mark('danya');
      dialogs.story('За стеклом', [
        line('Даня', 'Я слышу тебя живьём. В прошлый раз станция повторила твой голос, а за стеклом никого не было.'),
        line('Мира', 'Я здесь. Отойди от двери. Байт, держи питание шлюза, пока я снимаю блокировку.'),
        line('Байт', 'Проход открыт. Отключи северный и южный излучатели. Оранжевый сердечник означает открытый щит.'),
      ]);
      return;
    case 'emitter-a':
    case 'emitter-b':
      toast('Стреляй в оранжевый сердечник. Когда щит закроется, укройся от ответного импульса.');
      return;
    case 'lever':
      if (!f['shutter-terminal'] || !progress.voice) { toast('Сначала прими команду заслонки и пройди Голосовой протокол.'); return; }
      mark('shutter');
      sound.play('door');
      dialogs.story('Держи рычаг', [
        line('ЭХО', 'Оператор подтверждает маршрут. Вернитесь к исходной отметке.'),
        line('Мира', 'Даня, ключ поворачиваешь ты. Я держу рычаг. Смотри на мою руку.'),
        line('Даня', 'Есть. Заслонка поднялась. Идём, пока держится!'),
        line('Байт', 'Путь наружу открыт. Копию записи я взял.'),
      ]);
      return;
    case 'next':
      if ((progress.chapter === 0 && !f.platformExit) || (progress.chapter === 1 && !f.archiveOpen)) {
        toast('Сначала заверши текущую задачу на терминале.'); return;
      }
      nextChapter();
      return;
    case 'surface':
      if (!f.shutter) { toast('Вернись к ручному рычагу и подними заслонку.'); return; }
      progress.completed = true;
      persist(true);
      refreshObjective();
      world.setPaused(true);
      dialogs.story('Утро над городом', [
        line('Даня', 'Наверху уже светло. Ты теперь всё будешь записывать, Байт?'),
        line('Байт', 'Могу выключить.'),
        line('Мира', 'Выключи. Дальше я тебе сама расскажу.'),
      ], showResults, 'ПРОТОКОЛ ЗАВЕРШЁН');
  }
}

function openTerminal(id: string): void {
  if (!progress) return;
  const terminal = terminals[id];
  if (!terminal) return;
  const flags = progress.flags;
  const blocked = id === 'platform-terminal' && !flags.power ? 'Панели нужно питание. Найди оба рубильника.'
    : id === 'service-terminal' && !flags.byte ? 'Сначала освободи Байта.'
    : id === 'archive-terminal' && !flags.film ? 'Для каталога нужна оригинальная плёнка из хранилища.'
    : id === 'route-terminal' && !flags.emittersOff ? 'Сначала отключи оба излучателя.'
    : id === 'shutter-terminal' && !flags['route-terminal'] ? 'Сначала восстанови маршрут на соседней панели.'
    : '';
  if (blocked) { toast(blocked); return; }
  if (flags[id]) {
    if (id === 'shutter-terminal' && !progress.voice) startVoice();
    else toast('Эта команда уже сохранена.');
    return;
  }
  const index = terminal.questions.findIndex(questionId => !progress?.attempts[questionId]?.passed);
  if (index < 0) { applyTerminal(id); return; }
  const question = questions.get(terminal.questions[index])!;
  const attempt = progress.attempts[question.id] ?? { count: 0, errors: 0, hints: 0, passed: false, reviewed: false };
  progress.attempts[question.id] = attempt;
  dialogs.written(terminal.name, question, index, terminal.questions.length, {
    attempt,
    changed: () => persist(),
    finished: () => openTerminal(id),
    sound: success => sound.play(success ? 'ok' : 'error'),
  });
}

function applyTerminal(id: string): void {
  dialogs.close();
  mark(id);
  sound.play('door');
  switch (id) {
    case 'platform-terminal':
      toast('Панель приняла команды. Клетку Байта можно открыть.');
      return;
    case 'service-terminal':
      mark('platformExit');
      toast('Переход открыт. Спускайся в лабораторию.');
      return;
    case 'lab-terminal':
      toast('Анализатор работает. Ищи стойку ЭХО в камере возврата.');
      return;
    case 'archive-terminal':
      mark('archiveOpen');
      toast('Каталог показал путь к тоннельному спуску.');
      return;
    case 'route-terminal':
      toast('Маршрут восстановлен. Осталась команда заслонки.');
      return;
    case 'shutter-terminal':
      startVoice();
  }
}

function startVoice(): void {
  if (!progress) return;
  dialogs.voice(voiceQuestion, progress.mode, source => {
    if (!progress) return;
    progress.voice = source;
    persist(true);
    refreshObjective();
    sound.play('ok');
    toast('Устное объяснение засчитано. Ручной рычаг доступен.');
  });
}

function voiceLabel(): string {
  return progress?.voice === 'teacher' ? 'подтверждён преподавателем' : progress?.voice === 'self' ? 'самопроверка по образцу' : 'ещё не пройден';
}

function score(): Score {
  const attempts = Object.values(progress?.attempts ?? {});
  return {
    solved: attempts.filter(a => a.passed).length,
    total: questions.size,
    independent: attempts.filter(a => a.passed && a.count === 1 && !a.hints && !a.reviewed).length,
    errors: attempts.reduce((sum, a) => sum + a.errors, 0),
    voice: voiceLabel(),
  };
}

function exportScore(): void {
  if (!progress) return;
  const lines = ['Задание,Тема,Попытки,Ошибки,Подсказки,Решено,Разбор'];
  for (const [id, question] of questions) {
    const a = progress.attempts[id];
    lines.push([id, `"${question.subtopic.replaceAll('"', '""')}"`, a?.count ?? 0, a?.errors ?? 0, a?.hints ?? 0,
      a?.passed ? 'да' : 'нет', a?.reviewed ? 'да' : 'нет'].join(','));
  }
  lines.push(['V06-01', `"Устный ответ — ${voiceLabel()}"`, '', '', '', progress.voice ? 'да' : 'нет', ''].join(','));
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'station-zero-report.csv'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showResults(): void {
  dialogs.end(score(), menu, exportScore);
}

function openSettings(): void {
  dialogs.settings(settings, () => {
    saveSettings(settings);
    if (settings.sound && active) sound.unlock(true);
    else sound.setMuted(true);
    if (worldReady) world.setSettings(settings);
  });
}

function openMap(): void {
  if (!active || !worldReady || !progress) return;
  dialogs.map(sectors[progress.chapter], world.getPosition(), world.getTargets(), progress.flags);
}

function pause(): void {
  if (!active || !worldReady) return;
  if (progress?.completed) showResults();
  else dialogs.pause(menu, openSettings);
}

start.addEventListener('click', () => dialogs.chooseMode((mode: PlayMode) => begin(blankProgress(mode)), !!saved));
continueButton.addEventListener('click', () => { if (saved) begin(saved); });
element('open-controls').addEventListener('click', () => dialogs.controls());
element('open-settings').addEventListener('click', openSettings);
element('open-map').addEventListener('click', openMap);
element('pause').addEventListener('click', pause);
element('open-journal').addEventListener('click', () => {
  dialogs.journal((progress?.notes ?? []).map(id => id === 'film' ? 'Оригинал сообщения Дани' : logs[id]?.title ?? id), score(), exportScore);
});
interactButton.addEventListener('click', () => world.tap('KeyE'));

const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyF']);
const taps = new Set(['KeyE', 'Space', 'KeyR']);
window.addEventListener('keydown', event => {
  if (!active || !worldReady || dialogs.open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(); return; }
  if (event.code === 'KeyM') { event.preventDefault(); if (!event.repeat) openMap(); return; }
  if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
  if (movement.has(event.code)) { event.preventDefault(); world.hold(event.code, true); }
  if (taps.has(event.code)) { event.preventDefault(); if (!event.repeat) world.tap(event.code); }
});
window.addEventListener('keyup', event => { if (movement.has(event.code)) world.hold(event.code, false); });
window.addEventListener('blur', () => world.clearControls());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && active && worldReady && !dialogs.open) pause();
});
document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach(button => {
  const code = button.dataset.hold!;
  button.addEventListener('pointerdown', event => {
    button.setPointerCapture(event.pointerId); world.hold(code, true);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => world.hold(code, false));
});
document.querySelectorAll<HTMLButtonElement>('[data-tap]').forEach(button => {
  button.addEventListener('click', () => world.tap(button.dataset.tap!));
});

refreshHome();
