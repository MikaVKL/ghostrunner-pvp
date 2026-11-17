/**
 * Time trial: from the own spawn to the other spawn on the clock, with a ghost.
 * A bot brain runs the course like a human would (it follows the route to a fake
 * "enemy" standing on the goal).
 */
import { describe, expect, it } from 'vitest';
import { BotBrain, DEFAULT_PERSONALITY } from '../../src/bots/brain';
import { TICK_MS } from '../../src/shared/config';
import { Button } from '../../src/shared/input';
import { MAPS } from '../../src/shared/maps';
import { createPlayer } from '../../src/shared/sim/playerState';
import { ghostAt, parseGhost, TimeTrial } from '../../src/solo/timeTrial';
import { TrialRun } from '../../src/solo/trialRun';

/** Run the course with a bot brain that never attacks. Returns the session after the finish. */
function runCourse(mapId: string, maxTicks = 60 * 90): TrialRun {
  const run = new TrialRun('Mika', mapId);
  run.start();
  const brain = new BotBrain(5, { ...DEFAULT_PERSONALITY, attackChance: 0, dashAttackChance: 0, parryChance: 0, dodgeChance: 0, punishChance: 0, jumpChance: 0, dashChance: 0 });
  const goal = createPlayer(1, MAPS[mapId].spawns[1]); // the brain walks to "the enemy"
  for (let tick = 0; tick < maxTicks && run.trial.phase !== 'finished'; tick++) {
    run.client.renderClock.advance(TICK_MS);
    const me = run.client.localPlayer;
    const sample = me && run.client.map ? brain.think(me, goal, run.client.map) : { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
    run.client.tick({ ...sample, buttons: sample.buttons & ~Button.Attack });
    run.step();
  }
  return run;
}

describe('time trial clock', () => {
  const start = { x: 0, y: 0, z: 0 };
  const goal = { x: 20, y: 0, z: 0 };
  const at = (x: number, z = 0) => {
    const p = createPlayer(0, { pos: { x, y: 0, z }, yaw: 0 });
    return p;
  };

  it('starts with the first step, counts ticks and stops at the goal', () => {
    const trial = new TimeTrial(start, goal);
    expect(trial.update(at(0))).toBeNull();
    expect(trial.phase).toBe('ready');
    expect(trial.update(at(0.5))).toBe('started');
    for (let x = 1; x < 17; x++) expect(trial.update(at(x))).toBeNull();
    expect(trial.ticks).toBe(16);
    expect(trial.update(at(18))).toBe('finished');
    expect(trial.ticks).toBe(17);
    expect(trial.run()!.samples).toHaveLength(18);
    expect(trial.update(at(30))).toBeNull(); // nothing changes after the finish
  });

  it('a fall (jump back to the spawn) starts the run over', () => {
    const trial = new TimeTrial(start, goal);
    for (const x of [0, 1, 2, 3, 4]) trial.update(at(x)); // running, 1 m per tick
    expect(trial.update(at(0))).toBe('restarted'); // jumped back 4 m at once
    expect(trial.phase).toBe('ready');
    expect(trial.restarts).toBe(1);
    expect(trial.run()).toBeNull();
  });

  it('the ghost follows the recorded run and waits at the goal', () => {
    const run = { ticks: 2, samples: [[0, 0, 0, 0], [1, 0, 0, 0.5], [2, 0, 0, 1]] as [number, number, number, number][] };
    expect(ghostAt(run, 1)!.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(ghostAt(run, 1)!.yaw).toBe(0.5);
    expect(ghostAt(run, 1)!.speed).toBeCloseTo(60);
    expect(ghostAt(run, 99)!.pos.x).toBe(2);
    expect(parseGhost(run)).toEqual(run);
    expect(parseGhost({ ticks: 'fast' })).toBeNull();
    expect(parseGhost({ ticks: 3, samples: [[1, 2]] })).toBeNull();
  });
});

describe('time trial on every map', () => {
  it.each(Object.keys(MAPS))('%s: the course can be finished, the clock stops at the goal', (mapId) => {
    const run = runCourse(mapId);
    expect(run.trial.phase, `not finished, at ${JSON.stringify(run.client.localPlayer?.pos)}`).toBe('finished');
    const result = run.trial.run()!;
    expect(result.ticks).toBeGreaterThan(60 * 2); // not a teleport: at least 2 s
    expect(result.samples).toHaveLength(result.ticks + 1);
    // Practice mode: there is no opponent and no round.
    expect(run.client.snapshot!.match.phase).toBe('waiting');
    expect(run.client.stats.desyncs).toBe(0);
    expect(run.server.stats().errors).toBe(0);
  });

  it('restart gives a fresh session at the start', () => {
    const first = runCourse('arena');
    const second = first.restart();
    second.start();
    for (let i = 0; i < 4; i++) {
      second.client.tick({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 });
      second.step();
    }
    expect(second.trial.phase).toBe('ready');
    expect(second.client.localPlayer!.pos).toEqual(MAPS.arena.spawns[0].pos);
  });
});
