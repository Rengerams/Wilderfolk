export type HumanChatContext =
  | 'social'
  | 'courtship'
  | 'work'
  | 'visitor'
  | 'rival'
  | 'hunt'
  | 'child'
  | 'pregnant'
  | 'affair'
  | 'sleep'
  | 'renffr';

const CHAT_LINES: Record<HumanChatContext, string[]> = {
  social: ['Hey!', 'Fine day.', 'Cold out.', 'Good harvest?', 'Wolves again…', 'Roads help.', 'Hungry yet?', 'Fine village.'],
  courtship: ['Lovely day…', 'Hi there.', 'Nice boots.', 'Walk with me?', 'Pretty view.', 'Fancy meeting you.'],
  work: ['Hard work!', 'More wood!', 'Almost done.', 'Busy day.', 'Good yield.', 'Keep at it.'],
  visitor: ['Greetings!', 'Trade?', 'Safe roads?', 'Fine village.', 'Passing through.'],
  rival: ['Hmm.', 'Watching you.', 'Our land too.', 'Mind your fences.'],
  hunt: ['There!', 'Shhh…', 'Prey!', 'Got one!', 'Quiet…'],
  child: ['Mama!', 'Look!', 'Yay!', 'Wait up!', 'Hehe!'],
  pregnant: ['Oof…', 'Soon…', 'Heavy…', 'Little kick…'],
  affair: ['Shh…', 'Meet me later.', 'Don\'t tell.', 'Quick kiss.', 'They\'ll never know.', 'Our secret.'],
  sleep: ['Zzz…', 'Good night.', 'Home sweet home.', 'Long day…'],
  renffr: [
    'I saw Renffr in the stars…',
    'The mark of Renffr… plentiful harvest?',
    'Did anyone else see the sky?',
    'Renffr — old valley omen.',
    'The letters scattered…',
    'Grandmother feared that name.',
    'Just a shepherd\'s tale… right?',
    'Something wrote Renffr up there.',
  ],
};

/** Force a specific line (e.g. rare world events). */
export function sayHumanChatPhrase(
  entity: { chatPhrase?: string; chatTicks?: number },
  phrase: string,
  durationTicks = 120,
): void {
  entity.chatPhrase = phrase;
  entity.chatTicks = durationTicks;
}

export function pickChatPhrase(context: HumanChatContext, entityId: number, tick: number): string {
  const lines = CHAT_LINES[context];
  const idx = (entityId * 31 + tick + context.length * 17) % lines.length;
  return lines[idx];
}

export function startHumanChat(
  entity: { chatPhrase?: string; chatTicks?: number },
  context: HumanChatContext,
  entityId: number,
  tick: number,
  durationTicks = 90,
): void {
  if (entity.chatTicks && entity.chatTicks > 0) return;
  entity.chatPhrase = pickChatPhrase(context, entityId, tick);
  entity.chatTicks = durationTicks;
}

export function tickHumanChat(entity: { chatPhrase?: string; chatTicks?: number }): void {
  if (!entity.chatTicks || entity.chatTicks <= 0) return;
  entity.chatTicks--;
  if (entity.chatTicks <= 0) {
    entity.chatTicks = 0;
    entity.chatPhrase = undefined;
  }
}

export function maybeHumanChat(
  entity: { chatPhrase?: string; chatTicks?: number },
  context: HumanChatContext,
  entityId: number,
  tick: number,
  chance: number,
  durationTicks = 90,
): void {
  if (entity.chatTicks && entity.chatTicks > 0) return;
  if (Math.random() > chance) return;
  startHumanChat(entity, context, entityId, tick, durationTicks);
}

export function getAnimatedChatDots(tick: number, entityId: number): string {
  const phase = Math.floor((tick + entityId) / 12) % 4;
  return '.'.repeat(phase || 1);
}