export type UiStateType = 'toggle' | 'form';

export interface UiStateRecord {
  id: number;
  componentKey: string;
  stateType: UiStateType;
  stateValue: string;
  updatedAt: string;
}

export type DbType = 'sqlite';

export interface DbConnectionRecord {
  id: number;
  name: string;
  dbType: DbType;
  connectionString: string;
  createdAt: string;
}
