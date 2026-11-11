// One place that knows about every part of the game, for the things that
// touch all of them: the clock, and the little red numbers on the buttons.
import * as E from './economy.js';
import { cardStatus, spinsStatus, teamInfo } from './meta/club.js';
import { festivalInfo, festivalTick } from './meta/festival.js';
import { missionsInfo, missionsTick } from './meta/missions.js';
import { passInfo, passTick } from './meta/pass.js';
import { mergeTick } from './games/merge.js';
import { trailTick } from './games/trail.js';
import * as R from './rules.js';

// Everything driven by the wall clock.
export function tick(state, now) {
  const res = R.tick(state, now);
  mergeTick(state, now);
  trailTick(state, now);
  missionsTick(state, now);
  passTick(state, now);
  festivalTick(state, now);
  return res;
}

// How many things are waiting to be collected in each part of the game.
export function waiting(state, now) {
  const open = (id) => E.unlocked(state, id);
  const club = open('club') ? teamInfo(state, now).ready + (spinsStatus(state, now).state === 'ready' ? 1 : 0) + (cardStatus(state, now).state === 'ready' ? 1 : 0) : 0;
  return {
    missions: open('missions') ? missionsInfo(state, now).ready : 0,
    pass: open('pass') ? passInfo(state, now).ready : 0,
    festival: open('festival') && festivalInfo(state, now).ready ? 1 : 0,
    club,
    merge: open('merge') ? state.inv.energy : 0,
    draw: open('draw') ? state.inv.pearls : 0,
    trail: open('trail') ? state.inv.shots : 0,
    chests: open('chests') ? state.inv.keys : 0,
    parkChests: E.parkChestsDue(state),
  };
}
