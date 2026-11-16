// Match state: rounds, phases, money and win conditions. Pure numbers — no DOM,
// no three.js. main.js pushes events in and reads the phase out.
// Economy: a win pays $3,250; a loss pays $1,900 plus $400 per consecutive
// loss (capped at +$1,200), so a team on a losing streak can still buy back in.
export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const PLANT_TIME = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const PRICES = {
  pistol: 0, smg: 1200, rifle: 2700, shotgun: 1800,
  frag: 300, flash: 200, armor: 650,
};
export const REWARDS = { win: 3250, loss: 1900, lossStreak: 400, kill: 300, plant: 300, defuse: 300 };

export function createMatch() {
  const state = {
    phase: 'menu', // menu | buy | freeze | round | roundEnd | matchEnd
    round: 0,
    score: { sandline: 0, jackals: 0 },
    money: 800,
    timer: 0,
    phaseTimer: 0,
    targetSite: 'A',
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    kills: 0,
    deaths: 0,
    lossStreak: 0,
  };

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.score.sandline = 0;
      state.score.jackals = 0;
      state.money = 800;
      state.timer = BUY_TIME;
      state.phaseTimer = BUY_TIME;
      state.targetSite = Math.random() < 0.5 ? 'A' : 'B';
      state.roundWinner = null;
      state.roundReason = '';
      state.matchWinner = null;
      state.kills = 0;
      state.deaths = 0;
      state.lossStreak = 0;
    },
    startRound() {
      state.phase = 'freeze';
      state.phaseTimer = 2;
      state.timer = ROUND_TIME;
      state.roundWinner = null;
      state.roundReason = '';
    },
    beginCombat() {
      state.phase = 'round';
    },
    endRound(winner, reason) {
      if (state.phase !== 'round' && state.phase !== 'freeze') return;
      state.phase = 'roundEnd';
      state.phaseTimer = 3.5;
      state.roundWinner = winner;
      state.roundReason = reason;
      state.score[winner] += 1;
      if (winner === 'sandline') {
        state.money += REWARDS.win;
        state.lossStreak = 0;
      } else {
        state.money += REWARDS.loss + Math.min(1200, state.lossStreak * REWARDS.lossStreak);
        state.lossStreak += 1;
      }
      if (state.score.sandline >= WIN_ROUNDS || state.score.jackals >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        state.matchWinner = state.score.sandline > state.score.jackals ? 'sandline' : 'jackals';
      }
    },
    nextRound() {
      if (state.matchWinner) {
        state.phase = 'matchEnd';
        return;
      }
      state.round += 1;
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.phaseTimer = BUY_TIME;
      state.targetSite = state.targetSite === 'A' ? 'B' : 'A';
      state.roundWinner = null;
      state.roundReason = '';
    },
    step(dt) {
      if (state.phase === 'buy' || state.phase === 'freeze' || state.phase === 'round') {
        state.phaseTimer -= dt;
      }
      // The displayed timer counts the buy phase down too (15 -> 0).
      if (state.phase === 'buy') state.timer = Math.max(0, state.phaseTimer);
      if (state.phase === 'round') state.timer -= dt;
      if (state.phase === 'buy' && state.phaseTimer <= 0) {
        state.phase = 'freeze';
        state.phaseTimer = 2;
      } else if (state.phase === 'freeze' && state.phaseTimer <= 0) {
        state.phase = 'round';
      } else if (state.phase === 'roundEnd') {
        state.phaseTimer -= dt;
        if (state.phaseTimer <= 0) this.nextRound();
      }
    },
  };
}
