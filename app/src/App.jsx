import { useSearchParams } from 'react-router-dom';
import Home from './pages/Home';
import Session from './pages/Session';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';

export default function App() {
  const [params] = useSearchParams();
  const sessionId = params.get('s');
  return (
    <ErrorBoundary>
      <ToastContainer />
      {sessionId ? <Session id={sessionId} /> : <Home />}
    </ErrorBoundary>
  );
}
