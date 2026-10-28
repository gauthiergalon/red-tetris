import { useState } from 'react';
import './App.css';

interface AppProps {}

function App(_props: AppProps) {
  const [count, setCount] = useState<number>(0);

  return (
    <div className="container">
      <h1>Red Tetris</h1>
      <p>Project initialized with:</p>
      <ul>
        <li>Node.js 26</li>
        <li>React 19 + TypeScript</li>
        <li>Vite 8</li>
        <li>Express 5</li>
      </ul>
      <button
        onClick={() => setCount((c) => c + 1)}
      >
        Counter: {count}
      </button>
    </div>
  );
}

export default App;
