import { BASS_SCALE, MELODY_SCALE, PHRASE_GAP_MS } from './constants';
import { audioGraph } from './graph';
import { scheduleTone } from './scheduler';
import { musicPlayer } from './trackPlayer';
import { TRACKS, TRACK_VOLUMES } from './tracks';

type PhraseFn = () => void;
const PHRASE_DURATIONS_MS = [5200, 4800, 3600];

function playMelodicPhrase() {
  const melody = [MELODY_SCALE[0], MELODY_SCALE[2], MELODY_SCALE[4], MELODY_SCALE[2], MELODY_SCALE[1], MELODY_SCALE[3], MELODY_SCALE[2], MELODY_SCALE[0]];
  melody.forEach((note, i) => scheduleTone('music', note, 1.1, 0.06, 'sine', i * 0.55));
  [BASS_SCALE[0], BASS_SCALE[2], BASS_SCALE[1], BASS_SCALE[0]].forEach((note, i) => {
    scheduleTone('music', note, 1.8, 0.035, 'triangle', i * 1.1);
  });
}

function playVariationPhrase() {
  const melody = [MELODY_SCALE[2], MELODY_SCALE[4], MELODY_SCALE[5], MELODY_SCALE[4], MELODY_SCALE[3], MELODY_SCALE[1], MELODY_SCALE[0], null];
  melody.forEach((note, i) => { if (note) scheduleTone('music', note, 1.0, 0.055, 'sine', i * 0.5); });
}

function playRestPhrase() {
  scheduleTone('music', MELODY_SCALE[0], 2.2, 0.055, 'sine', 0);
}

const PHRASES: PhraseFn[] = [playMelodicPhrase, playVariationPhrase, playRestPhrase];

class BackgroundMusicPlayer {
  private running = false;
  private usingSamples = false;
  private isNight = false;
  private phraseIndex = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  get isRunning() {
    return this.running;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    audioGraph.setMusicBrightness(false);

    const track = this.isNight ? TRACKS.night : TRACKS.day;
    const vol = this.isNight ? TRACK_VOLUMES.night : TRACK_VOLUMES.day;
    const ok = await musicPlayer.playLoop(track, 'music', vol, 1.4);
    if (ok) {
      this.usingSamples = true;
      return;
    }

    this.usingSamples = false;
    this.phraseIndex = 0;
    this.scheduleProcedural();
  }

  stop() {
    this.running = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.usingSamples) musicPlayer.stop(0.8);
    this.usingSamples = false;
  }

  async setNightMode(isNight: boolean) {
    if (this.isNight === isNight) return;
    this.isNight = isNight;
    if (!this.running || !this.usingSamples) return;

    const track = isNight ? TRACKS.night : TRACKS.day;
    const vol = isNight ? TRACK_VOLUMES.night : TRACK_VOLUMES.day;
    await musicPlayer.crossfadeLoop(track, 'music', vol, 3);
  }

  private scheduleProcedural() {
    if (!this.running || this.usingSamples) return;
    const current = this.phraseIndex % PHRASES.length;
    if (!audioGraph.isMuted) PHRASES[current]();
    this.phraseIndex++;
    this.timeout = setTimeout(() => this.scheduleProcedural(), PHRASE_DURATIONS_MS[current] + PHRASE_GAP_MS);
  }
}

export const backgroundMusic = new BackgroundMusicPlayer();