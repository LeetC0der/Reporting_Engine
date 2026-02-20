import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { DbConnectionRecord, UiStateRecord, UiStateType } from './types.js';

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
  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS ui_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_key TEXT UNIQUE NOT NULL,
      state_type TEXT NOT NULL,
      state_value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    platformDb,
    `CREATE TABLE IF NOT EXISTS db_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      db_type TEXT NOT NULL,
      connection_string TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );
};

export const upsertUiState = async (
  componentKey: string,
  stateType: UiStateType,
  stateValue: string
): Promise<UiStateRecord> => {
  await run(
    platformDb,
    `INSERT INTO ui_state (component_key, state_type, state_value)
      VALUES (?, ?, ?)
      ON CONFLICT(component_key)
      DO UPDATE SET state_value=excluded.state_value, state_type=excluded.state_type, updated_at=CURRENT_TIMESTAMP`,
    [componentKey, stateType, stateValue]
  );

  const saved = await get<UiStateRecord & { component_key: string; state_type: UiStateType; state_value: string; updated_at: string }>(
    platformDb,
    `SELECT id, component_key, state_type, state_value, updated_at FROM ui_state WHERE component_key = ?`,
    [componentKey]
  );

  if (!saved) {
    throw new Error('Failed to persist UI state');
  }

  return {
    id: saved.id,
    componentKey: saved.component_key,
    stateType: saved.state_type,
    stateValue: saved.state_value,
    updatedAt: saved.updated_at
  };
};

export const listUiState = async (): Promise<UiStateRecord[]> => {
  const rows = await all<UiStateRecord & { component_key: string; state_type: UiStateType; state_value: string; updated_at: string }>(
    platformDb,
    `SELECT id, component_key, state_type, state_value, updated_at FROM ui_state ORDER BY updated_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    componentKey: row.component_key,
    stateType: row.state_type,
    stateValue: row.state_value,
    updatedAt: row.updated_at
  }));
};

export const createConnection = async (
  name: string,
  dbType: string,
  connectionString: string
): Promise<DbConnectionRecord> => {
  const result = await run(
    platformDb,
    `INSERT INTO db_connections (name, db_type, connection_string) VALUES (?, ?, ?)`,
    [name, dbType, connectionString]
  );

  const row = await get<DbConnectionRecord & { db_type: string; connection_string: string; created_at: string }>(
    platformDb,
    `SELECT id, name, db_type, connection_string, created_at FROM db_connections WHERE id = ?`,
    [result.lastID]
  );

  if (!row) {
    throw new Error('Connection could not be created');
  }

  return {
    id: row.id,
    name: row.name,
    dbType: row.db_type as 'sqlite',
    connectionString: row.connection_string,
    createdAt: row.created_at
  };
};

export const listConnections = async (): Promise<DbConnectionRecord[]> => {
  const rows = await all<DbConnectionRecord & { db_type: string; connection_string: string; created_at: string }>(
    platformDb,
    `SELECT id, name, db_type, connection_string, created_at FROM db_connections ORDER BY created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dbType: row.db_type as 'sqlite',
    connectionString: row.connection_string,
    createdAt: row.created_at
  }));
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
