/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';

import invariant from 'fbjs/lib/invariant';
import warning from 'fbjs/lib/warning';

import {ClassComponent} from 'shared/ReactTypeOfWork';
import getComponentName from 'shared/getComponentName';
import {getStackAddendumByWorkInProgressFiber} from 'shared/ReactFiberComponentTreeHook';
import {REACT_CAPTURED_VALUE} from 'shared/ReactSymbols';

import {logCapturedError} from './ReactFiberErrorLogger';

const getPrototypeOf =
  Object.getPrototypeOf === 'function' ? Object.getPrototypeOf : null;
const objectToString = Object.prototype.toString;

export type TypeOfCapturedValue = 0 | 1 | 2 | 3 | 4 | 5;

export const UnknownType = 0;
export const ErrorType = 1;
export const PromiseType = 2;
export const BlockerType = 3;
export const TimeoutType = 4;
export const CombinedType = 5;

export type CapturedValue<T> = {|
  $$typeof: Symbol | number,
  value: T,
  tag: TypeOfCapturedValue,
  source: Fiber | null,
  boundary: Fiber | null,
  stack: string | null,
|};

// Object that is passed to the error logger module.
// TODO: CapturedError is different from CapturedValue for legacy reasons, but I
// don't think it's exposed to anyone outside FB, so we can probably change it.
export type CapturedError = {
  componentName: string | null,
  componentStack: string,
  error: mixed,
  errorBoundary: Fiber | null,
  errorBoundaryFound: boolean,
  errorBoundaryName: string | null,
  willRetry: boolean,
};

// TODO: Use module constructor
let capturedValueStack: Array<Array<CapturedValue<mixed>> | null> = [];
let index = -1;

let fiberStack;
let didWarn;
if (__DEV__) {
  fiberStack = [];
  didWarn = false;
}

export function pushFrame(returnFiber: Fiber | null) {
  index += 1;
  if (__DEV__) {
    fiberStack[index] = returnFiber;
  }
  capturedValueStack[index] = null;
}

function getCurrentFrame(returnFiber: Fiber) {
  const currentFrame = capturedValueStack[index];
  invariant(
    currentFrame !== undefined,
    'Expected a current frame. This error is likely caused by a bug in ' +
      'React. Please file an issue.',
  );
  return currentFrame;
}

export function frameHasCapturedValues(returnFiber: Fiber | null) {
  if (__DEV__ && !didWarn) {
    didWarn = true;
    warning(fiberStack[index] === returnFiber, 'Mismatch');
  }
  return getCurrentFrame() !== null;
}

export function addValueToFrame(
  capturedValue: CapturedValue<mixed>,
  returnFiber: Fiber,
): void {
  if (__DEV__ && !didWarn) {
    didWarn = true;
    warning(fiberStack[index] === returnFiber, 'Mismatch');
  }

  const currentFrame = getCurrentFrame();
  if (currentFrame === null) {
    capturedValueStack[index] = [capturedValue];
  } else {
    currentFrame.push(capturedValue);
  }
}

export function captureValuesOnFrame(
  returnFiber: Fiber,
): Array<CapturedValue<mixed>> | null {
  const values = getCurrentFrame();
  capturedValueStack[index] = null;
  if (__DEV__ && !didWarn) {
    didWarn = true;
    warning(fiberStack[index] === returnFiber, 'Mismatch');
  }
  return values;
}

export function setValuesOnFrame(
  values: Array<CapturedValue<mixed>>,
  returnFiber: Fiber,
) {
  capturedValueStack[index] = values;
  if (__DEV__ && !didWarn) {
    didWarn = true;
    warning(fiberStack[index] === returnFiber, 'Mismatch');
  }
}

export function popFrameAndBubbleValues(returnFiber: Fiber) {
  const currentFrame = getCurrentFrame();
  invariant(
    index > -1,
    'Unexpected pop. This error is likely caused by a bug in React. Please ' +
      'file an issue.',
  );
  if (__DEV__ && !didWarn) {
    didWarn = true;
    warning(fiberStack[index] === returnFiber, 'Mismatch');
  }
  index--;
  if (currentFrame === null) {
    // No values to bubble. Do nothing.
    return;
  }
  if (index === -1) {
    // Reached the bottom of the stack. Do nothing.
    return;
  }
  const previousFrame = getCurrentFrame();
  if (previousFrame === null) {
    capturedValueStack[index] = currentFrame;
  } else {
    for (let i = 0; i < currentFrame.length; i++) {
      previousFrame.push(currentFrame[i]);
    }
  }
}

