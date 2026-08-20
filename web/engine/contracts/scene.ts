import { fail } from "../core/errors.js";
import type { Trajectory } from "./trajectory.js";

/** Mirrors `Scene` in src/mirn/contracts.py. No deviations. */
export interface Scene {
  readonly kind: "scene";
  readonly sceneId: string;
  readonly pedestrians: readonly Trajectory[];
  readonly robot: Trajectory | null;
  readonly robotPresent: boolean;
  readonly source: string;
  readonly seed: number;
}

export function makeScene(init: {
  sceneId: string;
  pedestrians: readonly Trajectory[];
  robot: Trajectory | null;
  robotPresent: boolean;
  source: string;
  seed: number;
}): Scene {
  const { sceneId, pedestrians, robot, robotPresent, source, seed } = init;

  if (robotPresent && robot === null) {
    fail("Scene.robotPresent is true but Scene.robot is null");
  }
  if (!robotPresent && robot !== null) {
    fail("Scene.robotPresent is false but Scene.robot is not null");
  }

  const seenIds = new Set<string>();
  const seenUids = new Set<number>();
  let dtReference: number | null = null;
  for (const pedestrian of pedestrians) {
    if (seenIds.has(pedestrian.agentId)) {
      fail(`Scene.pedestrians has duplicate agentId '${pedestrian.agentId}'`);
    }
    seenIds.add(pedestrian.agentId);

    if (seenUids.has(pedestrian.agentUid)) {
      fail(`Scene.pedestrians has duplicate agentUid ${pedestrian.agentUid}`);
    }
    seenUids.add(pedestrian.agentUid);

    if (dtReference === null) {
      dtReference = pedestrian.dt;
    } else if (pedestrian.dt !== dtReference) {
      fail(`Scene.pedestrians must share a single dt, got ${pedestrian.dt} != ${dtReference}`);
    }
  }

  return Object.freeze({
    kind: "scene" as const,
    sceneId,
    pedestrians: Object.freeze([...pedestrians]),
    robot,
    robotPresent,
    source,
    seed,
  });
}

export function nPedestrians(scene: Scene): number {
  return scene.pedestrians.length;
}

export function pedestrianById(scene: Scene, agentId: string): Trajectory {
  for (const pedestrian of scene.pedestrians) {
    if (pedestrian.agentId === agentId) {
      return pedestrian;
    }
  }
  return fail(`no pedestrian with agentId '${agentId}' in scene '${scene.sceneId}'`);
}
