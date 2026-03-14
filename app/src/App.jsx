import { useSearchParams } from 'react-router-dom';

function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Bearings</h1>
        <p className="text-gray-500 mb-8">Collaborative GPS + compass triangulation</p>
        <p className="text-sm text-gray-400">Home page — coming in Phase 3</p>
      </div>
    </div>
  );
}

function Session({ id }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Session</h1>
        <p className="text-gray-500 mb-4 font-mono text-sm break-all">{id}</p>
        <p className="text-sm text-gray-400">Session view — coming in Phase 2+</p>
      </div>
    </div>
  );
}

export default function App() {
  const [params] = useSearchParams();
  const sessionId = params.get('s');
  return sessionId ? <Session id={sessionId} /> : <Home />;
}