export function resetCapturedValueStack() {
  while (index > -1) {
    capturedValueStack[index] = null;
    index--;
    if (__DEV__) {
      fiberStack[index] = null;
    }
  }
}

// Call this immediately after the value is thrown.
export function createCapturedValue<T>(
  value: T,
  source: Fiber | null,
): CapturedValue<T> {
  if (
    value !== null &&
    value !== undefined &&
    value.$$typeof === REACT_CAPTURED_VALUE
  ) {
    // Value is already a captured value
    return (value: any);
  }

  let tag = UnknownType;
  if (value instanceof Promise) {
    tag = PromiseType;
  } else if (value instanceof Error) {
    tag = ErrorType;
  } else if (getPrototypeOf !== null) {
    // instanceof fails across realms. Check the prototype chain.
    let proto = getPrototypeOf(value);
    while (proto !== null) {
      if (objectToString.call(proto) === '[object Error]') {
        tag = ErrorType;
        break;
      }
      proto = getPrototypeOf(value);
    }
  }

  // If the tag is still unknown, fall back to duck typing.
  if (value !== null && typeof value === 'object') {
    if (typeof value.then === 'function') {
      tag = PromiseType;
    } else if (
      typeof value.stack === 'string' &&
      typeof value.message === 'string'
    ) {
      tag = ErrorType;
    }
  }

  return {
    $$typeof: REACT_CAPTURED_VALUE,
    value,
    tag,
    source,
    boundary: null,
    // Don't compute the stack unless this is an error.
    stack:
      source !== null && tag === ErrorType
        ? getStackAddendumByWorkInProgressFiber(source)
        : null,
  };
}

export function createBlocker(
  workInProgress: Fiber,
  promise: Promise<mixed>,
): CapturedValue<Promise<mixed>> {
  return {
    $$typeof: REACT_CAPTURED_VALUE,
    value: promise,
    tag: BlockerType,
    source: workInProgress,
    boundary: null,
    stack: null,
  };
}

export function createTimeout(
  workInProgress: Fiber,
  ms: number,
): CapturedValue<number> {
  return {
    $$typeof: REACT_CAPTURED_VALUE,
    value: ms,
    tag: TimeoutType,
    source: workInProgress,
    boundary: null,
    stack: null,
  };
}

export function createCombinedCapturedValue(
  workInProgress: Fiber,
  values: Array<mixed>,
): CapturedValue<Array<mixed>> {
  return {
    $$typeof: REACT_CAPTURED_VALUE,
    value: values,
    tag: CombinedType,
    source: workInProgress,
    boundary: null,
    stack: null,
  };
}

export function logError(capturedValue: CapturedValue<mixed>): void {
  const capturedError = createCapturedError(capturedValue);
  try {
    logCapturedError(capturedError);
  } catch (e) {
    // Prevent cycle if logCapturedError() throws.
    // A cycle may still occur if logCapturedError renders a component that throws.
    const suppressLogging = e && e.suppressReactErrorLogging;
    if (!suppressLogging) {
      console.error(e);
    }
  }
}

// Create a CapturedError object from a CapturedValue before it is passed to
// the error logger.
// TODO: CapturedError is different from CapturedValue for legacy reasons, but I
// don't think it's exposed to anyone outside FB, so we can probably change it.
function createCapturedError(
  capturedValue: CapturedValue<mixed>,
): CapturedError {
  const source = capturedValue.source;
  const boundary = capturedValue.boundary;
  const stack = capturedValue.stack;

  const capturedError: CapturedError = {
    componentName: source !== null ? getComponentName(source) : null,
    error: capturedValue.value,
    errorBoundary: boundary,
    componentStack: stack !== null ? stack : '',
    errorBoundaryName: null,
    errorBoundaryFound: false,
    willRetry: false,
  };

  if (boundary !== null) {
    capturedError.errorBoundaryName = getComponentName(boundary);
    // TODO: These are always the same. Why is it needed?
    capturedError.errorBoundaryFound = capturedError.willRetry =
      boundary.tag === ClassComponent;
  } else {
    capturedError.errorBoundaryName = null;
    capturedError.errorBoundaryFound = capturedError.willRetry = false;
  }

  return capturedError;
}
