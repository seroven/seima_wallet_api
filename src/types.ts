export type RoleCode = 'admin' | 'registrador' | 'revisor';

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  roles: RoleCode[];
};

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'validated';
export type WalletCurrency = 'USD' | 'PEN';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VALIDATE';

export type TransactionRow = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  subject: string;
  photo_path: string | null;
  evidence_path: string | null;
  occurred_at: string | Date;
  created_by: string;
  updated_by: string | null;
  validated_by: string | null;
  validated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type TransactionSnapshot = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  subject: string;
  photo_path: string | null;
  evidence_path: string | null;
  occurred_at: string;
  created_by: string;
  updated_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  deleted_at: string | null;
};
