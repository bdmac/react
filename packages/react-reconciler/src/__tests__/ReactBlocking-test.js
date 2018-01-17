let React;
let Fragment;
let ReactNoop;
let AsyncBoundary;

let cache;
let pendingCache;

describe('ReactBlocking', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactNoop = require('react-noop-renderer');
    AsyncBoundary = React.AsyncBoundary;

    cache = new Set();
    pendingCache = new Map();
  });

  // Throws the first time a string is requested. After the specified
  // duration, subsequent calls will return the text synchronously.
  function readText(text, ms = 0) {
    if (cache.has(text)) {
      return text;
    }
    if (pendingCache.has(text)) {
      throw pendingCache.get(text);
    }
    const promise = new Promise(resolve =>
      setTimeout(() => {
        cache.add(text);
        pendingCache.delete(text);
        resolve(text);
      }, ms),
    );
    pendingCache.set(text, promise);
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
          <span prop={readText('Hi', 100)} />
        </Bar>
      );
    }

    ReactNoop.render(<Foo />);
    // Stops rendering after Foo
    expect(ReactNoop.flush()).toEqual(['Foo']);
    expect(ReactNoop.getChildren()).toEqual([]);

    // Flush some of the time
    await flushPromises(50);
    // Still nothing...
    expect(ReactNoop.flush()).toEqual([]);
    expect(ReactNoop.getChildren()).toEqual([]);

    // Flush the promise completely
    await flushPromises();
    // Renders successfully
    expect(ReactNoop.flush()).toEqual(['Foo', 'Bar']);
    expect(ReactNoop.getChildren()).toEqual([span('Hi')]);
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
    expect(ReactNoop.flush()).toEqual(['A', 'B', 'C', 'D']);
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
    expect(ReactNoop.flush()).toEqual(['A', 'B', 'C', 'D']);
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
      // Renders the loading view
      'Loading...',
      // TODO: Track blocked levels so we don't retry this again.
      'Blocked! [Final result]',
    ]);
    expect(ReactNoop.getChildren()).toEqual([span('Loading...')]);

    // Unblock the rest.
    await flushPromises();

    // Now we can render the final result.
    expect(ReactNoop.flush()).toEqual(['Final result']);
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
      // Now the inner loading view should display, not the outer one.
      'Loading (inner)...',
      'Initial text',
      // TODO: Track blocked levels so we don't retry this again.
      'Blocked! [Final result]',
    ]);
    expect(ReactNoop.getChildren()).toEqual([
      div(span('Loading (inner)...'), span('Initial text')),
    ]);

    // Flush all the promises.
    await flushPromises();

    // Now the final result should display, with no loading state.
    expect(ReactNoop.flush()).toEqual(['Final result']);
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
    expect(ReactNoop.flush()).toEqual([
      'Blocked! [A]',
      'B',
      // TODO: Track blocked levels so we don't retry this again.
      'Blocked! [A]',
    ]);
    expect(ReactNoop.getChildren()).toEqual([]);

    await flushPromises();
    expect(ReactNoop.flush()).toEqual(['A', 'A', 'B']);
    expect(ReactNoop.getChildren()).toEqual([span('A'), span('B')]);
  });

  // TODO:
  //
  // Expiring a blocked tree
  // Blocking inside an offscreen tree
});
