// The match: the one place round state lives. Phases run buy -> live -> end, and
// the match ends at five round wins. Money, scores, the clock and the player's
// health all live here; main.js reads them and the HUD shows them.
export const BUY_SECONDS = 7;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 4;
export const WIN_ROUNDS = 5;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 1400;
export const LOSS_REWARD = 800;
export const MAX_MONEY = 8000;

export function createMatch(hooks) {
  const state = {
    phase: 'buy',
    phaseLeft: BUY_SECONDS,
    round: 1,
    wins: { def: 0, atk: 0 },
    money: START_MONEY,
    health: 100,
    alive: true,
    kills: 0,
    deaths: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    bombPlanted: false,
    bombSite: null,
  };

  function startRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.health = 100;
    state.alive = true;
    state.roundWinner = null;
    state.roundReason = '';
    state.bombPlanted = false;
    state.bombSite = null;
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.matchWinner) return;
    state.phase = 'end';
    state.phaseLeft = END_SECONDS;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.wins[winner] += 1;
    state.money = Math.min(MAX_MONEY, state.money + (winner === 'def' ? WIN_REWARD : LOSS_REWARD));
    hooks.onRoundEnd(winner, reason);
    if (state.wins[winner] >= WIN_ROUNDS) {
      state.matchWinner = winner;
      hooks.onMatchEnd(winner);
    }
  }

  function step(dt) {
    if (state.matchWinner) return;
    state.phaseLeft -= dt;
    if (state.phase === 'buy' && state.phaseLeft <= 0) {
      state.phase = 'live';
      state.phaseLeft = ROUND_SECONDS;
      hooks.onLive();
    } else if (state.phase === 'live' && state.phaseLeft <= 0) {
      if (state.bombPlanted) return; // the bomb timer decides now, not the clock
      endRound('def', 'Time expired: the attack stalled.');
    } else if (state.phase === 'end' && state.phaseLeft <= 0) {
      state.round += 1;
      startRound();
    }
  }

  return {
    state,
    step,
    startRound,
    endRound,
    reset() {
      state.round = 1;
      state.wins.def = 0;
      state.wins.atk = 0;
      state.money = START_MONEY;
      state.kills = 0;
      state.deaths = 0;
      state.matchWinner = null;
      startRound();
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    rewardKill() {
      state.kills += 1;
      state.money = Math.min(MAX_MONEY, state.money + KILL_REWARD);
    },
    damage(amount) {
      if (!state.alive) return false;
      state.health = Math.max(0, state.health - amount);
      if (state.health === 0) {
        state.alive = false;
        state.deaths += 1;
        return true;
      }
      return false;
    },
    plant(site) {
      state.bombPlanted = true;
      state.bombSite = site;
    },
  };
}
