/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

const {Writable} = require('stream');
const {JSDOM} = require('jsdom');

let React;
let ReactFeatureFlags;
let Fragment;
let ReactDOMServerSuspense;
let SimpleCacheProvider;
let cache;
let TextResource;
let ops;

let virtualTime;
let unmockedNow = Date.now;

describe('ReactSuspenseServerRenderer', () => {
  beforeEach(() => {
    jest.resetModules();
    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableSuspense = true;
    React = require('react');
    Fragment = React.Fragment;
    ReactDOMServerSuspense = require('react-dom/server.suspense');
    SimpleCacheProvider = require('simple-cache-provider');
    // For extra isolation between what would be two bundles on npm
    jest.resetModuleRegistry();

    ops = [];
    cache = SimpleCacheProvider.createCache();
    TextResource = SimpleCacheProvider.createResource(([text, ms = 0]) => {
      return new Promise(resolve =>
        setTimeout(() => {
          ops.push(`Promise resolved [${text}]`);
          resolve(text);
        }, ms),
      );
    }, ([text, ms]) => text);

    virtualTime = 0;
    Date.now = () => virtualTime;

    // Make this a bit longer than React's timeout, which is 5 seconds
    jest.setTimeout(6000);
  });

  afterEach(() => {
    Date.now = unmockedNow;
  });

  function advanceTimers(ms) {
    // Note: This advances Jest's virtual time but not React's. Use
    // ReactNoop.expire for that.
    if (typeof ms !== 'number') {
      throw new Error('Must specify ms');
    }
    virtualTime += ms;
    jest.advanceTimersByTime(ms);
    // Wait until the end of the current tick
    return new Promise(resolve => {
      setImmediate(resolve);
    });
  }

  function AsyncText(props) {
    const text = props.text;
    try {
      TextResource.read(cache, [props.text, props.ms]);
      ops.push(props.text);
      return props.text;
    } catch (promise) {
      ops.push(`Suspend! [${text}]`);
      throw promise;
    }
  }

  function Placeholder(props) {
    return (
      <React.Timeout ms={props.timeout}>
        {didExpire => (didExpire ? props.placeholder : props.children)}
      </React.Timeout>
    );
  }

  class DrainWritable extends Writable {
    constructor(options) {
      super(options);
      this.buffer = null;
    }

    _write(chunk, encoding, cb) {
      if (this.buffer === null) {
        this.buffer = chunk;
      } else {
        this.buffer += chunk;
      }
      cb();
    }
  }

  function evaluateHTML(html) {
    const documentHTML = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    </head>
    <body>
    <div id="__test-root">${html}</div>
    </body>
    </html>
    `;
    const dom = new JSDOM(documentHTML, {runScripts: 'dangerously'});
    const container = dom.window.document.getElementById('__test-root');
    if (container === null) {
      throw new Error('No container found.');
    }
    return container;
  }

  function sanitizeRendererHTML(html) {
    // Strip out comments
    return html.replace(/<!--(.*?)-->/g, '');
  }

  function render(children) {
    const writable = new DrainWritable();
    ReactDOMServerSuspense.renderToNodeStream(children).pipe(writable);
    let didFinish = false;
    let result = null;
    const finalOutput = new Promise(resolve => {
      writable.on('finish', () => {
        const finalHTML = writable.buffer;
        const container = evaluateHTML(finalHTML);
        didFinish = true;
        result = sanitizeRendererHTML(container.innerHTML);
        resolve(result);
      });
    });
    return {
      then(resolve) {
        return resolve(finalOutput);
      },
      snapshot() {
        if (didFinish) {
          return result;
        }

        const partialHTML = writable.buffer;
        if (partialHTML === null) {
          return null;
        }
        // Add a closing div tag as to match the opening tag that hasn't
        // closed yet
        const container = evaluateHTML(partialHTML + '</div>');
        // Delete the "stage" element. Typically this is done when the document
        // is closed.
        const stage = container.querySelector('#_ssr_stage');
        stage.parentNode.removeChild(stage);
        return sanitizeRendererHTML(container.innerHTML);
      },
    };
  }

  it('renders a host component', async () => {
    const stream = render(<div className="greeting">Hi</div>);
    const result = await stream;
    expect(result).toEqual('<div class="greeting">Hi</div>');
  });

  it('renders multiple children', async () => {
    const stream = render(
      <div className="greeting">
        Hi, <span>Andrew</span>
      </div>,
    );
    const result = await stream;
    expect(result).toEqual(
      '<div class="greeting">Hi, <span>Andrew</span></div>',
    );
  });

  it('renders a fragment', async () => {
    const stream = render(
      <div className="greeting">
        <React.Fragment>
          Hi, <span>Andrew</span>
        </React.Fragment>
      </div>,
    );
    const result = await stream;
    expect(result).toEqual(
      '<div class="greeting">Hi, <span>Andrew</span></div>',
    );
  });

  it('renders a functional component', async () => {
    function Greeting(props) {
      return <div className="greeting">Hi, {props.name}</div>;
    }
    const stream = render(<Greeting name="Andrew" />);
    const result = await stream;
    expect(result).toEqual('<div class="greeting">Hi, Andrew</div>');
  });

  it('renders a class component', async () => {
    class Greeting extends React.Component {
      state = {name: this.props.initialName};
      render() {
        return <div className="greeting">Hi, {this.state.name}</div>;
      }
    }
    const stream = render(<Greeting initialName="Andrew" />);
    const result = await stream;
    expect(result).toEqual('<div class="greeting">Hi, Andrew</div>');
  });

  it('supports Timeout', async () => {
    const stream = render(
      <Placeholder timeout={1000} placeholder="Loading...">
        <AsyncText text="Result" ms={2000} />
      </Placeholder>,
    );
    await advanceTimers(1000);
    expect(stream.snapshot()).toEqual('Loading...');
    await advanceTimers(1000);
    const result = await stream;
    expect(result).toEqual('Result');
  });

  it('supports nested Timeouts', async () => {
    const stream = render(
      <Fragment>
        A
        <Placeholder timeout={1000} placeholder="Loading...">
          <AsyncText text="B" ms={2000} />
          <Placeholder timeout={3000} placeholder="Loading...">
            <AsyncText text="C" ms={4000} />
          </Placeholder>
        </Placeholder>
      </Fragment>,
    );
    await advanceTimers(1000);
    expect(stream.snapshot()).toEqual('ALoading...');
    await advanceTimers(1000);
    expect(stream.snapshot()).toEqual('ABLoading...');
    await advanceTimers(2000);
    const result = await stream;
    expect(result).toEqual('ABC');
  });

  it('multiple components can suspend', async () => {
    const stream = render(
      <Placeholder placeholder="Loading outer...">
        <AsyncText text="A" ms={1000} />
        <AsyncText text="B" ms={500} />
      </Placeholder>,
    );
    await advanceTimers(1000);
    const result = await stream;
    expect(result).toEqual('AB');
  });

  it('siblings can suspend, timeout, and recover separately', async () => {
    const stream = render(
      <Fragment>
        <Placeholder timeout={0} placeholder="Loading...">
          <Placeholder placeholder="Loading A...">
            <AsyncText text="A" ms={1000} />
          </Placeholder>
          <Placeholder placeholder="Loading B...">
            <AsyncText text="B" ms={2000} />
          </Placeholder>
        </Placeholder>
      </Fragment>,
    );
    await advanceTimers(0);
    expect(stream.snapshot()).toEqual('Loading A...Loading B...');
    await advanceTimers(1000);
    expect(stream.snapshot()).toEqual('ALoading B...');
    await advanceTimers(1000);
    const result = await stream;
    expect(result).toEqual('AB');
  });
});
