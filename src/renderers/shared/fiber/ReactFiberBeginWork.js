/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberBeginWork
 * @flow
 */

'use strict';

import type { ReactCoroutine } from 'ReactCoroutine';
import type { Fiber } from 'ReactFiber';
import type { FiberRoot } from 'ReactFiberRoot';
import type { HostConfig } from 'ReactFiberReconciler';
import type { Scheduler } from 'ReactFiberScheduler';
import type { PriorityLevel } from 'ReactPriorityLevel';
import type { UpdateQueue } from 'ReactFiberUpdateQueue';

var {
  reconcileChildFibers,
  reconcileChildFibersInPlace,
} = require('ReactChildFiber');
var { LowPriority } = require('ReactPriorityLevel');
var ReactTypeOfWork = require('ReactTypeOfWork');
var {
  IndeterminateComponent,
  FunctionalComponent,
  ClassComponent,
  HostContainer,
  HostComponent,
  CoroutineComponent,
  CoroutineHandlerPhase,
  YieldComponent,
} = ReactTypeOfWork;
var {
  NoWork,
  OffscreenPriority,
} = require('ReactPriorityLevel');
var { findNextUnitOfWorkAtPriority } = require('ReactFiberPendingWork');
var {
  createUpdateQueue,
  addToQueue,
  addCallbackToQueue,
  mergeUpdateQueue,
} = require('ReactFiberUpdateQueue');
var ReactInstanceMap = require('ReactInstanceMap');

