/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';

import {ClassComponent} from 'shared/ReactTypeOfWork';
import getComponentName from 'shared/getComponentName';
import {getStackAddendumByWorkInProgressFiber} from 'shared/ReactFiberComponentTreeHook';

import {logCapturedError} from './ReactFiberErrorLogger';

const getPrototypeOf =
  Object.getPrototypeOf === 'function' ? Object.getPrototypeOf : null;
const objectToString = Object.prototype.toString;

export type TypeOfCapturedValue = 0 | 1 | 2;

export const UnknownType = 0;
export const PromiseType = 1;
export const ErrorType = 2;

export type CapturedValue<T> = {
  value: T,
  tag: TypeOfCapturedValue,
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

// Call this immediately after the value is thrown.
export function createCapturedValue<T>(
  value: T,
  source: Fiber | null,
): CapturedValue<T> {
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
