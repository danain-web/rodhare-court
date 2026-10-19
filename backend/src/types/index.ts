export interface AuthUserPayload {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  sessionId: string;
}

export interface UserDTO {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  memberTypeId: number;
  memberTypeName?: string;
  roles: string[];
  permissions?: string[];
  googleLinked?: boolean;
  isActive: boolean;
  createdAt: Date;
}