module.exports = function<T, P, I, C>(config : HostConfig<T, P, I, C>, getScheduler : () => Scheduler) {
  function reconcileChildren(current, workInProgress, nextChildren) {
    // TODO: Children needs to be able to reconcile in place if we are
    // overriding progressed work.
    const priority = workInProgress.pendingWorkPriority;
    reconcileChildrenAtPriority(current, workInProgress, nextChildren, priority);
  }

  function reconcileChildrenAtPriority(current, workInProgress, nextChildren, priorityLevel) {
    if (current && current.childInProgress) {
      workInProgress.childInProgress = reconcileChildFibersInPlace(
        workInProgress,
        current.childInProgress,
        nextChildren,
        priorityLevel
      );
      // This is now invalid because we reused nodes.
      current.childInProgress = null;
    } else if (workInProgress.childInProgress) {
      workInProgress.childInProgress = reconcileChildFibersInPlace(
        workInProgress,
        workInProgress.childInProgress,
        nextChildren,
        priorityLevel
      );
    } else {
      workInProgress.childInProgress = reconcileChildFibers(
        workInProgress,
        current ? current.child : null,
        nextChildren,
        priorityLevel
      );
    }
  }

  function updateFunctionalComponent(current, workInProgress) {
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;
    var nextChildren = fn(props);
    reconcileChildren(current, workInProgress, nextChildren);
  }

  function scheduleUpdate(fiber: Fiber, updateQueue: UpdateQueue, priorityLevel : PriorityLevel): void {
    const { scheduleLowPriWork } = getScheduler();
    fiber.updateQueue = updateQueue;
    // Schedule update on the alternate as well, since we don't know which tree
    // is current.
    if (fiber.alternate !== null) {
      fiber.alternate.updateQueue = updateQueue;
    }
    while (true) {
      if (fiber.pendingWorkPriority === NoWork ||
          fiber.pendingWorkPriority >= priorityLevel) {
        fiber.pendingWorkPriority = priorityLevel;
      }
      if (fiber.alternate !== null) {
        if (fiber.alternate.pendingWorkPriority === NoWork ||
            fiber.alternate.pendingWorkPriority >= priorityLevel) {
          fiber.alternate.pendingWorkPriority = priorityLevel;
        }
      }
      // Duck type root
      if (fiber.stateNode && fiber.stateNode.containerInfo) {
        const root : FiberRoot = (fiber.stateNode : any);
        scheduleLowPriWork(root, priorityLevel);
        return;
      }
      if (!fiber.return) {
        throw new Error('No root!');
      }
      fiber = fiber.return;
    }
  }

  // Class component state updater
  const updater = {
    enqueueSetState(instance, partialState) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = fiber.updateQueue ?
        addToQueue(fiber.updateQueue, partialState) :
        createUpdateQueue(partialState);
      scheduleUpdate(fiber, updateQueue, LowPriority);
    },
    enqueueReplaceState(instance, state) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = createUpdateQueue(state);
      updateQueue.isReplace = true;
      scheduleUpdate(fiber, updateQueue, LowPriority);
    },
    enqueueForceUpdate(instance) {
      const fiber = ReactInstanceMap.get(instance);
      const updateQueue = fiber.updateQueue || createUpdateQueue(null);
      updateQueue.isForced = true;
      scheduleUpdate(fiber, updateQueue, LowPriority);
    },
    enqueueCallback(instance, callback) {
      const fiber = ReactInstanceMap.get(instance);
      let updateQueue = fiber.updateQueue ?
        fiber.updateQueue :
        createUpdateQueue(null);
      addCallbackToQueue(updateQueue, callback);
      fiber.updateQueue = updateQueue;
      if (fiber.alternate) {
        fiber.alternate.updateQueue = updateQueue;
      }
    },
  };

  function updateClassComponent(current : ?Fiber, workInProgress : Fiber) {
    // A class component update is the result of either new props or new state.
    // Account for the possibly of missing pending props by falling back to the
    // memoized props.
    var props = workInProgress.pendingProps;
    if (!props && current) {
      props = current.memoizedProps;
    }
    // Compute the state using the memoized state and the update queue.
    var updateQueue = workInProgress.updateQueue;
    var previousState = current ? current.memoizedState : null;
    var state = updateQueue ?
      mergeUpdateQueue(updateQueue, previousState, props) :
      previousState;

    var instance = workInProgress.stateNode;
    if (!instance) {
      var ctor = workInProgress.type;
      workInProgress.stateNode = instance = new ctor(props);
      state = instance.state || null;
      // The initial state must be added to the update queue in case
      // setState is called before the initial render.
      if (state !== null) {
        workInProgress.updateQueue = createUpdateQueue(state);
      }
      // The instance needs access to the fiber so that it can schedule updates
      ReactInstanceMap.set(instance, workInProgress);
      instance.updater = updater;
    } else if (typeof instance.shouldComponentUpdate === 'function' &&
               !(updateQueue && updateQueue.isForced)) {
      if (current && current.memoizedProps) {
        // Revert to the last flushed props and state, incase we aborted an update.
        instance.props = current.memoizedProps;
        instance.state = current.memoizedState;
        if (!instance.shouldComponentUpdate(props, state)) {
          return bailoutOnCurrent(current, workInProgress, state);
        }
      }
      if (!workInProgress.childInProgress && workInProgress.memoizedProps) {
        // Reset the props and state, in case this is a ping-pong case rather
        // than a completed update case. For the completed update case, the
        // instance props and state will already be the memoized props and state.
        instance.props = workInProgress.memoizedProps;
        instance.state = workInProgress.memoizedState;
        if (!instance.shouldComponentUpdate(props, state)) {
          return bailoutOnAlreadyFinishedWork(current, workInProgress);
        }
      }
    }
    instance.props = props;
    instance.state = state;
    var nextChildren = instance.render();
    reconcileChildren(current, workInProgress, nextChildren);
    return workInProgress.childInProgress;
  }

  function updateHostComponent(current, workInProgress) {
    var nextChildren = workInProgress.pendingProps.children;

    let priority = workInProgress.pendingWorkPriority;
    if (workInProgress.pendingProps.hidden && priority !== OffscreenPriority) {
      // If this host component is hidden, we can reconcile its children at
      // the lowest priority and bail out from this particular pass. Unless, we're
      // currently reconciling the lowest priority.
      // If we have a child in progress already, we reconcile against that set
      // to retain any work within it. We'll recreate any component that was in
      // the current set and next set but not in the previous in progress set.
      // TODO: This attaches a node that hasn't completed rendering so it
      // becomes part of the render tree, even though it never completed. Its
      // `output` property is unpredictable because of it.
      reconcileChildrenAtPriority(current, workInProgress, nextChildren, OffscreenPriority);
      return null;
    } else {
      reconcileChildren(current, workInProgress, nextChildren);
      return workInProgress.childInProgress;
    }
  }

  function mountIndeterminateComponent(current, workInProgress) {
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;
    var value = fn(props);
    if (typeof value === 'object' && value && typeof value.render === 'function') {
      // Proceed under the assumption that this is a class instance
      workInProgress.tag = ClassComponent;
      if (workInProgress.alternate) {
        workInProgress.alternate.tag = ClassComponent;
      }
      value = value.render();
    } else {
      // Proceed under the assumption that this is a functional component
      workInProgress.tag = FunctionalComponent;
      if (workInProgress.alternate) {
        workInProgress.alternate.tag = FunctionalComponent;
      }
    }
    reconcileChildren(current, workInProgress, value);
  }

  function updateCoroutineComponent(current, workInProgress) {
    var coroutine = (workInProgress.pendingProps : ?ReactCoroutine);
    if (!coroutine) {
      throw new Error('Should be resolved by now');
    }
    reconcileChildren(current, workInProgress, coroutine.children);
  }

  function reuseChildren(returnFiber : Fiber, firstChild : Fiber) {
    // TODO on the TODO: Is this not necessary anymore because I moved the
    // priority reset?
    // TODO: None of this should be necessary if structured better.
    // The returnFiber pointer only needs to be updated when we walk into this child
    // which we don't do right now. If the pending work priority indicated only
    // if a child has work rather than if the node has work, then we would know
    // by a single lookup on workInProgress rather than having to go through
    // each child.
    let child = firstChild;
    do {
      // Update the returnFiber of the child to the newest fiber.
      child.return = returnFiber;
      // Retain the priority if there's any work left to do in the children.
      if (child.pendingWorkPriority !== NoWork &&
          (returnFiber.pendingWorkPriority === NoWork ||
          returnFiber.pendingWorkPriority > child.pendingWorkPriority)) {
        returnFiber.pendingWorkPriority = child.pendingWorkPriority;
      }
    } while (child = child.sibling);
  }

  function reuseChildrenEffects(returnFiber : Fiber, firstChild : Fiber) {
    let child = firstChild;
    do {
      // Ensure that the first and last effect of the parent corresponds
      // to the children's first and last effect.
      if (!returnFiber.firstEffect) {
        returnFiber.firstEffect = child.firstEffect;
      }
      if (child.lastEffect) {
        if (returnFiber.lastEffect) {
          returnFiber.lastEffect.nextEffect = child.firstEffect;
        }
        returnFiber.lastEffect = child.lastEffect;
      }
    } while (child = child.sibling);
  }

  function bailoutOnCurrent(current : Fiber, workInProgress : Fiber, state : any) : ?Fiber {
    // The most likely scenario is that the previous copy of the tree contains
    // the same props as the new one. In that case, we can just copy the output
    // and children from that node.
    workInProgress.memoizedProps = workInProgress.pendingProps;
    workInProgress.memoizedState = state;
    workInProgress.output = current.output;
    const priorityLevel = workInProgress.pendingWorkPriority;
    workInProgress.pendingProps = null;
    workInProgress.updateQueue = current.updateQueue = null;
    workInProgress.stateNode = current.stateNode;
    workInProgress.childInProgress = current.childInProgress;
    if (current.child) {
      // If we bail out but still has work with the current priority in this
      // subtree, we need to go find it right now. If we don't, we won't flush
      // it until the next tick.
      workInProgress.child = current.child;
      reuseChildren(workInProgress, workInProgress.child);
      if (workInProgress.pendingWorkPriority !== NoWork && workInProgress.pendingWorkPriority <= priorityLevel) {
        return findNextUnitOfWorkAtPriority(
          workInProgress,
          workInProgress.pendingWorkPriority
        );
      } else {
        return null;
      }
    } else {
      workInProgress.child = null;
      return null;
    }
  }

  function bailoutOnAlreadyFinishedWork(current, workInProgress : Fiber) : ?Fiber {
    // If we started this work before, and finished it, or if we're in a
    // ping-pong update scenario, this version could already be what we're
    // looking for. In that case, we should be able to just bail out.
    const priorityLevel = workInProgress.pendingWorkPriority;
    workInProgress.pendingProps = null;
    workInProgress.updateQueue = null;
    if (workInProgress.alternate) {
      workInProgress.alternate.updateQueue = null;
    }

    workInProgress.firstEffect = null;
    workInProgress.nextEffect = null;
    workInProgress.lastEffect = null;

    const child = workInProgress.child;
    if (child) {
      // Ensure that the effects of reused work are preserved.
      reuseChildrenEffects(workInProgress, child);
      // If we bail out but still has work with the current priority in this
      // subtree, we need to go find it right now. If we don't, we won't flush
      // it until the next tick.
      reuseChildren(workInProgress, child);
      if (workInProgress.pendingWorkPriority !== NoWork &&
          workInProgress.pendingWorkPriority <= priorityLevel) {
        // TODO: This passes the current node and reads the priority level and
        // pending props from that. We want it to read our priority level and
        // pending props from the work in progress. Needs restructuring.
        return findNextUnitOfWorkAtPriority(workInProgress, priorityLevel);
      }
    }
    return null;
  }

  function beginWork(current : ?Fiber, workInProgress : Fiber) : ?Fiber {
    // The current, flushed, state of this fiber is the alternate.
    // Ideally nothing should rely on this, but relying on it here
    // means that we don't need an additional field on the work in
    // progress.
    if (current &&
        workInProgress.pendingProps === current.memoizedProps &&
        workInProgress.updateQueue === null
    ) {
      return bailoutOnCurrent(current, workInProgress, null);
    }

    if (!workInProgress.childInProgress &&
        workInProgress.pendingProps === workInProgress.memoizedProps &&
        workInProgress.updateQueue === null
    ) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress);
    }

    switch (workInProgress.tag) {
      case IndeterminateComponent:
        mountIndeterminateComponent(current, workInProgress);
        return workInProgress.childInProgress;
      case FunctionalComponent:
        updateFunctionalComponent(current, workInProgress);
        return workInProgress.childInProgress;
      case ClassComponent:
        return updateClassComponent(current, workInProgress);
      case HostContainer:
        reconcileChildren(current, workInProgress, workInProgress.pendingProps);
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        if (workInProgress.childInProgress) {
          return beginWork(
            workInProgress.childInProgress.alternate,
            workInProgress.childInProgress
          );
        }
        return null;
      case HostComponent:
        return updateHostComponent(current, workInProgress);
      case CoroutineHandlerPhase:
        // This is a restart. Reset the tag to the initial phase.
        workInProgress.tag = CoroutineComponent;
        // Intentionally fall through since this is now the same.
      case CoroutineComponent:
        updateCoroutineComponent(current, workInProgress);
        // This doesn't take arbitrary time so we could synchronously just begin
        // eagerly do the work of workInProgress.child as an optimization.
        if (workInProgress.childInProgress) {
          return beginWork(
            workInProgress.childInProgress.alternate,
            workInProgress.childInProgress
          );
        }
        return workInProgress.childInProgress;
      case YieldComponent:
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        if (workInProgress.sibling) {
          return beginWork(
            workInProgress.sibling.alternate,
            workInProgress.sibling
          );
        }
        return null;
      default:
        throw new Error('Unknown unit of work tag');
    }
  }

  return {
    beginWork,
  };

};
