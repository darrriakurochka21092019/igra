const cues = {
  action: [294, 415],
  shot: [164, 62],
  alert: [370, 288],
  hit: [106, 60],
  ok: [330, 415, 554],
  error: [185, 139],
  door: [98, 131, 165],
  echo: [261, 392, 523],
} satisfies Record<string, number[]>;

export class StationSound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private enabled = true;

  unlock(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.23;
      this.master.connect(this.ctx.destination);
      for (const [frequency, amplitude] of [[41, .1], [57, .052], [84, .023]]) {
        const oscillator = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = amplitude;
        oscillator.connect(gain).connect(this.master);
        oscillator.start();
      }
    }
    this.setMuted(false);
    void this.ctx.resume().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.enabled = !muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : .23, this.ctx.currentTime, .04);
  }

  play(cue: keyof typeof cues): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const bus = this.master;
    cues[cue].forEach((frequency, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * (cue === 'shot' ? .026 : .082);
      const length = cue === 'shot' ? .09 : .16;
      oscillator.type = cue === 'shot' || cue === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(36, frequency * .67), at + length);
      gain.gain.setValueAtTime(.001, at);
      gain.gain.linearRampToValueAtTime(cue === 'shot' ? .4 : .32, at + .016);
      gain.gain.exponentialRampToValueAtTime(.001, at + length);
      oscillator.connect(gain).connect(bus);
      oscillator.start(at);
      oscillator.stop(at + length + .02);
    });
  }
}
