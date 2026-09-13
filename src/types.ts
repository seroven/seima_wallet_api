export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
};

export type TransactionType = 'income' | 'expense';
export type WalletCurrency = 'USD' | 'PEN';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: string;
  subject: string;
  photo_path: string;
  occurred_at: string | Date;
  created_by: string;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type TransactionSnapshot = {
  id: string;
  type: TransactionType;
  amount: string;
  subject: string;
  photo_path: string;
  occurred_at: string;
  created_by: string;
  updated_by: string | null;
  deleted_at: string | null;
};
