import React, {AsyncBoundary} from 'react';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class LoadingImpl extends React.Component {
  static defaultProps = {
    delay: 0,
  };
  cache = new Set([true, false]);
  pendingCache = new Map();
  currentIsLoading = this.props.isLoading;
  componentDidMount() {
    this.currentIsLoading = this.props.isLoading;
  }
  componentDidUpdate() {
    const isLoading = this.props.isLoading;
    if (isLoading !== this.currentIsLoading) {
      this.cache = new Set([isLoading]);
      this.pendingCache = new Map();
    }
    this.currentIsLoading = isLoading;
  }
  read(isLoading) {
    const cache = this.cache;
    const pendingCache = this.pendingCache;
    if (cache.has(isLoading)) {
      return isLoading;
    }
    if (pendingCache.has(isLoading)) {
      const promise = pendingCache.get(isLoading);
      throw promise;
    }
    const promise = delay(this.props.delay)
      .then(() => cache.add(isLoading))
      .finally(() => pendingCache.delete(isLoading));
    pendingCache.set(isLoading, promise);
    throw promise;
  }
  render() {
    if (this.props.delay > 0) {
      this.read(this.props.isLoading);
    }
    return this.props.children(this.props.isLoading);
  }
}

export default function Loading(props) {
  return (
    <AsyncBoundary>
      {isLoading => <LoadingImpl isLoading={isLoading} {...props} />}
    </AsyncBoundary>
  );
}
