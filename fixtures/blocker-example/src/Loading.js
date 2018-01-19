import React, {AsyncBoundary} from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Debounce extends React.Component {
  static defaultProps = {
    ms: 0,
  };
  cache = null;
  pendingCache = null;
  currentValue = this.props.value;
  componentDidMount() {
    const value = this.props.value;
    this.currentValue = value;
    this.cache = new Set([value]);
    this.pendingCache = new Map();
  }
  componentDidUpdate() {
    const value = this.props.value;
    if (value !== this.currentValue) {
      this.cache = new Set([value]);
      this.pendingCache = new Map();
    }
    this.currentValue = value;
  }
  read(value) {
    const cache = this.cache;
    const pendingCache = this.pendingCache;
    if (cache === null) {
      return;
    }
    if (cache.has(value)) {
      return value;
    }
    if (pendingCache.has(value)) {
      const promise = pendingCache.get(value);
      throw promise;
    }
    const promise = delay(this.props.ms).then(() => {
      cache.add(value);
      pendingCache.delete(value);
    });
    pendingCache.set(value, promise);
    throw promise;
  }
  render() {
    if (this.props.ms > 0) {
      this.read(this.props.value);
    }
    return this.props.children(this.props.value);
  }
}

export default function Loading(props) {
  return (
    <AsyncBoundary>
      {isLoading => (
        <Debounce value={isLoading} ms={props.delay}>
          {props.children}
        </Debounce>
      )}
    </AsyncBoundary>
  );
}
