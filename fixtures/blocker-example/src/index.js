import React, {Fragment} from 'react';
import ReactDOM from 'react-dom';

import {createElement} from 'glamor/react';
/* @jsx createElement */

import {css} from 'glamor';
import 'glamor/reset';
import Loading from './Loading';
import {createNewCache} from './cache';

css.global('*', {boxSizing: 'border-box'});

async function fetchSearchResults(query) {
  const response = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=story&query=${
      query
    }&numericFilters=num_comments>0`
  );
  return await response.json();
}

async function fetchStory(storyID) {
  const response = await fetch(`http://hn.algolia.com/api/v1/items/${storyID}`);
  return await response.json();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Controlled extends React.Component {
  state = {value: this.props.value};
  onUpdate = value => {
    this.props.onUpdate(value);
    ReactDOM.flushSync(() => this.setState({value}));
  };
  render() {
    return this.props.children(this.state.value, this.onUpdate);
  }
}

class Tear extends React.Component {
  state = {lowPriValue: this.props.value};
  componentWillReceiveProps() {
    const value = this.props.value;
    requestIdleCallback(() => {
      console.log('update!!!!!!!!!!!!!', value);
      this.setState({lowPriValue: value});
    });
  }
  render() {
    return this.props.children(this.state.lowPriValue);
  }
}

function SearchInput({query, onQueryUpdate}) {
  return (
    <Controlled value={query} onUpdate={onQueryUpdate}>
      {(controlledQuery, onUpdate) => (
        <input
          onChange={event => onUpdate(event.target.value)}
          value={controlledQuery}
        />
      )}
    </Controlled>
  );
}

function Result({result, onActiveItemUpdate, isActive, isLoading}) {
  if (isLoading) {
    console.log('///////////////////////////////////////////////');
  }
  return (
    <button
      onClick={() => onActiveItemUpdate(result)}
      css={[
        {
          background: 'transparent',
          textAlign: 'start',
          display: 'block',
          width: 'auto',
          outline: 'none',
          border: '1px solid rgba(0,0,0,0.2)',
          cursor: 'pointer',
          ':not(:first-child)': {
            borderTop: 'none',
          },
          ':hover': {background: 'lightblue'},
          ':focus': {background: 'lightblue'},
        },
        isActive && {
          background: 'blue',
          ':focus': {background: 'blue'},
        },
        isLoading && {
          border: '3px solid orange',
        },
      ]}>
      <h2 css={{fontSize: 16}}>{result.title}</h2>
      <p>Comments: {result.num_comments}</p>
    </button>
  );
}

function SearchResults({
  query,
  data,
  onActiveItemUpdate,
  activeItem,
  activeItemIsLoading,
}) {
  if (query.trim() === '') {
    return 'Search for something';
  }
  const results = data.read(`searchResults:${query}`, () =>
    fetchSearchResults(query)
  );

  return (
    <div css={{display: 'flex', flexDirection: 'column'}}>
      {results.hits.map(hit => {
        const isActive =
          activeItem !== null && activeItem.objectID === hit.objectID;
        const isLoading = isActive && activeItemIsLoading;
        return (
          <Result
            key={hit.objectID}
            result={hit}
            onActiveItemUpdate={onActiveItemUpdate}
            isActive={isActive}
            isLoading={isLoading}
          />
        );
      })}
    </div>
  );
}

function Comment({comment}) {
  return (
    <div>
      <div dangerouslySetInnerHTML={{__html: comment.text}} />
      {comment.children.map(comment => (
        <Comment key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

function Story({data, id}) {
  const story = data.read(`story:${id}`, () => fetchStory(id));
  return story.children.map(comment => (
    <Comment key={comment.id} comment={comment} />
  ));
}

function Details({result, clearActiveItem, data}) {
  return (
    <Fragment>
      <button onClick={clearActiveItem}>Back</button>
      <a href={result.url}>
        <h1>{result.title}</h1>
      </a>
      <Story id={result.objectID} data={data} />
    </Fragment>
  );
}

class App extends React.Component {
  state = {
    data: createNewCache(this.invalidate),
    query: '',
    activeItem: null,
  };
  invalidate = () => {
    this.setState({data: createNewCache(this.invalidate)});
  };
  onQueryUpdate = query => this.setState({query});
  onActiveItemUpdate = activeItem => this.setState({activeItem});
  clearActiveItem = () => this.setState({activeItem: null});
  render() {
    const {activeItem, data, query} = this.state;
    return (
      <Tear value={activeItem}>
        {lowPriActiveItem =>
          console.log(lowPriActiveItem) || (
            <div
              css={{
                margin: '0 auto',
                width: 500,
                overflow: 'hidden',
                height: '100vh',
                display: 'grid',
                gridTemplateRows: 'min-content auto',
              }}>
              <div>
                HN Demo
                <button onClick={this.invalidate}>Refresh</button>
              </div>
              <div
                css={{
                  width: 1000,
                  position: 'relative',
                  transition: 'left 200ms ease-in-out',
                  left: lowPriActiveItem === null ? 0 : '-100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gridTemplateRows: 'min-content auto',
                  gridTemplateAreas: `
                'search  details'
                'results details'
              `,
                  overflow: 'hidden',
                }}>
                <Loading>
                  {isDetailLoading => (
                    <Fragment>
                      <Loading>
                        {() => (
                          <Fragment>
                            <div css={{gridArea: 'search'}}>
                              <SearchInput
                                query={query}
                                onQueryUpdate={this.onQueryUpdate}
                              />
                            </div>
                            <div
                              css={{
                                gridArea: 'results',
                                overflow: 'auto',
                              }}>
                              <SearchResults
                                query={query}
                                data={data}
                                activeItem={activeItem}
                                activeItemIsLoading={isDetailLoading}
                                onActiveItemUpdate={this.onActiveItemUpdate}
                              />
                            </div>
                          </Fragment>
                        )}
                      </Loading>
                      <div
                        css={{
                          gridArea: 'details',
                          overflow: 'auto',
                        }}>
                        {lowPriActiveItem && (
                          <Details
                            data={data}
                            clearActiveItem={this.clearActiveItem}
                            result={lowPriActiveItem}
                          />
                        )}
                      </div>
                    </Fragment>
                  )}
                </Loading>
              </div>
            </div>
          )
        }
      </Tear>
    );
  }
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

root.render(<App />);
