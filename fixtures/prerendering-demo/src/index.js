import './index.css';

const React = window.React;
const ReactDOM = window.ReactDOM;

const rootEl = document.getElementById('root');

const boxEl = document.createElement('div');
boxEl.className = 'spinner';
rootEl.appendChild(boxEl);
let start = performance.now();
function renderBox() {
  const elapsed = performance.now() - start;
  const rotation = elapsed / 3 % 360;
  const backgroundColor = boxEl.style.backgroundColor === 'red'
    ? 'blue'
    : 'red';
  boxEl.style.transform = `rotate(${rotation}deg)`;
  boxEl.style.backgroundColor = backgroundColor;
  requestAnimationFrame(renderBox);
}
requestAnimationFrame(renderBox);

class Root extends React.Component {
  state = {
    keyCounter: 0,
    timeToRenderStory: 600,
    timeToRenderComments: 300,
    async: false,
    prerender: false,
  };
  onRestart = () =>
    this.setState(state => ({keyCounter: state.keyCounter + 1}));
  onPrerenderChange = event => this.setState({prerender: event.target.checked});
  onAsyncChange = event => this.setState({async: event.target.checked});
  render() {
    return (
      <div>
        <button onClick={this.onRestart}>Restart</button>
        <label>
          Async
          <input
            type="checkbox"
            name="async"
            checked={this.state.async}
            onChange={this.onAsyncChange}
          />
        </label>
        <label>
          Coordinate commit phase
          <input
            type="checkbox"
            name="prerender"
            checked={this.state.prerender}
            onChange={this.onPrerenderChange}
          />
        </label>
        <Story
          key={
            this.state.keyCounter +
              this.state.async +
              this.state.prerender +
              this.state.timeToRenderStory +
              this.state.timeToRenderComments
          }
          async={this.state.async}
          prerender={this.state.prerender}
          timeToRenderStory={this.state.timeToRenderStory}
          timeToRenderComments={this.state.timeToRenderComments}
        />
      </div>
    );
  }
}

class Story extends React.Component {
  async componentDidMount() {
    const el = this.el;
    const CommentsContainer = this.props.async
      ? React.unstable_AsyncComponent
      : 'div';

    const comments = (
      <CommentsContainer>
        <Comments delay={this.props.timeToRenderComments} />
      </CommentsContainer>
    );

    if (!this.props.prerender) {
      await delay(this.props.timeToRenderStory);
      const container = renderStoryContent(el);
      const commentsRoot = ReactDOM.unstable_createRoot(container);
      commentsRoot.render(comments);
    } else {
      // setTimeout to move us into the next tick, so we get async priority
      await delay(0);
      let container;
      const commentsRoot = ReactDOM.unstable_createLazyRoot(() => container);
      const work = commentsRoot.prerender(comments);
      await work;
      await delay(this.props.timeToRenderStory);
      container = renderStoryContent(el);
      work.commit();
    }
  }
  render() {
    return <div ref={el => (this.el = el)} />;
  }
}

function renderStoryContent(el) {
  el.innerHTML = `
      <div>
        <div class="story">
          <p>This is a story, like you might see in Newsfeed. It's rendered
          separately from the comments — by XHP, another JavaScript framework,
          or maybe even another React renderer.</p>
          <p>Observe the flickering animation in the upper-right corner. It
          should look purple. When the main thread is blocked by synchronous
          work, it stops flickering and appears either red or blue.</p>
          </div>
        <div class="comments-container" />
      </div>
    `;
  return el.querySelector('.comments-container');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DELAY_CHUNK_MS = 10;

function DelayChunk() {
  const e = performance.now() + DELAY_CHUNK_MS;
  while (performance.now() < e) {
    // Artificially long execution time.
  }
  return null;
}

function Delay({ms}) {
  let chunks = [];
  for (let i = 0; ms > 0; i++, (ms -= DELAY_CHUNK_MS)) {
    chunks.push(<DelayChunk key={i} />);
  }
  return chunks;
}

class Comments extends React.unstable_AsyncComponent {
  render() {
    return (
      <div>
        <Delay ms={this.props.delay} />
        <ul className="comments">
          <li>
            These are some comments. The comments can't be inserted into the
            DOM until the story has rendered first.
          </li>
          <li>
            For demo purposes, let's pretend the comments are really expensive
            to render. (This is simulated by rendering bunch of
            dummy components.)
          </li>
          <li>
            In sync mode, the comments block the main thread and cause the
            UI to freeze momentarily.
          </li>
          <li>
            If we turn on async mode, the comments no longer block the main
            thread, but now there's a pause between when the story appears and
            when the comments appear. We want them to appear simultaneously.
          </li>
          <li>
            We can use the new top-level API tocontrol when the tree is
            committed into the DOM, so we can coordinate it with the non-React
            work and commit both trees at the same time.
          </li>
          <li>
            We can even start rendering before the DOM container is available.
          </li>
        </ul>
      </div>
    );
  }
}

const root = ReactDOM.unstable_createRoot(rootEl);
root.render(<Root />);
