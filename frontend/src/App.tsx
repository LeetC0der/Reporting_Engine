import { FormEvent, useEffect, useMemo, useState } from 'react';

type UiStateItem = {
  id: number;
  componentKey: string;
  stateType: 'toggle' | 'form';
  stateValue: string;
  updatedAt: string;
};

type Connection = {
  id: number;
  name: string;
  dbType: 'sqlite';
  connectionString: string;
  createdAt: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [toggleOn, setToggleOn] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [stateLog, setStateLog] = useState<UiStateItem[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState('');

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId]
  );

  const refreshStateLog = async () => {
    const payload = await fetchJson<{ data: UiStateItem[] }>('/api/ui-state');
    setStateLog(payload.data);
  };

  const refreshConnections = async () => {
    const payload = await fetchJson<{ data: Connection[] }>('/api/connections');
    setConnections(payload.data);
    if (!selectedConnectionId && payload.data.length > 0) {
      setSelectedConnectionId(payload.data[0].id);
    }
  };

  useEffect(() => {
    void refreshStateLog();
    void refreshConnections();
  }, []);

  const persistState = async (componentKey: string, stateType: 'toggle' | 'form', stateValue: string) => {
    await fetchJson('/api/ui-state', {
      method: 'POST',
      body: JSON.stringify({ componentKey, stateType, stateValue })
    });
    await refreshStateLog();
  };

  const toggleState = async () => {
    const next = !toggleOn;
    setToggleOn(next);
    await persistState('feature-toggle', 'toggle', JSON.stringify({ enabled: next }));
  };

  const submitFormState = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistState('user-name-form', 'form', JSON.stringify({ name: nameInput }));
    setFormStatus('Form state persisted to Node.js state store');
  };

  const registerConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await fetchJson<{ data: Connection }>('/api/connections', {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        dbType: 'sqlite',
        connectionString: data.get('connectionString')
      })
    });

    event.currentTarget.reset();
    await refreshConnections();
  };

  const loadTables = async () => {
    if (!selectedConnection) {
      return;
    }

    const payload = await fetchJson<{ data: string[] }>(`/api/connections/${selectedConnection.id}/tables`);
    setTables(payload.data);
  };

  return (
    <main className="layout">
      <h1>Reporting Engine Platform Starter</h1>
      <p>Frontend state is persisted in Node.js + SQLite so UI behavior can be audited and restored.</p>

      <section className="card">
        <h2>Server-Managed UI State</h2>
        <button onClick={() => void toggleState()} type="button" className="btn">
          Toggle Feature: {toggleOn ? 'ON' : 'OFF'}
        </button>

        <form onSubmit={(event) => void submitFormState(event)} className="stack">
          <label htmlFor="name">Example Form Input</label>
          <input id="name" value={nameInput} onChange={(event) => setNameInput(event.target.value)} />
          <button type="submit" className="btn">Save Form State in Node.js</button>
          {formStatus ? <small>{formStatus}</small> : null}
        </form>

        <h3>Persisted State Log</h3>
        <ul>
          {stateLog.map((state) => (
            <li key={state.id}>
              <strong>{state.componentKey}</strong>: {state.stateValue}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Database Connection Explorer (Base)</h2>
        <form onSubmit={(event) => void registerConnection(event)} className="stack">
          <label>
            Connection Name
            <input name="name" required placeholder="Analytics DB" />
          </label>
          <label>
            SQLite File Path
            <input name="connectionString" required placeholder="./data/source.sqlite" />
          </label>
          <button type="submit" className="btn">Register Connection</button>
        </form>

        <div className="stack">
          <label>
            Available Connections
            <select
              value={selectedConnectionId ?? ''}
              onChange={(event) => setSelectedConnectionId(Number(event.target.value))}
            >
              <option value="">Select one</option>
              {connections.map((connection) => (
                <option value={connection.id} key={connection.id}>
                  {connection.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="button" onClick={() => void loadTables()}>
            Inspect Tables
          </button>
        </div>

        <ul>
          {tables.map((table) => (
            <li key={table}>{table}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
