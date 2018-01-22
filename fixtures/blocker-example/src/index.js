import React, {Fragment, AsyncBoundary, ExpirationBoundary} from 'react';
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

const TMDB_API_PATH = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = '762954999d09f9db6ffc6c0e6f37d509';

async function fetchConfig() {
  const response = await fetch(
    `${TMDB_API_PATH}/configuration?api_key=${TMDB_API_KEY}`
  );
  return await response.json();
}

async function searchMovies(query) {
  const response = await fetch(
    `${TMDB_API_PATH}/search/movie?api_key=${TMDB_API_KEY}&query=${
      query
    }&include_adult=false`
  );
  return await response.json();
}

function loadImage(src) {
  const image = new Image();
  return new Promise(resolve => {
    image.onload = () => resolve();
    image.src = src;
  });
}

const fetchMovie = addArtificialDelay(3000, async id => {
  const response = await fetch(
    `${TMDB_API_PATH}/movie/${id}?api_key=${TMDB_API_KEY}`
  );
  return await response.json();
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addArtificialDelay(ms, asyncFn) {
  return async (...args) => {
    const [result] = await Promise.all([asyncFn(...args), delay(ms)]);
    return result;
  };
}

function Spinner() {
  return <div className="spinner" />;
}

function Fallback({children, placeholder}) {
  return (
    <ExpirationBoundary>
      {didExpire => (
        <Fragment>
          {didExpire ? placeholder : null}
          <div hidden={didExpire}>{children}</div>
        </Fragment>
      )}
    </ExpirationBoundary>
  );
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

function Result({data, result, onActiveResultUpdate, isActive, isLoading}) {
  const config = data.read('config', fetchConfig);
  const size = config.images.poster_sizes[0];
  const baseURL =
    document.location.protocol === 'https:'
      ? config.images.secure_base_url
      : config.images.base_url;
  const width = parseInt(size.replace(/\w/, ''), 10);
  const height = width / 27 * 40;
  return (
    <button
      onClick={() => ReactDOM.flushSync(() => onActiveResultUpdate(result))}
      css={[
        {
          background: 'transparent',
          textAlign: 'start',
          display: 'flex',
          width: 'auto',
          outline: 'none',
          border: '1px solid rgba(0,0,0,0.2)',
          cursor: 'pointer',
          padding: 0,
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
          display: 'flex',
          flexGrow: 1,
          position: 'relative',
        }}>
        <div css={{width, height}}>
          {result.poster_path !== null && (
            <img
              src={`${baseURL}/${size}/${result.poster_path}`}
              css={{padding: 0, margin: 0}}
            />
          )}
        </div>
        <h2 css={{fontSize: 16}}>{result.title}</h2>
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
  onActiveResultUpdate,
  activeResult,
  loadingResult,
}) {
  if (query.trim() === '') {
    return 'Search for something';
  }
  const {results} = data.read(`searchMovies:${query}`, () =>
    searchMovies(query)
  );
  return (
    <div css={{display: 'flex', flexDirection: 'column'}}>
      {results.map(result => {
        return (
          <Result
            key={result.id}
            data={data}
            result={result}
            onActiveResultUpdate={onActiveResultUpdate}
            isActive={activeResult !== null && activeResult.id === result.id}
            isLoading={loadingResult !== null && loadingResult.id === result.id}
          />
        );
      })}
    </div>
  );
}

function FullPoster({data, movie}) {
  const path = movie.poster_path;
  if (path === null) {
    return null;
  }
  const config = data.read('config', fetchConfig);
  const size = config.images.poster_sizes[2];
  const baseURL =
    document.location.protocol === 'https:'
      ? config.images.secure_base_url
      : config.images.base_url;
  const width = size.replace(/\w/, '');
  const src = `${baseURL}/${size}/${movie.poster_path}`;
  data.read(`loadImage:${src}`, () => loadImage(src));
  return <img width={width} src={src} />;
}

function MovieInfo({movie, data, clearActiveResult}) {
  const fullResult = data.read(`fetchMovie:${movie.id}`, () =>
    fetchMovie(movie.id)
  );
  return (
    <Fragment>
      <Fallback placeholder={<Spinner />}>
        <FullPoster data={data} movie={movie} />
      </Fallback>
      <h2>{movie.title}</h2>
      <div>{movie.overview}</div>
    </Fragment>
  );
}

function Details({result, clearActiveResult, data}) {
  return (
    <Fragment>
      <button onClick={() => clearActiveResult()}>Back</button>
      <Fallback placeholder={<Spinner />}>
        <MovieInfo movie={result} data={data} />
      </Fallback>
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
    activeResult: null,
  };
  invalidate = () => {
    this.setState({data: createNewCache(this.invalidate)});
  };
  onQueryUpdate = query => this.setState({query});
  onActiveResultUpdate = activeResult => this.setState({activeResult});
  clearActiveResult = () => this.setState({activeResult: null});
  render() {
    return (
      <AsyncProps
        activeResult={this.state.activeResult}
        query={this.state.query}
        data={this.state.data}
        defaultProps={{activeResult: null, query: '', data: this.state.data}}>
        {asyncProps => (
          <AsyncBoundary>
            {isDetailLoading => (
              <Debounce value={isDetailLoading} ms={1500}>
                {loadingItem => (
                  <MasterDetail
                    header={
                      <Fragment>
                        Blocker Demo
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
                            activeResult={this.state.activeResult}
                            loadingResult={
                              isDetailLoading ? this.state.activeResult : null
                            }
                            onActiveResultUpdate={this.onActiveResultUpdate}
                          />
                        )}
                      </AsyncBoundary>
                    }
                    details={
                      asyncProps.activeResult && (
                        <Details
                          data={asyncProps.data}
                          clearActiveResult={this.clearActiveResult}
                          result={asyncProps.activeResult}
                        />
                      )
                    }
                    showDetails={asyncProps.activeResult !== null}
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
