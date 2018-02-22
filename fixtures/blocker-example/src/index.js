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

class AsyncValue extends React.Component {
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

class App extends React.Component {
  state = {
    input: DEFAULT_INPUT,
    // result: DEFAULT_INPUT
  };
  handleChange = (e) => {
    const input = e.target.value;
    // Promise.resolve().then(() => {
    //   ReactDOM.unstable_deferredUpdates(() => {
    //     this.setState(state => ({
    //       result: state.input
    //     }));
    //   })      
    // });

    this.setState({
      input
    });
  };
  render() {

    // console.log("Input:")
    // console.log(this.state.input.substr(
    //   this.state.input.indexOf('##'),
    //   this.state.input.indexOf('- [') - this.state.input.indexOf('##')
    // ))

    // console.log("Result:")
    // console.log(this.state.result.substr(
    //   this.state.result.indexOf('##'),
    //   this.state.result.indexOf('- [') - this.state.result.indexOf('##')
    // ))
    // console.log('-----')

    // h
    // hel
    // hello w
    // hello world
    // hello w
    // hello world

    return (
      <React.Fragment>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Live Markdown Editor</h1>
          <textarea style={{ width: '100%', height: '100%' }} value={this.state.input} onChange={this.handleChange} />
        </div>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Preview</h1>

          <AsyncValue defaultValue="" value={this.state.input}>
            {asyncInput => <MarkdownRenderer source={asyncInput} />}
          </AsyncValue>

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
