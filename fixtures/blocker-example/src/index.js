import React, {Fragment, AsyncBoundary} from 'react';
import ReactDOM from 'react-dom';
// import ReactDOM from './ReactDOM-debug';

import {createElement} from 'glamor/react';
/* @jsx createElement */

import {css} from 'glamor';
import 'glamor/reset';
import Loading, {Debounce} from './Loading';
import {createNewCache} from './cache';
import './index.css';

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
  const [response] = await Promise.all([
    fetch(`http://hn.algolia.com/api/v1/items/${storyID}`),
    delay(2000),
  ]);
  return await response.json();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function Spinner() {
  return <div className="spinner" />;
}

class AsyncProps extends React.Component {
  state = {asyncProps: this.props.defaultProps};
  componentWillMount() {
    ReactDOM.unstable_deferredUpdates(() => {
      this.setState((state, props) => ({asyncProps: props}));
    });
  }
  componentWillUpdate(nextProps, nextState) {
    if (nextProps !== nextState.asyncProps) {
      ReactDOM.unstable_deferredUpdates(() => {
        this.setState((state, props) => ({asyncProps: props}));
      });
    }
  }
  render() {
    return this.props.children(this.state.asyncProps);
  }
}

function SearchInput({query, onQueryUpdate}) {
  return (
    <input
      onChange={event =>
        ReactDOM.flushSync(() => onQueryUpdate(event.target.value))
      }
      value={query}
    />
  );
}

function Result({result, onActiveItemUpdate, isActive, isLoading}) {
  return (
    <button
      onClick={() => ReactDOM.flushSync(() => onActiveItemUpdate(result))}
      css={[
        {
          background: 'transparent',
          textAlign: 'start',
          display: 'flex',
          width: 'auto',
          outline: 'none',
          border: '1px solid rgba(0,0,0,0.2)',
          cursor: 'pointer',
          ':not(:first-child)': {
            borderTop: 'none',
          },
          ':hover': {background: 'lightgray'},
          ':focus': {background: 'lightblue'},
        },
        isActive && {
          background: 'blue',
          ':focus': {background: 'blue'},
        },
      ]}>
      <div
        css={{
          flexGrow: 1,
          position: 'relative',
        }}>
        <h2 css={{fontSize: 16}}>{result.title}</h2>
        <p>Comments: {result.num_comments}</p>
      </div>
      <div
        css={{
          alignSelf: 'center',
          flexShrink: 1,
          position: 'relative',
          padding: '0 20px',
        }}>
        {isLoading && <Spinner />}
      </div>
    </button>
  );
}

function SearchResults({
  query,
  data,
  onActiveItemUpdate,
  activeItem,
  loadingItem,
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
        const isLoading =
          loadingItem !== null && hit.objectID === loadingItem.objectID;
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
      <button onClick={() => ReactDOM.flushSync(clearActiveItem)}>Back</button>
      <a href={result.url}>
        <h1>{result.title}</h1>
      </a>
      <Story id={result.objectID} data={data} />
    </Fragment>
  );
}

function MasterDetail({header, search, results, details, showDetails}) {
  return (
    <div
      css={{
        margin: '0 auto',
        width: 500,
        overflow: 'hidden',
        height: '100vh',
        display: 'grid',
        gridTemplateRows: 'min-content auto',
      }}>
      <div>{header}</div>
      <div
        css={[
          {
            width: 1000,
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '36px auto',
            gridTemplateAreas: `
                        'search  details'
                        'results details'
                  `,
            transition: 'transform 350ms ease-in-out',
            transform: 'translateX(0%)',
            overflow: 'hidden',
          },
          showDetails && {
            transform: 'translateX(-50%)',
          },
        ]}>
        <div css={{gridArea: 'search'}}>{search}</div>
        <div
          css={{
            gridArea: 'results',
            overflow: 'auto',
          }}>
          {results}
        </div>
        <div
          css={{
            gridArea: 'details',
            overflow: 'auto',
          }}>
          {details}
        </div>
      </div>
    </div>
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
    return (
      <AsyncProps
        activeItem={this.state.activeItem}
        query={this.state.query}
        data={this.state.data}
        defaultProps={{activeItem: null, query: '', data: this.state.data}}>
        {asyncProps => (
          <AsyncBoundary>
            {isDetailLoading => (
              <Debounce value={isDetailLoading} ms={1000}>
                {loadingItem => (
                  <MasterDetail
                    header={
                      <Fragment>
                        HN Demo
                        <button
                          onClick={() => ReactDOM.flushSync(this.invalidate)}>
                          Refresh
                        </button>
                      </Fragment>
                    }
                    search={
                      <SearchInput
                        query={this.state.query}
                        onQueryUpdate={this.onQueryUpdate}
                      />
                    }
                    results={
                      <AsyncBoundary>
                        {() => (
                          <SearchResults
                            query={asyncProps.query}
                            data={asyncProps.data}
                            activeItem={this.state.activeItem}
                            loadingItem={
                              isDetailLoading ? this.state.activeItem : null
                            }
                            onActiveItemUpdate={this.onActiveItemUpdate}
                          />
                        )}
                      </AsyncBoundary>
                    }
                    details={
                      asyncProps.activeItem && (
                        <Details
                          data={asyncProps.data}
                          clearActiveItem={this.clearActiveItem}
                          result={asyncProps.activeItem}
                        />
                      )
                    }
                    showDetails={asyncProps.activeItem !== null}
                  />
                )}
              </Debounce>
            )}
          </AsyncBoundary>
        )}
      </AsyncProps>
    );
  }
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

root.render(<App />);
