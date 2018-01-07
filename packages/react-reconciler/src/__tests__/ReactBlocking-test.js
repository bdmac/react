let React;
let Fragment;
let ReactNoop;

let cache;
let pendingCache;

describe('ReactBlocking', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactNoop = require('react-noop-renderer');

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
      throw cache.get(text);
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
    return new Promise(resolve => setImmediate(resolve));
  }

  function span(prop) {
    return {type: 'span', children: [], prop};
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
    function Normal(props) {
      ReactNoop.yield(props.text);
      return <span prop={props.text} />;
    }

    function Async(props) {
      const text = readText(props.text);
      ReactNoop.yield(text);
      return <span prop={text} />;
    }

    ReactNoop.render(
      <Fragment>
        <Normal text="A" />
        <Async text="B" />
        <Normal text="C" />
        <Normal text="D" />
      </Fragment>,
    );
    // B blocks. Continue rendering the remaining siblings.
    expect(ReactNoop.flush()).toEqual(['A', 'C', 'D']);
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
});
