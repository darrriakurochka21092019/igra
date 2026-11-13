import { sectors, TILE, toPoint, type Line, type Point, type Sector } from './campaign';
import { distance, Geometry } from './geometry';
import { answerText, evaluate, type VoiceQuestion, type WrittenQuestion } from './learning';
import type { Attempt, PlayMode, Settings } from './progress';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Отсутствует элемент интерфейса ${id}`);
  return node as T;
}

function create<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label: string, action: () => void, primary = false): HTMLButtonElement {
  const item = create('button', label, `button ${primary ? 'primary' : 'secondary'}`);
  item.type = 'button';
  item.addEventListener('click', action);
  return item;
}

function actions(...items: HTMLElement[]): HTMLDivElement {
  const group = create('div', undefined, 'dialog-actions');
  group.append(...items);
  return group;
}

function materials(lines: string[]): HTMLDivElement {
  const group = create('div', undefined, 'question-material');
  lines.forEach(line => group.append(create('div', line)));
  return group;
}

export interface WrittenHooks {
  attempt: Attempt;
  changed(): void;
  finished(): void;
  sound(success: boolean): void;
}

export class StationDialogs {
  readonly dialog = element<HTMLDialogElement>('overlay');
  private title = element('dialog-title');
  private label = element('dialog-label');
  private body = element('dialog-content');
  private closeButton = element<HTMLButtonElement>('close-dialog');
  private cleanup: (() => void) | undefined;
  private afterClose: (() => void) | undefined;

  constructor(private onOpen: () => void, private onClose: () => void) {
    this.closeButton.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.close();
    });
  }

  get open(): boolean { return this.dialog.open; }

  private show(label: string, title: string): HTMLElement {
    this.cleanup?.();
    this.cleanup = undefined;
    this.afterClose = undefined;
    this.label.textContent = label;
    this.title.textContent = title;
    this.body.replaceChildren();
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.scrollTop = 0;
    this.title.focus();
    this.onOpen();
    return this.body;
  }

  close(): void {
    this.cleanup?.();
    this.cleanup = undefined;
    if (!this.dialog.open) return;
    const afterClose = this.afterClose;
    this.afterClose = undefined;
    this.dialog.close();
    this.onClose();
    afterClose?.();
  }

  chooseMode(callback: (mode: PlayMode) => void, hasSave: boolean, lesson?: { chapter: number; saved: boolean; completed: boolean; resume(): void }): void {
    const body = this.show(lesson ? 'ОТДЕЛЬНАЯ ГЛАВА' : 'НАЧАЛО ИГРЫ', lesson ? sectors[lesson.chapter].name : 'Как будем проходить?');
    if (lesson) body.append(create('p', 'Эту главу можно пройти отдельно и скачать отчёт по её заданиям.', 'dialog-copy'));
    if (hasSave) body.append(create('p', 'Новая кампания заменит сохранённое прохождение всей игры в этом браузере.', 'dialog-copy'));
    const form = create('form');
    const hasVoice = !lesson || lesson.chapter === 2;
    const modes = [
      { id: 'solo' as const, title: 'Самостоятельно', description: 'Письменные ответы проверит игра. Устное объяснение можно сверить с образцом.' },
      { id: 'teacher' as const, title: 'С преподавателем', description: 'Преподаватель слушает устное объяснение и подтверждает его по критериям.' },
    ];
    if (hasVoice) modes.forEach(mode => {
      const label = create('label', undefined, 'radio-line');
      const input = create('input');
      input.type = 'radio'; input.name = 'mode'; input.value = mode.id; input.checked = mode.id === 'solo';
      const copy = create('span');
      copy.append(create('strong', mode.title), create('small', mode.description));
      label.append(input, copy);
      form.append(label);
    });
    const start = create('button', lesson ? (lesson.saved ? 'Начать главу заново' : 'Начать главу') : 'Спуститься на станцию', lesson?.saved ? 'button secondary' : 'button primary');
    start.type = 'submit';
    if (lesson?.saved) {
      const resumeLabel = lesson.completed ? 'Посмотреть итоги главы' : 'Продолжить главу';
      form.append(actions(button(resumeLabel, () => { this.close(); lesson.resume(); }, true), start));
    }
    else form.append(actions(start));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const mode = new FormData(form).get('mode') === 'teacher' ? 'teacher' : 'solo';
      this.close();
      callback(mode);
    });
    body.append(form);
  }

  controls(): void {
    const body = this.show('СПРАВКА', 'Управление');
    const list = create('dl', undefined, 'control-list');
    const controls = [
      ['WASD / стрелки', 'Движение по станции'],
      ['E', 'Действие рядом с объектом'],
      ['ЛКМ / F', 'Энергетический импульс. F стреляет по направлению взгляда'],
      ['Пробел', 'Рывок с коротким уклонением от попаданий'],
      ['Shift', 'Бег. Дроны могут услышать шаги'],
      ['M', 'Карта сектора с текущей целью'],
      ['R', 'Сброс записи у площадок ЭХО'],
      ['Esc', 'Пауза или закрытие текущего окна'],
    ];
    controls.forEach(([key, description]) => {
      const row = create('div');
      const term = create('dt');
      term.append(create('kbd', key));
      row.append(term, create('dd', description));
      list.append(row);
    });
    body.append(list, actions(button('Понятно', () => this.close(), true)));
  }

  settings(settings: Settings, changed: () => void): void {
    const body = this.show('ИНТЕРФЕЙС', 'Настройки');
    const items: [keyof Settings, string, string][] = [
      ['sound', 'Звук', 'Атмосфера станции, импульсы и сигналы.'],
      ['reduced', 'Уменьшить эффекты', 'Убирает тряску камеры, уменьшает вспышки и частицы.'],
      ['story', 'Спокойный бой', 'Дроны замечают с меньшей дистанции, излучатели дольше открыты.'],
    ];
    for (const [key, name, description] of items) {
      const label = create('label', undefined, 'setting');
      const input = create('input');
      input.type = 'checkbox'; input.checked = settings[key];
      input.addEventListener('change', () => { settings[key] = input.checked; changed(); });
      const text = create('span', name);
      text.append(create('small', description));
      label.append(input, text);
      body.append(label);
    }
    body.append(actions(button('Готово', () => this.close(), true)));
  }

  pause(onMenu: () => void, onSettings: () => void): void {
    const body = this.show('СТАНЦИЯ НОЛЬ', 'Пауза');
    body.append(create('p', 'Игра сохраняется после важных действий. Продолжить можно с последней контрольной точки.', 'dialog-copy'));
    body.append(actions(button('Вернуться в игру', () => this.close(), true), button('Настройки', onSettings), button('В главное меню', () => {
      this.close(); onMenu();
    })));
  }

  story(title: string, lines: Line[], done?: () => void, label = 'СВЯЗЬ'): void {
    if (!lines.length) return;
    const body = this.show(label, title);
    const dialogue = create('div', undefined, 'dialogue');
    dialogue.setAttribute('aria-live', 'polite');
    const speaker = create('p', undefined, 'speaker');
    const speech = create('p', undefined, 'speech');
    dialogue.append(speaker, speech);
    let page = 0;
    const counter = create('span', undefined, 'dialog-counter');
    const finish = () => this.close();
    this.afterClose = done;
    const next = button('Дальше →', () => {
      page++;
      if (page === lines.length) finish();
      else paint();
    }, true);
    const skip = button('Пропустить', finish);
    const toolbar = create('div', undefined, 'dialog-action-row');
    toolbar.append(counter, actions(skip, next));
    const paint = () => {
      speaker.textContent = lines[page].speaker;
      speech.textContent = lines[page].text;
      next.textContent = page === lines.length - 1 ? 'Готово' : 'Дальше →';
      counter.textContent = `${page + 1} / ${lines.length}`;
      skip.hidden = lines.length === 1;
    };
    body.append(dialogue, toolbar);
    paint();
  }

  map(sector: Sector, player: Point, targets: string[], flags: Record<string, boolean>): void {
    const body = this.show('СХЕМА СЕКТОРА', sector.location);
    const canvas = create('canvas', undefined, 'map-canvas');
    canvas.width = 560; canvas.height = Math.round(560 * sector.height / sector.width);
    canvas.setAttribute('aria-label', 'Схема сектора. Текущая цель выделена оранжевым, положение Миры — мятным.');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const geometry = new Geometry(sector, flags);
      const { grid } = geometry;
      const size = canvas.width / sector.width;
      for (let y = 0; y < sector.height; y++) for (let x = 0; x < sector.width; x++) {
        const area = grid[y][x];
        if (area < 0) continue;
        ctx.fillStyle = area ? '#314a51' : '#223942';
        ctx.fillRect(x * size, y * size, size + .2, size + .2);
      }
      for (const room of sector.rooms) {
        const [x, y, w, h] = room.area;
        ctx.strokeStyle = '#617a7c';
        ctx.strokeRect(x * size + 1, y * size + 1, w * size - 2, h * size - 2);
        ctx.font = '10px Arial';
        ctx.fillStyle = '#d4e4df';
        ctx.fillText(room.name, (x + .5) * size, (y + 1.9) * size, (w - .8) * size);
      }
      const waypoints = sector.objects.filter(object => targets.includes(object.id)).flatMap(object => {
        const route = geometry.route(player, toPoint(object.at));
        return route.length ? [{ route, length: distance(player, route[0]) +
          route.slice(1).reduce((sum, point, i) => sum + distance(point, route[i]), 0) }] : [];
      }).sort((a, b) => a.length - b.length)[0];
      if (waypoints) {
        ctx.beginPath();
        ctx.moveTo(player.x / TILE * size, player.y / TILE * size);
        for (const point of waypoints.route) ctx.lineTo(point.x / TILE * size, point.y / TILE * size);
        ctx.strokeStyle = '#b7dac8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const gate of sector.gates) {
        if (flags[gate.opensWith]) continue;
        const [x, y, w, h] = gate.area;
        ctx.fillStyle = '#c97667';
        ctx.fillRect(x * size, y * size, w * size, h * size);
      }
      for (const object of sector.objects) {
        if (!targets.includes(object.id)) continue;
        ctx.fillStyle = '#f2b472';
        ctx.fillRect(object.at[0] * size - 4, object.at[1] * size - 4, 8, 8);
      }
      ctx.fillStyle = '#a9f3df';
      ctx.beginPath();
      ctx.arc(player.x / TILE * size, player.y / TILE * size, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    const labels = sector.objects.filter(object => targets.includes(object.id)).map(object => object.label);
    body.append(canvas, create('p', labels.length ? `Цель — ${labels.join(' или ')}. Пунктир показывает путь по открытым проходам.` : 'Мятная точка показывает, где находится Мира.', 'feedback'), actions(button('Вернуться', () => this.close(), true)));
  }

  written(name: string, question: WrittenQuestion, index: number, total: number, hooks: WrittenHooks): void {
    const body = this.show(`ТЕРМИНАЛ · ${index + 1} / ${total}`, name);
    body.append(create('p', question.subtopic, 'question-topic'), materials(question.materials), create('p', question.prompt, 'question-prompt'));
    const form = create('form');
    const fields: HTMLInputElement[] = [];
    const choiceInputs: HTMLInputElement[] = [];
    const field = (labelText: string) => {
      const label = create('label', labelText, 'input-label');
      const input = create('input', undefined, 'answer-input');
      input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 280;
      input.id = `answer-${fields.length}`; input.placeholder = 'Введите ответ'; label.htmlFor = input.id;
      fields.push(input); form.append(label, input);
    };
    if (question.interaction === 'fields') question.answer.fields.forEach(item => field(item.label));
    if (question.interaction === 'text') field('Ответ');
    if (question.interaction === 'choice' || question.interaction === 'multi') {
      for (const option of question.options) {
        const label = create('label', undefined, 'option');
        const input = create('input');
        input.type = question.interaction === 'choice' ? 'radio' : 'checkbox'; input.name = 'answer-choice'; input.value = option.id;
        label.append(input, create('span', option.label)); form.append(label); choiceInputs.push(input);
      }
    }
    const feedback = create('div', undefined, 'feedback');
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    const hint = button('Подсказка', () => {
      const level = hooks.attempt.hints < 2 ? ++hooks.attempt.hints : 2;
      hooks.changed();
      showFeedback(`Подсказка ${level}`, question.hints[level - 1], '');
      if (level === 2) hint.textContent = 'Показать подсказку 2';
    });
    const review = button('Посмотреть разбор', () => {
      hooks.attempt.reviewed = true;
      hooks.changed();
      showFeedback(answerText(question), `${question.explanation} Выполни задание, чтобы применить команду.`, '');
    });
    review.hidden = hooks.attempt.errors < 3;
    const submit = create('button', 'Проверить', 'button primary');
    submit.type = 'submit';
    const advance = button(index + 1 < total ? 'Следующее задание →' : 'Применить команду', hooks.finished, true);
    advance.hidden = true;
    const showFeedback = (title: string, text: string, state: string) => {
      feedback.replaceChildren(create('strong', title), document.createTextNode(text));
      feedback.className = `feedback ${state}`;
      feedback.hidden = false;
    };
    if (hooks.attempt.hints >= 2) hint.textContent = 'Показать подсказку 2';
    form.append(feedback, actions(submit, hint, review, advance));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (hooks.attempt.passed) return;
      const values = fields.length ? fields.map(input => input.value) : choiceInputs.filter(input => input.checked).map(input => input.value);
      if (!values.length || values.some(value => !value.trim())) {
        showFeedback('Нужен ответ', 'Заполни все поля или выбери вариант.', 'wrong');
        return;
      }
      const result = evaluate(question, values);
      hooks.attempt.count++;
      const success = result.every(Boolean);
      hooks.attempt.passed = success;
      if (!success) hooks.attempt.errors++;
      hooks.changed();
      hooks.sound(success);
      fields.forEach((input, i) => input.setAttribute('aria-invalid', String(!result[i])));
      if (success) {
        showFeedback('Ответ принят', question.explanation, 'good');
        [...fields, ...choiceInputs].forEach(input => { input.disabled = true; });
        submit.hidden = hint.hidden = review.hidden = true;
        advance.hidden = false;
        advance.focus();
      } else {
        const wrongFields = result.map((valid, i) => valid ? 0 : i + 1).filter(Boolean);
        showFeedback('Команда пока не принята', result.length > 1 ? `Проверь поля ${wrongFields.join(', ')}. Можно открыть подсказку.` : 'Попробуй ещё раз или открой подсказку.', 'wrong');
        review.hidden = hooks.attempt.errors < 3;
      }
    });
    body.append(form);
    fields[0]?.focus();
  }

  voice(question: VoiceQuestion, mode: PlayMode, done: (source: 'self' | 'teacher') => void): void {
    const body = this.show('ГОЛОСОВОЙ ПРОТОКОЛ', 'Кто выполняет действие?');
    body.append(materials(question.materials), create('p', question.prompt, 'question-prompt'));
    const checkArea = create('section');
    const trigger = button(mode === 'solo' ? 'Сверить с образцом' : 'Открыть проверку преподавателя', () => {
      trigger.hidden = true;
      const example = create('div', undefined, 'feedback');
      example.append(create('strong', 'Образец объяснения'), document.createTextNode(question.answer.model));
      checkArea.append(example, create('p', mode === 'solo' ? 'Отметь, что прозвучало в твоём ответе.' : 'Преподаватель отмечает пункты, которые ученик объяснил вслух.', 'dialog-copy'));
      const checks = question.rubric.map(criterion => {
        const label = create('label', undefined, 'rubric-item');
        const input = create('input');
        input.type = 'checkbox';
        label.append(input, create('span', criterion)); checkArea.append(label);
        return input;
      });
      const finish = button(mode === 'solo' ? 'Подтвердить самопроверку' : 'Подтвердить ответ ученика', () => {
        if (!checks.every(input => input.checked)) return;
        this.close();
        done(mode === 'solo' ? 'self' : 'teacher');
      }, true);
      finish.disabled = true;
      checks.forEach(input => input.addEventListener('change', () => {
        finish.disabled = !checks.every(item => item.checked);
      }));
      checkArea.append(actions(finish));
      checks[0]?.focus();
    }, true);
    const hintBlock = create('div', undefined, 'feedback'); hintBlock.hidden = true;
    const hint = button('Подсказка', () => {
      hintBlock.textContent = question.hints[0];
      hintBlock.hidden = false;
    });
    body.append(create('p', mode === 'solo' ? 'Ответь вслух. Можно записать свой ответ и прослушать его здесь.' : 'Ученик отвечает вслух. Для зачёта преподаватель подтверждает ответ по критериям.', 'dialog-copy'));
    if (mode === 'solo') this.voiceRecorder(body);
    body.append(hintBlock, actions(trigger, hint), checkArea);
  }

  private voiceRecorder(parent: HTMLElement): void {
    const group = create('div', undefined, 'voice-tools');
    const status = create('p', undefined, 'feedback-note');
    const audio = create('audio'); audio.controls = true; audio.hidden = true;
    let recorder: MediaRecorder | undefined;
    let stream: MediaStream | undefined;
    let url: string | undefined;
    let active = true;
    const discard = () => {
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      audio.removeAttribute('src');
      audio.hidden = true;
      clear.hidden = true;
    };
    const clear = button('Удалить запись', () => { discard(); status.textContent = 'Запись удалена.'; });
    clear.hidden = true;
    const record = button('Записать ответ', () => {
      if (recorder?.state === 'recording') {
        record.disabled = true;
        recorder.stop();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        status.textContent = 'В этом браузере запись недоступна. Ответь вслух и открой образец.';
        return;
      }
      record.disabled = true;
      status.textContent = 'Запрашиваем доступ к микрофону…';
      void (async () => {
        try {
          const input = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!active) { input.getTracks().forEach(track => track.stop()); return; }
          stream = input;
          discard();
          const chunks: Blob[] = [];
          const current = new MediaRecorder(input);
          recorder = current;
          current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          current.onstop = () => {
            input.getTracks().forEach(track => track.stop());
            if (!active) return;
            record.disabled = false;
            if (chunks.length) {
              url = URL.createObjectURL(new Blob(chunks, { type: current.mimeType }));
              audio.src = url; audio.hidden = false; clear.hidden = false;
            }
            record.textContent = 'Записать заново';
            status.textContent = chunks.length ? 'Запись готова к прослушиванию.' : 'Аудио пустое. Можно попробовать ещё раз.';
          };
          current.start();
          record.textContent = 'Остановить запись';
          status.textContent = 'Идёт запись…';
        } catch {
          stream?.getTracks().forEach(track => track.stop());
          if (active) status.textContent = 'Микрофон недоступен. Устный ответ можно дать без записи.';
        } finally {
          if (active) record.disabled = false;
        }
      })();
    });
    this.cleanup = () => {
      active = false;
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      discard();
    };
    group.append(actions(record, clear), status, audio);
    parent.append(group);
  }

  journal(notes: string[], score: Score, exportScore: () => void): void {
    const body = this.show('ЖУРНАЛ МИРЫ', 'Находки и задания');
    if (notes.length) {
      const list = create('ul', undefined, 'notes');
      notes.forEach(note => list.append(create('li', note)));
      body.append(list);
    } else {
      body.append(create('p', 'Найденные журналы и записи появятся здесь.', 'dialog-copy'));
    }
    this.score(body, score);
    body.append(actions(button('Вернуться', () => this.close(), true), button('Скачать отчёт', exportScore)));
  }

  end(score: Score, menu: () => void, exportScore: () => void, chapter: number): void {
    const evacuated = chapter === 2;
    const body = this.show(evacuated ? 'ЭВАКУАЦИЯ ЗАВЕРШЕНА' : 'ГЛАВА ПРОЙДЕНА', evacuated ? 'Вы на поверхности' : sectors[chapter].name);
    const endings = [
      'Питание восстановлено. Байт свободен, и путь в лабораторию открыт.',
      'Мира нашла исходную запись и выяснила, где Даня. Путь в тоннель открыт.',
      'Даня в безопасности. Байт унёс копию записи Беловой, а станция сохранила правильный маршрут выхода.',
    ];
    body.append(create('p', endings[chapter], 'dialog-copy'));
    this.score(body, score);
    body.append(actions(button('В главное меню', () => { this.close(); menu(); }, true), button('Скачать отчёт', exportScore)));
  }

  private score(body: HTMLElement, score: Score): void {
    const grid = create('div', undefined, 'stat-grid');
    for (const [value, caption] of [
      [`${score.solved} / ${score.total}`, 'Решено заданий'],
      [`${score.independent}`, 'С первой попытки без подсказок'],
      [`${score.errors}`, 'Ошибок в попытках'],
    ]) {
      const card = create('div'); card.append(create('strong', value), create('small', caption)); grid.append(card);
    }
    body.append(grid);
    if (score.voice) body.append(create('p', `Устный ответ — ${score.voice}.`, 'dialog-copy'));
    if (score.review.length) {
      body.append(create('h3', 'Темы для повторения', 'review-heading'));
      const list = create('ul', undefined, 'review-list');
      for (const topic of score.review) {
        const reasons = [topic.errors && `ошибок — ${topic.errors}`, topic.hints && `подсказок — ${topic.hints}`, topic.reviewed && 'открывали разбор'].filter(Boolean);
        list.append(create('li', `${topic.name} · ${reasons.join(', ')}`));
      }
      body.append(list);
    }
  }
}

export interface Score {
  solved: number;
  total: number;
  independent: number;
  errors: number;
  voice: string | null;
  review: { name: string; errors: number; hints: number; reviewed: boolean }[];
}
