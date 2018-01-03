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

import {ClassComponent} from 'shared/ReactTypeOfWork';
import getComponentName from 'shared/getComponentName';
import {getStackAddendumByWorkInProgressFiber} from 'shared/ReactFiberComponentTreeHook';

import {logCapturedError} from './ReactFiberErrorLogger';

const getPrototypeOf =
  Object.getPrototypeOf === 'function' ? Object.getPrototypeOf : null;
const objectToString = Object.prototype.toString;

export type CapturedValue<T> = {
  value: T,
  isError: boolean,
  source: Fiber | null,
  boundary: Fiber | null,
  stack: string | null,
};

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

export function pushFrame() {
  index += 1;
  capturedValueStack[index] = null;
}

function getCurrentFrame() {
  const currentFrame = capturedValueStack[index];
  invariant(
    currentFrame !== undefined,
    'Expected a current frame. This error is likely caused by a bug in ' +
      'React. Please file an issue.',
  );
  return currentFrame;
}

export function frameHasCapturedValues() {
  return getCurrentFrame() !== null;
}

export function addValueToFrame(capturedValue: CapturedValue<mixed>): void {
  const currentFrame = getCurrentFrame();
  if (currentFrame === null) {
    capturedValueStack[index] = [capturedValue];
  } else {
    currentFrame.push(capturedValue);
  }
}

export function captureValuesOnFrame(): Array<CapturedValue<mixed>> | null {
  const values = getCurrentFrame();
  capturedValueStack[index] = null;
  return values;
}

export function setValuesOnFrame(values: Array<CapturedValue<mixed>>) {
  capturedValueStack[index] = values;
}

export function popFrameAndBubbleValues() {
  const currentFrame = getCurrentFrame();
  index -= 1;
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
  }
}

// Call this immediately after the value is thrown.
export function createCapturedValue<T>(
  value: T,
  source: Fiber | null,
): CapturedValue<T> {
  const valueIsError = isError(value);
  return {
    value,
    isError: valueIsError,
    source,
    boundary: null,
    // Don't compute the stack unless this is an error.
    stack:
      source !== null && valueIsError
        ? getStackAddendumByWorkInProgressFiber(source)
        : null,
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

function isError(value: mixed): boolean {
  if (value instanceof Error) {
    return true;
  }

  // instanceof fails across realms. Check the prototype chain.
  if (getPrototypeOf !== null) {
    let proto = getPrototypeOf(value);
    while (proto !== null) {
      if (objectToString.call(proto) === '[object Error]') {
        return true;
      }
      proto = getPrototypeOf(value);
    }
    return false;
  }

  // If getPrototypeOf is not available, fall back to duck typing.
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.stack === 'string' &&
    typeof value.message === 'string'
  );
}
