/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot} from './ReactInternalTypes';
import type {ReactPriorityLevel} from './SchedulerWithReactIntegration.new';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';

export opaque type LanePriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export opaque type Lanes = number;
export opaque type Lane = number;

export opaque type LaneMap<T> = Array<T>;

import invariant from 'shared/invariant';

import {
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  LowPriority as LowSchedulerPriority,
  IdlePriority as IdleSchedulerPriority,
  NoPriority as NoSchedulerPriority,
} from './SchedulerWithReactIntegration.new';

export const SyncLanePriority: LanePriority = 10;
export const SyncBatchedLanePriority: LanePriority = 9;
export const InputDiscreteLanePriority: LanePriority = 8;
export const InputContinuousLanePriority: LanePriority = 7;
export const DefaultLanePriority: LanePriority = 6;
export const TransitionShortLanePriority: LanePriority = 5;
export const TransitionLongLanePriority: LanePriority = 4;
export const HydrationLanePriority: LanePriority = 3;
export const IdleLanePriority: LanePriority = 2;
export const OffscreenLanePriority: LanePriority = 1;
export const NoLanePriority: LanePriority = 0;

const TotalLanes = 30;

export const NoLanes: Lanes = /*            */ 0b000000000000000000000000000000;
export const NoLane: Lane = /*              */ 0b000000000000000000000000000000;

export const SyncLane: Lane = /*            */ 0b000000000000000000000000000001;
export const SyncBatchedLane: Lane = /*     */ 0b000000000000000000000000000010;

const InputDiscreteBumpedLane: Lane = /*    */ 0b000000000000000000000000000100;

const InputDiscreteLaneRangeStart = 3;
const InputDiscreteLanes: Lanes = /*        */ 0b000000000000000000000000011000;

const InputContinuousBumpedLane: Lane = /*  */ 0b000000000000000000000000100000;

const InputContinuousLaneRangeStart = 6;
const InputContinuousLanes: Lanes = /*      */ 0b000000000000000000000011000000;

export const DefaultBumpedLane: Lane = /*   */ 0b000000000000000000000100000000;

const DefaultLaneRangeStart = 9;
const DefaultLanes: Lanes = /*              */ 0b000000000000000011111000000000;

const TransitionShortBumpedLane: Lane = /*  */ 0b000000000000000100000000000000;

const TransitionShortLaneRangeStart = 15;
const TransitionShortLaneRangeEnd = 20;
const TransitionShortLanes: Lanes = /*      */ 0b000000000011111000000000000000;

const TransitionLongBumpedLane: Lane = /*   */ 0b000000000100000000000000000000;

const TransitionLongLaneRangeStart = 21;
const TransitionLongLaneRangeEnd = 26;
const TransitionLongLanes: Lanes = /*       */ 0b000011111000000000000000000000;

// Includes all non-Idle updates
const UpdateRangeEnd = 26;
const NonIdleLanes = /*                     */ 0b000011111111111111111111111111;

const IdleBumpedLane: Lane = /*             */ 0b000100000000000000000000000000;

const IdleUpdateLaneRangeStart = 27;
const IdleUpdateLaneRangeEnd = 29;
const IdleUpdateLanes: Lanes = /*           */ 0b011000000000000000000000000000;

export const OffscreenLane: Lane = /*       */ 0b100000000000000000000000000000;

// "Registers" used to "return" multiple values
// Used by getHighestPriorityLanes and getNextLanes:
let return_highestLanePriority: LanePriority = DefaultLanePriority;

