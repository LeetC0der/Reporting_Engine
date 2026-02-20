import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import {
  DbConnectionRecord,
  PipelineRecord,
  SessionRecord,
  UiStateRecord,
  UserRecord
} from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PLATFORM_DB = path.join(DATA_DIR, 'platform.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const platformDb = new sqlite3.Database(PLATFORM_DB);

const run = (db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = <T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row as T | undefined);
    });
  });

const all = <T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows as T[]);
    });
  });

export const initPlatformDb = async (): Promise<void> => {
  await run(platformDb, 'PRAGMA foreign_keys = ON');

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS ui_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      component_key TEXT NOT NULL,
      state_type TEXT NOT NULL,
      state_value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, component_key),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS db_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      db_type TEXT NOT NULL,
      connection_string TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
};

export const createUser = async (email: string, passwordHash: string): Promise<UserRecord> => {
  const result = await run(platformDb, `INSERT INTO users (email, password_hash) VALUES (?, ?)`, [email, passwordHash]);
  const row = await get<{ id: number; email: string; password_hash: string; created_at: string }>(
    platformDb,
    `SELECT id, email, password_hash, created_at FROM users WHERE id = ?`,
    [result.lastID]
  );
  if (!row) {
    throw new Error('User creation failed');
  }
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
};

export const findUserByEmail = async (email: string): Promise<UserRecord | null> => {
  const row = await get<{ id: number; email: string; password_hash: string; created_at: string }>(
    platformDb,
    `SELECT id, email, password_hash, created_at FROM users WHERE email = ?`,
    [email]
  );
  if (!row) {
    return null;
  }
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
};

export const createSession = async (userId: number): Promise<SessionRecord> => {
  const token = crypto.randomBytes(32).toString('hex');
  const result = await run(platformDb, `INSERT INTO sessions (user_id, token) VALUES (?, ?)`, [userId, token]);
  const row = await get<{ id: number; user_id: number; token: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, token, created_at FROM sessions WHERE id = ?`,
    [result.lastID]
  );
  if (!row) {
    throw new Error('Session creation failed');
  }
  return { id: row.id, userId: row.user_id, token: row.token, createdAt: row.created_at };
};

export const getSessionByToken = async (token: string): Promise<SessionRecord | null> => {
  const row = await get<{ id: number; user_id: number; token: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, token, created_at FROM sessions WHERE token = ?`,
    [token]
  );
  if (!row) {
    return null;
  }
  return { id: row.id, userId: row.user_id, token: row.token, createdAt: row.created_at };
};

export const upsertUiState = async (
  userId: number,
  componentKey: string,
  stateType: 'toggle' | 'form' | 'navigation',
  stateValue: string
): Promise<UiStateRecord> => {
  await run(
    platformDb,
    `INSERT INTO ui_state (user_id, component_key, state_type, state_value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, component_key)
      DO UPDATE SET state_value=excluded.state_value, state_type=excluded.state_type, updated_at=CURRENT_TIMESTAMP`,
    [userId, componentKey, stateType, stateValue]
  );

  const saved = await get<{ id: number; user_id: number; component_key: string; state_type: 'toggle' | 'form' | 'navigation'; state_value: string; updated_at: string }>(
    platformDb,
    `SELECT id, user_id, component_key, state_type, state_value, updated_at FROM ui_state WHERE user_id = ? AND component_key = ?`,
    [userId, componentKey]
  );

  if (!saved) {
    throw new Error('Failed to persist UI state');
  }

  return {
    id: saved.id,
    userId: saved.user_id,
    componentKey: saved.component_key,
    stateType: saved.state_type,
    stateValue: saved.state_value,
    updatedAt: saved.updated_at
  };
};

export const listUiState = async (userId: number): Promise<UiStateRecord[]> => {
  const rows = await all<{ id: number; user_id: number; component_key: string; state_type: 'toggle' | 'form' | 'navigation'; state_value: string; updated_at: string }>(
    platformDb,
    `SELECT id, user_id, component_key, state_type, state_value, updated_at FROM ui_state WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    componentKey: row.component_key,
    stateType: row.state_type,
    stateValue: row.state_value,
    updatedAt: row.updated_at
  }));
};

export const createConnection = async (
  userId: number,
  name: string,
  dbType: 'sqlite',
  connectionString: string
): Promise<DbConnectionRecord> => {
  const result = await run(
    platformDb,
    `INSERT INTO db_connections (user_id, name, db_type, connection_string) VALUES (?, ?, ?, ?)`,
    [userId, name, dbType, connectionString]
  );

  const row = await get<{ id: number; user_id: number; name: string; db_type: 'sqlite'; connection_string: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, name, db_type, connection_string, created_at FROM db_connections WHERE id = ?`,
    [result.lastID]
  );

  if (!row) {
    throw new Error('Connection could not be created');
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dbType: row.db_type,
    connectionString: row.connection_string,
    createdAt: row.created_at
  };
};

export const listConnections = async (userId: number): Promise<DbConnectionRecord[]> => {
  const rows = await all<{ id: number; user_id: number; name: string; db_type: 'sqlite'; connection_string: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, name, db_type, connection_string, created_at FROM db_connections WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dbType: row.db_type,
    connectionString: row.connection_string,
    createdAt: row.created_at
  }));
};

export const deleteConnection = async (userId: number, connectionId: number): Promise<boolean> => {
  const result = await run(platformDb, `DELETE FROM db_connections WHERE id = ? AND user_id = ?`, [connectionId, userId]);
  return result.changes > 0;
};

export const createPipeline = async (userId: number, name: string, description: string): Promise<PipelineRecord> => {
  const result = await run(
    platformDb,
    `INSERT INTO pipelines (user_id, name, description) VALUES (?, ?, ?)`,
    [userId, name, description]
  );

  const row = await get<{ id: number; user_id: number; name: string; description: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, name, description, created_at FROM pipelines WHERE id = ?`,
    [result.lastID]
  );

  if (!row) {
    throw new Error('Pipeline creation failed');
  }

  return { id: row.id, userId: row.user_id, name: row.name, description: row.description, createdAt: row.created_at };
};

export const listPipelines = async (userId: number): Promise<PipelineRecord[]> => {
  const rows = await all<{ id: number; user_id: number; name: string; description: string; created_at: string }>(
    platformDb,
    `SELECT id, user_id, name, description, created_at FROM pipelines WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at
  }));
};

export const deletePipeline = async (userId: number, pipelineId: number): Promise<boolean> => {
  const result = await run(platformDb, `DELETE FROM pipelines WHERE id = ? AND user_id = ?`, [pipelineId, userId]);
  return result.changes > 0;
};

export const listSqliteTables = async (connectionString: string): Promise<string[]> => {
  const resolvedPath = path.resolve(connectionString);
  const externalDb = new sqlite3.Database(resolvedPath);
  const tables = await all<{ name: string }>(
    externalDb,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  externalDb.close();
  return tables.map((table) => table.name);
};
