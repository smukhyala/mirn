import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { Bodies } from "./report.js";

/**
 * The one module that turns a simulator configuration into what the report layer needs.
 *
 * `report.ts` used to hold a whole `RunConfig`, and read three things out of it: the time step, the
 * treatment (which is on `PairedRun` already) and the robot's start and goal, which it immediately
 * reduced to one distance. Holding the config for that meant every column extractor could reach the
 * simulator's own settings, and two of them reached `SIM_CONSTANTS` for the body sizes as well — so
 * "how close did the robot come to anybody" was measured with MIRN's bodies whatever produced the
 * run.
 *
 * Keeping this conversion here rather than in `report.ts` is the whole point: `report.ts` imports no
 * `RunConfig` and no `SIM_CONSTANTS`, so a run that did not come from this simulator can be reported
 * on without pretending to have a configuration it never had.
 */
export interface SimContextInit {
  readonly dt: number;
  readonly bodies: Bodies;
  readonly straightLineM: number;
  /**
   * `straightLineM` walked flat out at the robot's own speed limit — the fastest `robotArrivalS`
   * could possibly read, and the number `web/app/console/preview.ts`'s `robotArrivalS` geometric
   * bound resolves to. It is computed here rather than read off `config.robot.maxSpeed` downstream
   * for the same reason `straightLineM` is: the speed limit is a MIRN simulator setting, and a run
   * that did not come from this simulator has no such setting to read.
   */
  readonly straightLineArrivalS: number;
}

export function contextInitFromConfig(config: RunConfig): SimContextInit {
  const startX = config.robot.startXY[0];
  const startY = config.robot.startXY[1];
  const goalX = config.robot.goalXY[0];
  const goalY = config.robot.goalXY[1];
  const dx = goalX - startX;
  const dy = goalY - startY;
  const straightLine = Math.sqrt(dx * dx + dy * dy) - SIM_CONSTANTS.goalReachedM;
  let straightLineM = straightLine;
  if (straightLine < 0) {
    straightLineM = 0;
  }

  return Object.freeze({
    dt: config.dt,
    bodies: Object.freeze({
      kind: "bodies" as const,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
    }),
    straightLineM,
    straightLineArrivalS: straightLineM / config.robot.maxSpeed,
  });
}
