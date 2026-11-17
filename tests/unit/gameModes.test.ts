/**
 * Game modes: the rules of a match as data (src/shared/match/gameModes.ts).
 * A made-up test mode switches on every rule, so each one is checked on its own.
 */
import { describe, expect, it } from 'vitest';
import { GameServer } from '../../src/server/gameServer';
import { attackTotalTicks, WEAPONS } from '../../src/shared/combat/weapons';
import { ARENA_MODE, DUEL, getMode, isModeId, matchConfigForMode, MODES, type GameMode } from '../../src/shared/match/gameModes';
import { DEFAULT_MATCH_CONFIG, FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { parseClientMessage } from '../../src/shared/protocol/codec';
import { secondsToTicks } from '../../src/shared/config';
import type { GameEvent } from '../../src/shared/sim/events';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import type { SimContext, WorldState } from '../../src/shared/sim/world';
import { Button, hold, input, playingWorld, standingPlayer, TEST_CTX, TEST_MAP } from '../helpers';
import { TestClient } from '../serverHelpers';

const light = WEAPONS.sword.attacks.light;
const dash = WEAPONS.sword.attacks.dash;

const RULES: GameMode = {
  ...DUEL,
  lives: 3,
  damage: { light: 1, dash: 2, air: 1 },
  invulnerableTicks: 30,
  parryCounterTicks: 90,
  parryCounterBonus: 1,
  dashCooldownTicks: 90,
  dashAttackExtraRecoveryTicks: 12,
};
const CTX: SimContext = { ...TEST_CTX, mode: RULES };

/** `slot` presses attack once (optionally with dash); returns the events until the swing is over. */
function swingBy(world: WorldState, slot: number, extraButtons = 0, other: Partial<{ buttons: number; at: number }> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  const attacker = world.players[slot];
  const defender = world.players[1 - slot];
  for (let tick = 0; tick < attackTotalTicks(dash) + 20 && world.match.phase === 'playing'; tick++) {
    const result = stepWorld(
      world,
      {
        [slot]: hold(attacker, { buttons: tick === 0 ? Button.Attack | extraButtons : 0 }),
        [1 - slot]: hold(defender, { buttons: tick === (other.at ?? -1) ? (other.buttons ?? 0) : 0 }),
      },
      CTX,
    );
    events.push(...result.events);
  }
  return events;
}

/** Put both players back at their spawns, standing still (after knockback pushed them apart). */
function lineUp(world: WorldState): void {
  for (const p of world.players) {
    p.pos = { ...TEST_MAP.spawns[p.slot].pos };
    p.vel = { x: 0, y: 0, z: 0 };
  }
}

describe('game mode data', () => {
  it('the duel keeps the original rules: one hit kills, best-of-5, 60 s rounds', () => {
    expect(DUEL.lives).toBe(1);
    expect(DUEL.damage).toEqual({ light: 1, dash: 1, air: 1 });
    expect(DUEL.invulnerableTicks).toBe(0);
    expect(DUEL.parryCounterBonus).toBe(0);
    expect(DUEL.dashAttackExtraRecoveryTicks).toBe(0);
    expect(DUEL.dashCooldownTicks).toBe(MOVE.dashCooldownTicks);
    expect(DUEL.roundsToWin).toBe(3);
    expect(DUEL.maxRounds).toBe(9);
    expect(DUEL.roundTicks).toBe(secondsToTicks(60));
    expect(matchConfigForMode(DEFAULT_MATCH_CONFIG, DUEL, true)).toEqual(DEFAULT_MATCH_CONFIG);
  });

  it('every mode has German texts, a damage value per attack kind and sane numbers', () => {
    for (const [id, mode] of Object.entries(MODES)) {
      expect(mode.id).toBe(id);
      expect(mode.name.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(10);
      expect(Object.keys(mode.damage).sort()).toEqual(Object.keys(WEAPONS.sword.attacks).sort());
      expect(mode.lives).toBeGreaterThanOrEqual(1);
      expect(mode.roundsToWin).toBeGreaterThanOrEqual(1);
      expect(mode.maxRounds).toBeGreaterThanOrEqual(mode.roundsToWin * 2 - 1);
      expect(Number.isInteger(mode.dashCooldownTicks)).toBe(true);
    }
  });

  it('unknown mode ids fall back to the duel', () => {
    expect(isModeId('duel')).toBe(true);
    expect(isModeId('toString')).toBe(false);
    expect(getMode('nope')).toBe(DUEL);
  });

  it('round rules come from the mode unless the server has its own config (tests)', () => {
    const rules = { ...DUEL, roundsToWin: 5, maxRounds: 11, roundTicks: 99 };
    expect(matchConfigForMode(FAST_MATCH_CONFIG, rules, false)).toBe(FAST_MATCH_CONFIG);
    expect(matchConfigForMode(DEFAULT_MATCH_CONFIG, rules, true)).toMatchObject({
      roundsToWin: 5,
      maxRounds: 11,
      roundTicks: 99,
      countdownTicks: DEFAULT_MATCH_CONFIG.countdownTicks,
    });
  });
});

describe('mode rules in the simulation', () => {
  it('players start every round with the lives of the mode', () => {
    const world = playingWorld(CTX);
    expect(world.players.map((p) => p.hp)).toEqual([3, 3]);
  });

  it('a hit removes the damage of the mode, the target survives and is briefly invulnerable', () => {
    const world = playingWorld(CTX);
    const events = swingBy(world, 0);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits).toEqual([expect.objectContaining({ damage: 1, hpLeft: 2, counter: false })]);
    expect(world.players[1].alive).toBe(true);
    expect(world.match.phase).toBe('playing');
  });

  it('sets the invulnerability right on the hit', () => {
    const world = playingWorld(CTX);
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, CTX);
    for (let i = 0; i < light.startupTicks + 2; i++) {
      const { events } = stepWorld(world, { 0: hold(a), 1: hold(b) }, CTX);
      if (events.some((e) => e.type === 'hit')) break;
    }
    expect(b.invulnerableTicks).toBe(RULES.invulnerableTicks);
  });

  it('an invulnerable target cannot be hit', () => {
    const world = playingWorld(CTX);
    world.players[1].invulnerableTicks = 200;
    expect(swingBy(world, 0).some((e) => e.type === 'hit')).toBe(false);
    expect(world.players[1].hp).toBe(3);
  });

  it('a dash attack does the dash damage of the mode', () => {
    const world = playingWorld(CTX);
    const hits = swingBy(world, 0, Button.Dash).filter((e) => e.type === 'hit');
    expect(hits).toEqual([expect.objectContaining({ kind: 'dash', damage: 2, hpLeft: 1 })]);
  });

  it('after a successful parry the next hit of the defender does bonus damage', () => {
    const world = playingWorld(CTX);
    const parried = swingBy(world, 0, 0, { buttons: Button.Parry, at: light.startupTicks - 4 });
    expect(parried.some((e) => e.type === 'parry')).toBe(true);
    expect(world.players[1].counterTicks).toBeGreaterThan(0);
    lineUp(world);
    const hits = swingBy(world, 1).filter((e) => e.type === 'hit');
    expect(hits).toEqual([expect.objectContaining({ attacker: 1, damage: 2, counter: true, hpLeft: 1 })]);
    expect(world.players[1].counterTicks).toBe(0); // used up
  });

  it('without a parry there is no bonus', () => {
    const world = playingWorld(CTX);
    const hits = swingBy(world, 1).filter((e) => e.type === 'hit');
    expect(hits).toEqual([expect.objectContaining({ damage: 1, counter: false })]);
  });

  it('the dash cooldown of the mode applies', () => {
    const p = standingPlayer(0, 0);
    const press = (buttons: number) => stepPlayer(p, input({ yaw: p.yaw, buttons }), TEST_MAP, 'playing', RULES);
    press(Button.Dash);
    expect(p.dashCooldown).toBe(RULES.dashCooldownTicks);
    for (let i = 0; i < MOVE.dashCooldownTicks; i++) press(0);
    press(Button.Dash); // the duel cooldown is over, this mode's is not
    expect(p.dashTicks).toBe(0);
    while (p.dashCooldown > 0) press(0);
    press(Button.Dash);
    expect(p.dashTicks).toBeGreaterThan(0);
  });

  it('a dash attack recovers longer by the extra recovery of the mode', () => {
    const swingLength = (mode: GameMode) => {
      const p = standingPlayer(0, 0);
      stepPlayer(p, input({ yaw: p.yaw, buttons: Button.Dash | Button.Attack }), TEST_MAP, 'playing', mode);
      expect(p.attackKind).toBe('dash');
      let ticks = 1;
      while (p.action === 'attack') {
        stepPlayer(p, input({ yaw: p.yaw }), TEST_MAP, 'playing', mode);
        ticks++;
      }
      return ticks;
    };
    expect(swingLength(RULES) - swingLength(DUEL)).toBe(RULES.dashAttackExtraRecoveryTicks);
  });
});

