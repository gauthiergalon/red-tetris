import { useState } from 'react';
import './App.css';
import { Game } from './Game';
interface AppProps {}

export function App(_props: AppProps) {
  const [count, setCount] = useState<number>(0);
  const [inputText, setInputText] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);

  const appendHistory = (line: string) => {
    setHistory((prev) => [...prev, line]);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const handleCommand = (command: string) => {
    switch (command) {
      case 'clear':
        clearHistory();
        break;
      case 'help':
        appendHistory('Available commands: clear, help');
        break;
      case 'count':
        appendHistory(`Current count: ${count}`);
        break;
      default:
        appendHistory(`Unknown command: ${command}`);
    }
  }

  const handleSubmit = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    appendHistory(trimmed);
    handleCommand(trimmed);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

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

      <section>
        <h2>Counter</h2>
        <button onClick={() => setCount((c) => c + 1)}>
          Counter: {count}
        </button>
      </section>

      <section>
        <h2>History</h2>
        <div >
          {history.map((line) => (
            <p className="history-line">{line}</p>
          ))}
        </div>
      
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </section>

      <section>
        <Game />
      </section>
    </div>
  );
}

export default App;
