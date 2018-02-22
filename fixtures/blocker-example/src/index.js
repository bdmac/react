import React from 'react';
import ReactDOM from 'react-dom';
import Markdown from 'react-markdown';
import DEFAULT_INPUT from './README';
import './index.css';

class MarkdownRenderer extends React.PureComponent {
  render() {
    return <Markdown {...this.props} />
  }
}

class SyncValue extends React.Component {
  render() {
    return this.props.children(this.props.value);
  }
}

function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

class DebouncedValue extends React.PureComponent {
  state = {debouncedValue: this.props.defaultValue};

  update = debounce(() => {
    this.setState({
      debouncedValue: this.props.value
    });
  }, 500);

  componentDidUpdate() {
    if (this.props.value !== this.state.debouncedValue) {
      this.update();
    }
  }  

  render() {
    return this.props.children(this.state.debouncedValue);
  }
}


class AsyncValue extends React.PureComponent {
  state = {asyncValue: this.props.defaultValue};
  componentDidMount() {
    ReactDOM.unstable_deferredUpdates(() => {
      this.setState((state, props) => ({asyncValue: props.value}));
    });
  }
  componentDidUpdate() {
    if (this.props.value !== this.state.asyncValue) {
      ReactDOM.unstable_deferredUpdates(() => {
        this.setState((state, props) => ({asyncValue: props.value}));
      });
    }
  }
  render() {
    return this.props.children(this.state.asyncValue);
  }
}

const types = {
  sync: SyncValue,
  async: AsyncValue,
  debounced: DebouncedValue
}

class App extends React.Component {
  state = {
    input: DEFAULT_INPUT,
    strategy: 'sync'
  };
  handleChange = (e) => {
    const input = e.target.value;
    this.setState({
      input
    });
  };
  render() {
    const strategy = this.state.strategy;
    const Strategy = types[strategy];
    return (
      <React.Fragment>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Live Markdown Editor</h1>
          <select value={this.state.strategy} onChange={e => this.setState({ strategy: e.target.value })}>
            <option value='sync'>sync</option>
            <option value='debounced'>debounced</option>
            <option value='async'>async</option>
          </select>
          <textarea style={{ width: '100%', height: '100%' }} value={this.state.input} onChange={this.handleChange} />
        </div>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Preview</h1>

          <div>
            <Strategy defaultValue={this.state.input} value={this.state.input}>
              {asyncInput => (
                <div style={{ opacity: asyncInput === this.state.input ? 1 : 0.8 }}>
                  <MarkdownRenderer source={asyncInput} />
                </div>
              )}
            </Strategy>
          </div>

        </div>
      </React.Fragment>
    );
  }
}


const container = document.getElementById('root');
ReactDOM.render(
  <React.unstable_AsyncMode>
    <App />
  </React.unstable_AsyncMode>,
  container
);