describe('arena mode', () => {
  const ARENA_CTX: SimContext = { ...TEST_CTX, mode: ARENA_MODE };

  it('has the rules that were asked for', () => {
    expect(ARENA_MODE.lives).toBe(3);
    expect(ARENA_MODE.damage.light).toBe(1);
    expect(ARENA_MODE.damage.dash).toBeGreaterThan(ARENA_MODE.damage.light); // dash attack hurts more ...
    expect(ARENA_MODE.dashAttackExtraRecoveryTicks).toBeGreaterThan(0); // ... but recovers longer
    expect(ARENA_MODE.invulnerableTicks).toBeGreaterThan(0);
    expect(ARENA_MODE.parryCounterBonus).toBeGreaterThan(0);
    expect(ARENA_MODE.dashCooldownTicks).toBeGreaterThan(DUEL.dashCooldownTicks); // against endless kiting
    expect(ARENA_MODE.windupCueByDefault).toBe(true);
    // The counter window outlasts the stun, so the stunned attacker can really be punished.
    expect(ARENA_MODE.parryCounterTicks).toBeGreaterThanOrEqual(60);
  });

  it('a round needs three normal hits, with invulnerability in between', () => {
    const world = playingWorld(ARENA_CTX);
    const [a, b] = world.players;
    let hits = 0;
    for (let tick = 0; tick < 2000 && world.match.phase === 'playing'; tick++) {
      lineUp(world);
      // Swing again and again; the invulnerability lets some swings pass through.
      const buttons = tick % 40 === 0 ? Button.Attack : 0;
      const { events } = stepWorld(world, { 0: hold(a, { buttons }), 1: hold(b) }, ARENA_CTX);
      for (const e of events) if (e.type === 'hit') {
        hits++;
        expect(e.hpLeft).toBe(3 - hits);
        if (e.hpLeft > 0) expect(b.invulnerableTicks).toBe(ARENA_MODE.invulnerableTicks);
      }
    }
    expect(hits).toBe(3);
    expect(world.match.scores).toEqual([1, 0]);
  });

  it('the next round starts with full lives again', () => {
    const world = playingWorld(ARENA_CTX);
    world.players[1].hp = 0;
    for (let i = 0; i < 300 && world.match.phase !== 'countdown'; i++) stepWorld(world, {}, ARENA_CTX);
    expect(world.match.round).toBe(2);
    expect(world.players.map((p) => p.hp)).toEqual([3, 3]);
  });
});

