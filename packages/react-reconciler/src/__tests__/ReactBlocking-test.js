import {flushPendingWork} from '../ReactFiberPendingWork';

let React;
let Fragment;
let ReactNoop;
let AsyncBoundary;

let textCache;
let pendingTextCache;

describe('ReactBlocking', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactNoop = require('react-noop-renderer');
    AsyncBoundary = React.AsyncBoundary;

    textCache = new Set();
    pendingTextCache = new Map();
  });

  // Throws the first time a string is requested. After the specified
  // duration, subsequent calls will return the text synchronously.
  function readText(text, ms = 0) {
    if (textCache.has(text)) {
      return text;
    }
    if (pendingTextCache.has(text)) {
      throw pendingTextCache.get(text);
    }
    const promise = new Promise(resolve =>
      setTimeout(() => {
        ReactNoop.yield(`Promise resolved [${text}]`);
        textCache.add(text);
        pendingTextCache.delete(text);
        resolve(text);
      }, ms),
    );
    pendingTextCache.set(text, promise);
    throw promise;
  }

  function flushPromises(ms) {
    // Note: This advances Jest's virtual time but not React's. Use
    // ReactNoop.expire for that.
    if (ms === undefined) {
      jest.runAllTimers();
    } else {
      jest.advanceTimersByTime(ms);
    }
    // Wait until the end of the current tick
    return new Promise(resolve => {
      setImmediate(resolve);
    });
  }

  function div(...children) {
    children = children.map(c => (typeof c === 'string' ? {text: c} : c));
    return {type: 'div', children, prop: undefined};
  }

  function span(prop) {
    return {type: 'span', children: [], prop};
  }

  function Text(props) {
    ReactNoop.yield(props.text);
    return <span prop={props.text} />;
  }

  function AsyncText(props) {
    const text = props.text;
    try {
      readText(text, props.ms);
    } catch (promise) {
      ReactNoop.yield(`Blocked! [${text}]`);
      throw promise;
    }
    ReactNoop.yield(text);
    return <span prop={text} />;
  }

  it('blocks rendering and continues later', async () => {
    function Bar(props) {
      ReactNoop.yield('Bar');
      return props.children;
    }

    function Foo() {
      ReactNoop.yield('Foo');
      return (
        <Bar>
          <AsyncText text="A" ms={100} />
          <Text text="B" />
        </Bar>
      );
    }

    ReactNoop.render(<Foo />);
    expect(ReactNoop.flush()).toEqual([
      'Foo',
      'Bar',
      // A blocks
      'Blocked! [A]',
      // But we keep rendering the siblings
      'B',
    ]);
    expect(ReactNoop.getChildren()).toEqual([]);

    // Flush some of the time
    await flushPromises(50);
    // Still nothing...
    expect(ReactNoop.flush()).toEqual([]);
    expect(ReactNoop.getChildren()).toEqual([]);

    // Flush the promise completely
    await flushPromises();
    // Renders successfully
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [A]',
      'Foo',
      'Bar',
      'A',
      'B',
    ]);
    expect(ReactNoop.getChildren()).toEqual([span('A'), span('B')]);
  });

  it('continues rendering siblings after a block', async () => {
    ReactNoop.render(
      <Fragment>
        <Text text="A" />
        <AsyncText text="B" />
        <Text text="C" />
        <Text text="D" />
      </Fragment>,
    );
    // B blocks. Continue rendering the remaining siblings.
    expect(ReactNoop.flush()).toEqual(['A', 'Blocked! [B]', 'C', 'D']);
    // Did not commit yet.
    expect(ReactNoop.getChildren()).toEqual([]);

    // Wait for data to resolve
    await flushPromises();
    // Renders successfully
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [B]',
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      span('A'),
      span('B'),
      span('C'),
      span('D'),
    ]);
  });

  it('can render an alternate view at a higher priority', async () => {
    function App(props) {
      return (
        <AsyncBoundary>
          {isLoading => (
            <Fragment>
              {isLoading ? <Text text="Loading..." /> : null}
              <Text text="A" />
              <Text text="B" />
              <Text text="C" />
              {props.step >= 1 ? <AsyncText text="D" /> : null}
            </Fragment>
          )}
        </AsyncBoundary>
      );
    }

    ReactNoop.render(<App step={0} />);
    expect(ReactNoop.flush()).toEqual(['A', 'B', 'C']);
    expect(ReactNoop.getChildren()).toEqual([span('A'), span('B'), span('C')]);

    ReactNoop.render(<App step={1} />);
    expect(ReactNoop.flush()).toEqual([
      'A',
      'B',
      'C',
      // D blocks, which triggers the loading state.
      'Blocked! [D]',
      'Loading...',
      'A',
      'B',
      'C',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      span('Loading...'),
      span('A'),
      span('B'),
      span('C'),
    ]);

    // Wait for data to resolve
    await flushPromises();
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [D]',
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      span('A'),
      span('B'),
      span('C'),
      span('D'),
    ]);
  });

  it('can block inside a boundary', async () => {
    function App(props) {
      return (
        <AsyncBoundary defaultState={false} updateOnBlock={() => true}>
          {isLoading => {
            if (isLoading) {
              return <AsyncText text="Loading..." ms={50} />;
            }
            return props.step > 0 ? (
              <AsyncText text="Final result" ms={100} />
            ) : (
              <Text text="Initial text" />
            );
          }}
        </AsyncBoundary>
      );
    }

    // Initial mount
    ReactNoop.render(<App step={0} />);
    expect(ReactNoop.flush()).toEqual(['Initial text']);
    expect(ReactNoop.getChildren()).toEqual([span('Initial text')]);

    ReactNoop.render(<App step={1} />);
    expect(ReactNoop.flush()).toEqual([
      'Blocked! [Final result]',
      'Blocked! [Loading...]',
    ]);
    expect(ReactNoop.getChildren()).toEqual([span('Initial text')]);

    // Unblock the "Loading..." view
    await flushPromises(50);

    expect(ReactNoop.flush()).toEqual([
      // Renders the loading view,
      'Promise resolved [Loading...]',
      'Loading...',
    ]);
    expect(ReactNoop.getChildren()).toEqual([span('Loading...')]);

    // Unblock the rest.
    await flushPromises();

    // Now we can render the final result.
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [Final result]',
      'Final result',
    ]);
    expect(ReactNoop.getChildren()).toEqual([span('Final result')]);
  });

  it('can block, unblock, then block again in a later update, with correct bubbling', async () => {
    function App(props) {
      return (
        <AsyncBoundary>
          {isLoading => (
            <Fragment>
              {isLoading ? <Text text="Loading..." /> : null}
              <AsyncText text={props.text} />
            </Fragment>
          )}
        </AsyncBoundary>
      );
    }

    ReactNoop.render(<App text="Initial text" />);
    ReactNoop.flush();
    await flushPromises();
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([span('Initial text')]);

    ReactNoop.render(<App text="Update" />);
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([
      span('Loading...'),
      span('Initial text'),
    ]);
    await flushPromises();
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([span('Update')]);

    ReactNoop.render(<App text="Another update" />);
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([
      span('Loading...'),
      span('Update'),
    ]);
    await flushPromises();
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([span('Another update')]);
  });

  it('bubbles to next boundary if it blocks', async () => {
    function App(props) {
      return (
        <AsyncBoundary>
          {isLoadingOuter => (
            <Fragment>
              {isLoadingOuter ? <Text text="Loading (outer)..." /> : null}
              <AsyncBoundary>
                {isLoadingInner => (
                  <div>
                    {isLoadingInner ? (
                      <AsyncText text="Loading (inner)..." ms={100} />
                    ) : null}
                    {props.step > 0 ? (
                      <AsyncText text="Final result" ms={200} />
                    ) : (
                      <Text text="Initial text" />
                    )}
                  </div>
                )}
              </AsyncBoundary>
            </Fragment>
          )}
        </AsyncBoundary>
      );
    }

    ReactNoop.render(<App step={0} />);
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([div(span('Initial text'))]);

    // Update to display "Final result"
    ReactNoop.render(<App step={1} />);
    expect(ReactNoop.flush()).toEqual([
      // "Final result" blocks.
      'Blocked! [Final result]',
      // The inner boundary renders a loading view. The loading view also blocks.
      'Blocked! [Loading (inner)...]',
      // (Continues rendering siblings even though something blocked)
      'Initial text',
      // Bubble up and retry at the next boundary. This time it's successful.
      'Loading (outer)...',
      'Initial text',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      span('Loading (outer)...'),
      div(span('Initial text')),
    ]);

    // Unblock the inner boundary.
    await flushPromises(100);
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [Loading (inner)...]',
      // Now the inner loading view should display, not the outer one.
      'Loading (inner)...',
      'Initial text',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      div(span('Loading (inner)...'), span('Initial text')),
    ]);

    // Flush all the promises.
    await flushPromises();

    // Now the final result should display, with no loading state.
    expect(ReactNoop.flush()).toEqual([
      'Promise resolved [Final result]',
      'Final result',
    ]);
    expect(ReactNoop.getChildren()).toEqual([div(span('Final result'))]);
  });

  it('can unblock with a lower priority update', () => {
    function App(props) {
      return (
        <AsyncBoundary>
          {isLoading => (
            <Fragment>
              {isLoading ? <Text text="Loading..." /> : null}
              {props.showContent ? (
                <AsyncText text="Content" />
              ) : (
                <Text text="(empty)" />
              )}
            </Fragment>
          )}
        </AsyncBoundary>
      );
    }

    // Mount the initial view
    ReactNoop.render(<App showContent={false} />);
    expect(ReactNoop.flush()).toEqual(['(empty)']);
    expect(ReactNoop.getChildren()).toEqual([span('(empty)')]);

    // Toggle to show the content, which is async
    ReactNoop.render(<App showContent={true} />);
    expect(ReactNoop.flush()).toEqual([
      // The content blocks because it's async
      'Blocked! [Content]',
      // Show the loading view
      'Loading...',
      '(empty)',
    ]);
  });

  it('can update at a higher priority while in a blocked state', async () => {
    function App(props) {
      return (
        <Fragment>
          <Text text={props.highPri} />
          <AsyncText text={props.lowPri} />
        </Fragment>
      );
    }

    // Initial mount
    ReactNoop.render(<App highPri="A" lowPri="1" />);
    ReactNoop.flush();
    await flushPromises();
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([span('A'), span('1')]);

    // Update the low-pri text
    ReactNoop.render(<App highPri="A" lowPri="2" />);
    expect(ReactNoop.flush()).toEqual([
      'A',
      // Blocks
      'Blocked! [2]',
    ]);

    // While we're still waiting for the low-pri update to complete, update the
    // high-pri text at high priority.
    ReactNoop.flushSync(() => {
      ReactNoop.render(<App highPri="B" lowPri="1" />);
    });
    expect(ReactNoop.flush()).toEqual(['B', '1']);
    expect(ReactNoop.getChildren()).toEqual([span('B'), span('1')]);

    // Unblock the low-pri text and finish
    await flushPromises();
    expect(ReactNoop.flush()).toEqual(['Promise resolved [2]']);
    expect(ReactNoop.getChildren()).toEqual([span('B'), span('1')]);
  });

  it('keeps working on lower priority work after being unblocked', async () => {
    function App(props) {
      return (
        <Fragment>
          <AsyncText text="A" />
          {props.showB && <Text text="B" />}
        </Fragment>
      );
    }

    ReactNoop.render(<App showB={false} />);
    expect(ReactNoop.flush()).toEqual(['Blocked! [A]']);
    expect(ReactNoop.getChildren()).toEqual([]);

    // Advance React's virtual time by enough to fall into a new async bucket.
    ReactNoop.expire(1200);
    ReactNoop.render(<App showB={true} />);
    expect(ReactNoop.flush()).toEqual(['Blocked! [A]', 'B']);
    expect(ReactNoop.getChildren()).toEqual([]);

    await flushPromises();
    expect(ReactNoop.flush()).toEqual(['Promise resolved [A]', 'A', 'B']);
    expect(ReactNoop.getChildren()).toEqual([span('A'), span('B')]);
  });

  it('coalesces all async updates when in a blocked state', async () => {
    ReactNoop.render(<AsyncText text="A" />);
    ReactNoop.flush();
    await flushPromises();
    ReactNoop.flush();
    expect(ReactNoop.getChildren()).toEqual([span('A')]);

    ReactNoop.render(<AsyncText text="B" ms={50} />);
    expect(ReactNoop.flush()).toEqual(['Blocked! [B]']);
    expect(ReactNoop.getChildren()).toEqual([span('A')]);

    // Advance React's virtual time so that C falls into a new expiration bucket
    ReactNoop.expire(1000);
    ReactNoop.render(<AsyncText text="C" ms={100} />);
    expect(ReactNoop.flush()).toEqual([
      // Tries C first, since it has a later expiration time
      'Blocked! [C]',
      // Does not retry B, because its promise has not resolved yet.
    ]);

    expect(ReactNoop.getChildren()).toEqual([span('A')]);

    // Unblock B
    await flushPromises(90);
    // Even though B's promise resolved, the view is still blocked because it
    // coalesced with C.
    expect(ReactNoop.flush()).toEqual(['Promise resolved [B]']);
    expect(ReactNoop.getChildren()).toEqual([span('A')]);

    // Unblock C
    await flushPromises(50);
    expect(ReactNoop.flush()).toEqual(['Promise resolved [C]', 'C']);
    expect(ReactNoop.getChildren()).toEqual([span('C')]);
  });

  describe('a loading view', () => {
    React = require('react');

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    class LoadingImpl extends React.Component {
      static defaultProps = {
        delay: 0,
      };
      cache = null;
      pendingCache = null;
      currentIsLoading = this.props.isLoading;
      componentDidMount() {
        this.currentIsLoading = this.props.isLoading;
        this.cache = new Set([this.props.isLoading]);
        this.pendingCache = new Map();
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
        if (cache === null) {
          return;
        }
        if (cache.has(isLoading)) {
          return isLoading;
        }
        if (pendingCache.has(isLoading)) {
          const promise = pendingCache.get(isLoading);
          ReactNoop.yield('Blocked! [Loading view delay]');
          throw promise;
        }
        const promise = delay(this.props.delay).then(() => {
          cache.add(isLoading);
          pendingCache.delete(isLoading);
        });
        pendingCache.set(isLoading, promise);
        ReactNoop.yield('Blocked! [Loading view delay]');
        throw promise;
      }
      render() {
        if (this.props.delay > 0) {
          this.read(this.props.isLoading);
        }
        return this.props.children(this.props.isLoading);
      }
    }

    function Loading(props) {
      return (
        <AsyncBoundary>
          {isLoading => <LoadingImpl isLoading={isLoading} {...props} />}
        </AsyncBoundary>
      );
    }

    it('delays before switching on or off', async () => {
      function App(props) {
        return (
          <Loading delay={90}>
            {isLoading => (
              <Fragment>
                {isLoading && <Text text="Loading..." />}
                <AsyncText text={props.text} ms={props.delay} />
              </Fragment>
            )}
          </Loading>
        );
      }

      // Initial mount
      ReactNoop.render(<App text="A" delay={100} />);
      expect(ReactNoop.flush()).toEqual(['Blocked! [A]']);
      await flushPromises();
      expect(ReactNoop.flush()).toEqual(['Promise resolved [A]', 'A']);
      expect(ReactNoop.getChildren()).toEqual([span('A')]);

      // Update
      ReactNoop.render(<App text="B" delay={100} />);
      expect(ReactNoop.flush()).toEqual([
        // The child is blocked, so we bubble up to the loading view
        'Blocked! [B]',
        // The loading view also blocks, until some time has passed
        'Blocked! [Loading view delay]',
      ]);
      expect(ReactNoop.getChildren()).toEqual([span('A')]);

      // After a delay, the loading view is unblocked
      await flushPromises(90);
      expect(ReactNoop.flush()).toEqual(['Loading...', 'A']);
      // Show the loading view
      expect(ReactNoop.getChildren()).toEqual([span('Loading...'), span('A')]);

      // After bit more time, the original update is unblocked.
      await flushPromises(20);
      // The loading view blocks again, for a delay
      expect(ReactNoop.flush()).toEqual([
        'Promise resolved [B]',
        'Blocked! [Loading view delay]',
      ]);
      // Keep showing the loading view.
      expect(ReactNoop.getChildren()).toEqual([span('Loading...'), span('A')]);

      // After another delay, the loading view is unblocked.
      await flushPromises(90);
      expect(ReactNoop.flush()).toEqual(['B']);
      // Show the final view.
      expect(ReactNoop.getChildren()).toEqual([span('B')]);
    });

    it('skips loading state entirely if original blocked update resolves first', async () => {
      function App(props) {
        return (
          <Loading delay={100}>
            {isLoading => (
              <Fragment>
                <Text text="Initial text" />
                {props.show && <AsyncText text="More" ms={50} />}
              </Fragment>
            )}
          </Loading>
        );
      }

      ReactNoop.render(<App show={false} />);
      expect(ReactNoop.flush()).toEqual(['Initial text']);
      expect(ReactNoop.getChildren()).toEqual([span('Initial text')]);

      ReactNoop.render(<App show={true} />);
      expect(ReactNoop.flush()).toEqual([
        'Initial text',
        'Blocked! [More]',
        'Blocked! [Loading view delay]',
      ]);
      expect(ReactNoop.getChildren()).toEqual([span('Initial text')]);

      // Flush both promises. Because the final view is now unblocked, we should
      // skip showing the spinner entirely.
      await flushPromises();
      expect(ReactNoop.flush()).toEqual([
        'Promise resolved [More]',
        'Initial text',
        'More',
      ]);
      expect(ReactNoop.getChildren()).toEqual([
        span('Initial text'),
        span('More'),
      ]);
    });
  });

  // TODO:
  //
  // Expiring a blocked tree
  // Blocking inside an offscreen tree
});
