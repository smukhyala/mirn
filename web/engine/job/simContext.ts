import { SIM_CONSTANTS, type RunConfig } from "../contracts/config.js";
import type { Bodies, PairingOrigin } from "./report.js";

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
  /**
   * Always `constructed`, and it is carried here rather than written out at each call site because
   * that is what makes it impossible to get wrong.
   *
   * Everything that reports on a run this bench produced reaches `buildContext` by spreading
   * `contextInitFromConfig(config)` — the console's preview, the drill, the runner, the family
   * probe and every test that measures a simulated pair. Putting the field in this record means all
   * of them state their pairing origin correctly without anybody editing them, and means the ONLY
   * way to reach `buildContext` without saying `constructed` is to build the init by hand, which is
   * exactly what the adapter's callers do and exactly the case that must not default.
   *
   * The value is a constant rather than a parameter because this function's input is a `RunConfig`,
   * and a `RunConfig` is a MIRN simulator setting: reaching this function at all means `runPair`
   * built both arms off one shared noise tape. See `PairingOrigin` in `report.ts`.
   */
  readonly pairingOrigin: PairingOrigin;
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
    pairingOrigin: "constructed" as const,
    bodies: Object.freeze({
      kind: "bodies" as const,
      robotRadiusM: SIM_CONSTANTS.robotRadiusM,
      pedRadiusM: SIM_CONSTANTS.pedRadiusM,
    }),
    straightLineM,
    straightLineArrivalS: straightLineM / config.robot.maxSpeed,
  });
}