function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  if ((SyncLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  if ((InputDiscreteBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return InputDiscreteBumpedLane;
  }
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return inputDiscreteLanes;
  }
  if ((InputContinuousBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = InputContinuousLanePriority;
    return InputContinuousBumpedLane;
  }
  const inputContinuousLanes = InputContinuousLanes & lanes;
  if (inputContinuousLanes !== NoLanes) {
    return_highestLanePriority = InputContinuousLanePriority;
    return inputContinuousLanes;
  }
  if ((DefaultBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = DefaultLanePriority;
    return DefaultBumpedLane;
  }
  const defaultLanes = DefaultLanes & lanes;
  if (defaultLanes !== NoLanes) {
    return_highestLanePriority = DefaultLanePriority;
    return defaultLanes;
  }
  if ((TransitionShortBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = TransitionShortLanePriority;
    return TransitionShortBumpedLane;
  }
  const transitionShortLanes = TransitionShortLanes & lanes;
  if (transitionShortLanes !== NoLanes) {
    return_highestLanePriority = TransitionShortLanePriority;
    return transitionShortLanes;
  }
  if ((TransitionLongBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = TransitionLongLanePriority;
    return TransitionLongBumpedLane;
  }
  const transitionLongLanes = TransitionLongLanes & lanes;
  if (transitionLongLanes !== NoLanes) {
    return_highestLanePriority = TransitionLongLanePriority;
    return transitionLongLanes;
  }
  if ((IdleBumpedLane & lanes) !== NoLanes) {
    return_highestLanePriority = IdleLanePriority;
    return IdleBumpedLane;
  }
  const idleUpdateLanes = IdleUpdateLanes & lanes;
  if ((idleUpdateLanes & lanes) !== NoLanes) {
    return_highestLanePriority = IdleLanePriority;
    return idleUpdateLanes;
  }
  if ((OffscreenLane & lanes) !== NoLanes) {
    return_highestLanePriority = OffscreenLanePriority;
    return OffscreenLane;
  }
  if (__DEV__) {
    console.error('Should have found matching lanes. This is a bug in React.');
  }
  // This shouldn't be reachable, but as a fallback, return the entire bitmask.
  return_highestLanePriority = DefaultLanePriority;
  return lanes;
}

export function schedulerPriorityToLanePriority(
  schedulerPriorityLevel: ReactPriorityLevel,
): LanePriority {
  switch (schedulerPriorityLevel) {
    case ImmediateSchedulerPriority:
      return SyncLanePriority;
    case UserBlockingSchedulerPriority:
      return InputContinuousLanePriority;
    case NormalSchedulerPriority:
    case LowSchedulerPriority:
      // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
      return DefaultLanePriority;
    case IdleSchedulerPriority:
      return IdleLanePriority;
    default:
      return NoLanePriority;
  }
}

export function lanePriorityToSchedulerPriority(
  lanePriority: LanePriority,
): ReactPriorityLevel {
  switch (lanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      return ImmediateSchedulerPriority;
    case InputDiscreteLanePriority:
    case InputContinuousLanePriority:
      return UserBlockingSchedulerPriority;
    case DefaultLanePriority:
    case TransitionShortLanePriority:
    case TransitionLongLanePriority:
      return NormalSchedulerPriority;
    case HydrationLanePriority:
    case IdleLanePriority:
    case OffscreenLanePriority:
      return IdleSchedulerPriority;
    case NoLanePriority:
      return NoSchedulerPriority;
  }
}

export function getNextLanes(root: FiberRoot): Lanes {
  // Early bailout if there's no pending work left.
  const pendingLanes = root.pendingLanes;
  if (pendingLanes === NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return NoLanes;
  }

  // Check if any work has expired.
  const expiredLanes = root.expiredLanes;
  if (expiredLanes !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return expiredLanes;
  }

  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;

  // Do not work on any idle work until all the non-idle work has finished,
  // even if the work is suspended.
  const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
  if (nonIdlePendingLanes !== NoLanes) {
    const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
    if (nonIdleUnblockedLanes !== NoLanes) {
      return getHighestPriorityLanes(nonIdleUnblockedLanes);
    }
    const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
    if (nonIdlePendingLanes !== NoLanes) {
      return getHighestPriorityLanes(nonIdlePingedLanes);
    }
  } else {
    // The only remaining work is Idle.
    const unblockedLanes = pendingLanes & ~suspendedLanes;
    if (unblockedLanes !== NoLanes) {
      return getHighestPriorityLanes(unblockedLanes);
    }
    if (pingedLanes !== NoLanes) {
      return getHighestPriorityLanes(pingedLanes);
    }
  }

  // This should only be reachable if we're suspended
  // TODO: Consider warning in this path if a fallback timer is not scheduled.
  return NoLanes;
}

export function returnNextLanesPriority() {
  return return_highestLanePriority;
}

export function hasIdlePriority(lanes: Lanes) {
  return (lanes & ~NonIdleLanes) !== NoLanes;
}

// To ensure consistency across multiple updates in the same event, this should
// be a pure function, so that it always returns the same lane for given inputs.
export function findUpdateLane(
  lanePriority: LanePriority,
  wipLanes: Lanes,
): Lane {
  switch (lanePriority) {
    case NoLanePriority:
      break;
    case SyncLanePriority:
      return SyncLane;
    case SyncBatchedLanePriority:
      return SyncBatchedLane;
    case InputDiscreteLanePriority: {
      let lane = findLane(
        InputDiscreteLaneRangeStart,
        UpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = 1 << InputDiscreteLaneRangeStart;
      }
      return lane;
    }
    case InputContinuousLanePriority: {
      let lane = findLane(
        InputContinuousLaneRangeStart,
        UpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = 1 << InputContinuousLaneRangeStart;
      }
      return lane;
    }
    case DefaultLanePriority: {
      let lane = findLane(DefaultLaneRangeStart, UpdateRangeEnd, wipLanes);
      if (lane === NoLane) {
        lane = 1 << DefaultLaneRangeStart;
      }
      return lane;
    }
    case TransitionShortLanePriority:
    case TransitionLongLanePriority:
      // Should be handled by findTransitionLane instead
      break;
    case IdleLanePriority:
      let lane = findLane(
        IdleUpdateLaneRangeStart,
        IdleUpdateLaneRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = 1 << IdleBumpedLane;
      }
      return lane;
    case HydrationLanePriority:
    case OffscreenLanePriority:
      // Updates can't have these priorities
      break;
  }
  invariant(
    false,
    'Invalid update priority:  %s. This is a bug in React.',
    lanePriority,
  );
}

// To ensure consistency across multiple updates in the same event, this should
// be pure function, so that it always returns the same lane for given inputs.
export function findTransitionLane(
  lanePriority: LanePriority,
  wipLanes: Lanes,
  pendingLanes: Lanes,
): Lane {
  if (lanePriority === TransitionShortLanePriority) {
    let lane = findLane(
      TransitionShortLaneRangeStart,
      TransitionShortLaneRangeEnd,
      wipLanes | pendingLanes,
    );
    if (lane === NoLane) {
      lane = findLane(
        TransitionShortLaneRangeStart,
        TransitionShortLaneRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = 1 << TransitionShortLaneRangeStart;
      }
    }
    return lane;
  }
  if (lanePriority === TransitionLongLanePriority) {
    let lane = findLane(
      TransitionLongLaneRangeStart,
      TransitionShortLaneRangeEnd,
      wipLanes | pendingLanes,
    );
    if (lane === NoLane) {
      lane = findLane(
        TransitionLongLaneRangeStart,
        TransitionLongLaneRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = 1 << TransitionLongLaneRangeStart;
      }
    }
    return lane;
  }
  invariant(
    false,
    'Invalid transition priority:  %s. This is a bug in React.',
    lanePriority,
  );
}

function findLane(start, end, skipLanes) {
  let lane = 1 << start;
  let i = start;
  while (i < end) {
    if ((skipLanes & lane) === NoLane) {
      return lane;
    }
    i++;
    lane <<= 1;
  }
  return NoLane;
}

export function pickArbitraryLane(lanes: Lanes): Lane {
  // This finds the first non-zero lane.
  // TODO: Consider alternate implementations. Could use a map. Is Math.log2
  // fast? Linear might be fine, though, since the max n is 30.
  if (lanes !== 0) {
    let lane = 1;
    while ((lanes & 1) === 0) {
      lane <<= 1;
    }
    return lane;
  }
  return NoLane;
}

export function includesSomeLane(a: Lanes | Lane, b: Lanes | Lane) {
  return (a & b) !== NoLanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lanes) {
  return (set & subset) === subset;
}

export function combineLanes(a: Lanes | Lane, b: Lanes | Lane): Lanes {
  return a | b;
}

export function removeLanes(set: Lanes, subset: Lanes | lane): Lanes {
  return set & ~subset;
}

// Annoying identity function that converts from single lane to a group
// of lanes.
export function laneToLanes(lane: Lane): Lanes {
  return lane;
}

export function createLaneMap<T>(initial: T): LaneMap<T> {
  return new Array(TotalLanes).fill(initial);
}

export function markRootUpdated(root: FiberRoot, updateLane: Lane) {
  root.pendingLanes |= updateLane;
  // TODO: We can determine exactly which lanes have been unblocked by
  // accumlating the update lanes on the ancestor path. For now, we must assume
  // that anything could have been unblocked.
  root.suspendedLanes = root.pingedLanes = NoLanes;
}

export function markRootSuspended(root: FiberRoot, suspendedLanes: Lanes) {
  // TODO: We can determine exactly which lanes suspended by accumlating the
  // update lanes on the ancestor path.
  root.suspendedLanes |= suspendedLanes;
  root.pingedLanes &= ~suspendedLanes;
}

export function markRootPinged(
  root: FiberRoot,
  pingedLanes: Lanes,
  currentTime: number,
) {
  root.pingedLanes |= pingedLanes & root.suspendedLanes;
}

export function markRootExpired(root: FiberRoot, expiredLanes: Lanes) {
  root.expiredLanes |= expiredLanes & root.pendingLanes;
}

export function markDiscreteUpdatesExpired(root: FiberRoot) {
  root.expiredLanes |=
    (InputDiscreteLanes | InputDiscreteBumpedLane) & root.pendingLanes;
}

export function hasDiscreteLanes(lanes: Lanes) {
  return (lanes & (InputDiscreteLanes | InputDiscreteBumpedLane)) === NoLanes;
}

export function markRootMutableRead(root: FiberRoot, updateLane: Lane) {
  root.mutableReadLanes |= updateLane & root.pendingLanes;
}

export function markRootFinished(root: FiberRoot, remainingLanes: Lanes) {
  // Important note: This is not always the same as the `renderLanes` of that
  // were passed to the commit phase, since it's possible for a render to "leave
  // behind" lanes without finishing them, as with Offscreen or Suspense.
  const finishedLanes = root.pendingLanes & remainingLanes;

  if (finishedLanes !== NoLanes) {
    return;
  }

  root.pendingLanes = remainingLanes;
  root.suspendedLanes &= remainingLanes;
  root.pingedLanes &= remainingLanes;
  root.expiredLanes &= remainingLanes;
  root.mutableReadLanes &= remainingLanes;
}

export function getBumpedLaneForHydration(
  root: FiberRoot,
  renderLanes: Lanes,
): Lane {
  getHighestPriorityLanes(renderLanes);
  const highestLanePriority = return_highestLanePriority;

  let lane;
  switch (highestLanePriority) {
    case SyncLanePriority:
      lane = NoLane;
      break;
    case SyncBatchedLanePriority:
      lane = SyncLane;
      break;
    case InputDiscreteLanePriority:
      lane = InputDiscreteBumpedLane;
      break;
    case InputContinuousLanePriority:
      lane = InputDiscreteBumpedLane;
      break;
    case DefaultLanePriority:
      lane = InputDiscreteBumpedLane;
      break;
    case TransitionShortLanePriority:
      lane = TransitionShortBumpedLane;
      break;
    case TransitionLongLanePriority:
      lane = TransitionLongBumpedLane;
      break;
    case HydrationLanePriority:
    case IdleLanePriority:
    case OffscreenLanePriority:
    case NoLanePriority:
      lane = IdleBumpedLane;
      break;
  }

  // Check if the lane we chose is suspended. If so, that indicates that we
  // already attempted and failed to hydrate at that level. Also check if we're
  // already rendering that lane, which is rare but could happen.
  if ((lane & (root.suspendedLanes | renderLanes)) !== NoLane) {
    // Give up trying to hydrate and fall back to client render.
    return NoLane;
  }

  return lane;
}
