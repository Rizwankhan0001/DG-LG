export type AccessRole = 'owner' | 'member' | 'visitor';
export interface AccessStatus {
  authenticated: boolean;
  role: AccessRole;
  email: string | null;
  readOnly: boolean;
  configured: boolean;
}
export interface MemberAccount { id: string; email: string; createdAt: string }