describe('mode over the network', () => {
  it('the codec accepts known modes and rejects unknown ones', () => {
    expect(parseClientMessage('{"type":"createRoom","name":"A","modeId":"duel"}')).toEqual({
      type: 'createRoom',
      name: 'A',
      modeId: 'duel',
    });
    expect(parseClientMessage('{"type":"createRoom","name":"A","modeId":"chess"}')).toBeNull();
    expect(parseClientMessage('{"type":"quickMatch","name":"A","modeId":"duel"}')).toEqual({
      type: 'quickMatch',
      name: 'A',
      modeId: 'duel',
    });
    expect(parseClientMessage('{"type":"quickMatch","name":"A","modeId":7}')).toBeNull();
  });

  it('a room tells its players its mode', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const a = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A', modeId: 'duel' });
    expect(a.last('roomJoined')!.modeId).toBe('duel');
    const b = new TestClient(server);
    b.send({ type: 'quickMatch', name: 'B' });
    expect(b.last('roomJoined')!.modeId).toBe('duel');
  });

  it('quick match only pairs players who want the same mode', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const duel = new TestClient(server);
    duel.send({ type: 'quickMatch', name: 'D' });
    const arena = new TestClient(server);
    arena.send({ type: 'quickMatch', name: 'A', modeId: 'arena' });
    expect(arena.last('roomJoined')!.code).not.toBe(duel.last('roomJoined')!.code);
    expect(arena.last('roomJoined')!.modeId).toBe('arena');
    const arena2 = new TestClient(server);
    arena2.send({ type: 'quickMatch', name: 'A2', modeId: 'arena' });
    expect(arena2.last('roomJoined')!.code).toBe(arena.last('roomJoined')!.code);
    const duel2 = new TestClient(server);
    duel2.send({ type: 'quickMatch', name: 'D2', modeId: 'duel' });
    expect(duel2.last('roomJoined')!.code).toBe(duel.last('roomJoined')!.code);
  });

  it('a server without its own config uses the round rules of each mode', () => {
    const server = new GameServer();
    const duel = new TestClient(server);
    duel.send({ type: 'createRoom', name: 'D', modeId: 'duel' });
    const arena = new TestClient(server);
    arena.send({ type: 'createRoom', name: 'A', modeId: 'arena' });
    expect(duel.last('roomJoined')!.roundsToWin).toBe(DUEL.roundsToWin);
    expect(arena.last('roomJoined')!.roundsToWin).toBe(ARENA_MODE.roundsToWin);
  });
});
