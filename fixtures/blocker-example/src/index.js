import React from 'react';
import ReactDOM from 'react-dom';
import _ from 'lodash';
import {
  VictoryChart,
  VictoryAxis,
  VictoryArea,
  VictoryLine,
  Area
} from 'victory';
import './index.css';

// This custom component is supplied in place of Path
class GradientPath extends React.Component {
  toGrayscale(color) {
    const integerColor = parseInt(color.replace("#", ""), 16);
    const r = (integerColor >> 16) & 255;
    const g = (integerColor >> 8) & 255;
    const b = integerColor & 255;
    const gray = parseInt(0.299 * r + 0.587 * g + 0.114 * b, 10);
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  render() {
    const { style, d, events } = this.props;
    const gradientId = `gradient-${Math.random()}`;
    const areaStyle = Object.assign(
      {}, style, { fill: `url(${window.location.href}#${gradientId})` }
    );
    const percent = `${this.props.percent}%`;
    const gray = this.toGrayscale(style.fill);
    return (
      <g key="area">
        <defs>
          <linearGradient id={gradientId}>
              <stop offset="0%" stopColor={style.fill}/>
              <stop offset={percent} stopColor={style.fill}/>
              <stop offset={percent} stopColor={gray}/>
              <stop offset="100%" stopColor={gray}/>
          </linearGradient>
        </defs>
        <path key="area" style={areaStyle} d={d} {...events}/>
      </g>
    );
  }
}

class VictoryExample extends React.PureComponent {
  static defaultProps = {
    percent: 100
  };

  // componentDidUpdate(prevProps) {
  //   if (prevProps.streamData !== this.props.streamData) {
  //     console.log('flush');
  //   }
  // }

  render() {
    // console.log('render');
    const streamData = this.props.streamData;
    const colors = [
      "#006064", "#00796B", "#8BC34A", "#DCE775",
      "#FFF59D", "#F4511E", "#c33409"
    ];

    return (
      <VictoryChart
        width={400} height={400}
        domain={{ x: [0, 25], y: [-250, 250] }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: "none" },
            ticks: { stroke: "none" },
            tickLabels: { fill: "none" },
            grid: { stroke: "lightGray" }
          }}
          tickCount={20}
        />
        <VictoryAxis dependentAxis
          style={{
            ticks: { stroke: "gray" },
            tickLabels: { fill: "gray", fontSize: 12 }
          }}
          crossAxis={false}
        />

        {
          streamData.map((d, i) => {
            return (
              <VictoryArea key={i}
                interpolation="monotoneX"
                data={d}
                style={{ data: { fill: colors[i], stroke: "none" } }}
                dataComponent={
                  <Area
                    pathComponent={<GradientPath percent={this.props.percent}/>}
                  />
                }
              />
            );
          })
        }
        <VictoryLine
          style={{
            data: { stroke: "#c33409", strokeWidth: 3 }
          }}
          data={[
            { x: 25 * this.props.percent / 100, y: -300 },
            { x: 25 * this.props.percent / 100, y: 300 }
          ]}
        />
      </VictoryChart>
    );
  }
}

let cachedData = new Map();

class App extends React.PureComponent {
  constructor() {
    super();
    this.state = {
      input: '',
    };
  }

  // This data is manipulated to approximate a stream.
  getStreamData(input) {
    if (cachedData.has(input)) {
      return cachedData.get(input);
    }
    const data = _.range(7).map((i) => {
      return _.range(this.props.complexity).map((j) => {
        return {
          x: j,
          y: (10 - i) * _.random(10 - i, 20 - 2 * i),
          _y0: -1 * (10 - i) * _.random(10 - i, 20 - 2 * i)
        };
      });
    });
    cachedData.set(input, data);
    return data;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.complexity !== this.props.complexity) {
      cachedData.clear();
    }
  }

  debouncedHandleChange = _.debounce((value) => {
    if (this.props.strategy === 'syncDebounced') {
      ReactDOM.flushSync(() => {
        this.setState({ input: value });
      });
    }
  }, 1000);

  throttledHandleChange = _.throttle((value) => {
    if (this.props.strategy === 'syncThrottled') {
      ReactDOM.flushSync(() => {
        this.setState({ input: value });
      });
    }
  }, 1000);

  requestFrame(value) {
    this._frameValue = value;
    if (this._frame) {
      return;
    }
    this._frame = requestAnimationFrame(this.handleFrame);
  }

  handleFrame = () => {
    const value = this._frameValue;
    if (this.props.strategy === 'syncRAF') {
      ReactDOM.flushSync(() => {
        this.setState({ input: value });
      });
    }
    this._frameValue = null;
    this._frame = null;
  };

  handleChange = (e) => {
    const value = e.target.value;
    switch (this.props.strategy) {
      case 'sync':
        this.setState({ input: value });
        break;
      case 'syncDebounced':
        this.debouncedHandleChange(e.target.value);
        break;
      case 'syncThrottled':
        this.throttledHandleChange(e.target.value);
        break;
      case 'syncRAF':
        this.requestFrame(e.target.value);
        break;
      case 'async':
        magically(() => {          
          this.setState({
            input: value
          });
        });
        break;
    }
  }
  render() {
    return (
      <div style={{ width: '100vw', float: 'left' }}>
        <div style={{ width: '40vw', float: 'left' }}>
          <input
            style={{ fontSize: '30px', width: '90vw' }}
            placeholder='input value'
            defaultValue={this.state.input}
            onChange={this.handleChange}
          />
          <br />
          <br />
          <img src={require("./giphy.gif")} />
        </div>
        <div style={{ width: '40vw', float: 'left' }}>
          <br />
          <VictoryExample
            streamData={this.getStreamData(this.state.input)}
          />
          <br />
          <h6 style={{ opacity: 0.2 }}>
            {this.state.input}
          </h6>
        </div>
      </div>
    );
  }
}

class Demo extends React.Component {
  state = {
    strategy: 'sync',
    complexity: 30,
  };
  render() {
    const Wrapper = this.state.strategy === 'async' ? React.unstable_AsyncMode : 'div';
    return (
      <div>
        <select value={this.state.strategy} onChange={e => this.setState({ strategy: e.target.value })}>
          <option value="sync">Sync</option>
          <option value="syncDebounced">Sync (debounced)</option>
          <option value="syncThrottled">Sync (throttled)</option>
          <option value="syncRAF">Sync (in a rAF)</option>
          <option value="async">Async</option>
        </select>
        &nbsp;&nbsp;&nbsp;
        <label>
          Chart complexity: <input type="range" min="30" max="4000" value={this.state.complexity} onChange={e => this.setState({ complexity: e.target.value })} />
        </label>
        <hr />
        <Wrapper>
          <App {...this.state} />
        </Wrapper>
      </div>
    );
  }
}

function magically(fn) {
  Promise.resolve().then(() => {
    ReactDOM.unstable_deferredUpdates(fn);
  });
}

const container = document.getElementById('root');
ReactDOM.render(
  <Demo />,
  container
);
