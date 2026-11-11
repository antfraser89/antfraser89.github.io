// The screens that sit round the two main pages. Each module is handed the
// shell's kit and gives back the functions that open it.
import club from './club.js';
import chests from './chests.js';
import draw from './draw.js';
import festival from './festival.js';
import merge from './merge.js';
import missions from './missions.js';
import offers from './offers.js';
import park from './park.js';
import pass from './pass.js';
import pets from './pets.js';
import profile from './profile.js';
import trail from './trail.js';

export function installScreens(kit) {
  const screens = {};
  kit.screens = screens;
  Object.assign(screens, {
    park: park(kit), profile: profile(kit), offers: offers(kit), pets: pets(kit), club: club(kit), missions: missions(kit),
    pass: pass(kit), festival: festival(kit), merge: merge(kit), draw: draw(kit), trail: trail(kit), chests: chests(kit),
  });
  return screens;
}
