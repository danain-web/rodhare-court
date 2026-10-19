import { DbConnection } from '../config/db';

export interface PermissionDTO {
  permissionId: number;
  code: string;
  description: string;
}

export interface RolePermissionsDTO {
  roleId: number;
  roleName: string;
  description?: string;
  permissions: string[];
}

export class PermissionRepository {
  // role ใดใน roleNames มี permission นี้หรือไม่
  async hasPermission(conn: DbConnection, roleNames: string[], code: string): Promise<boolean> {
    if (roleNames.length === 0) return false;
    const res = await conn.query(
      `SELECT 1
         FROM role_permissions rp
         JOIN roles r       ON r.role_id = rp.role_id
         JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE r.role_name = ANY($1::text[]) AND p.code = $2
        LIMIT 1`,
      [roleNames, code]
    );
    return res.rows.length > 0;
  }

  // permission ทั้งหมดที่ role เหล่านี้มี (ใช้ให้ frontend ซ่อน/แสดงเมนู)
  async listForRoles(conn: DbConnection, roleNames: string[]): Promise<string[]> {
    if (roleNames.length === 0) return [];
    const res = await conn.query(
      `SELECT DISTINCT p.code
         FROM role_permissions rp
         JOIN roles r       ON r.role_id = rp.role_id
         JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE r.role_name = ANY($1::text[])
        ORDER BY p.code`,
      [roleNames]
    );
    return res.rows.map((r: any) => r.code);
  }

  async listAllPermissions(conn: DbConnection): Promise<PermissionDTO[]> {
    const res = await conn.query(`SELECT permission_id, code, description FROM permissions ORDER BY code`);
    return res.rows.map((r: any) => ({ permissionId: r.permission_id, code: r.code, description: r.description }));
  }

  async listRolesWithPermissions(conn: DbConnection): Promise<RolePermissionsDTO[]> {
    const res = await conn.query(
      `SELECT r.role_id, r.role_name, r.description,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.role_id
         LEFT JOIN permissions p       ON p.permission_id = rp.permission_id
        GROUP BY r.role_id, r.role_name, r.description
        ORDER BY r.role_id`
    );
    return res.rows.map((r: any) => ({
      roleId: r.role_id,
      roleName: r.role_name,
      description: r.description ?? undefined,
      permissions: r.permissions,
    }));
  }

  async findRoleById(conn: DbConnection, roleId: number): Promise<{ roleId: number; roleName: string } | null> {
    const res = await conn.query(`SELECT role_id, role_name FROM roles WHERE role_id = $1`, [roleId]);
    return res.rows[0] ? { roleId: res.rows[0].role_id, roleName: res.rows[0].role_name } : null;
  }

  async getRolePermissionCodes(conn: DbConnection, roleId: number): Promise<string[]> {
    const res = await conn.query(
      `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_id = $1 ORDER BY p.code`,
      [roleId]
    );
    return res.rows.map((r: any) => r.code);
  }

  // รหัส permission ที่มีอยู่จริงจาก codes ที่ส่งมา (ใช้ตรวจว่าไม่มีรหัสแปลกปลอม)
  async existingCodes(conn: DbConnection, codes: string[]): Promise<string[]> {
    const res = await conn.query(`SELECT code FROM permissions WHERE code = ANY($1::text[])`, [codes]);
    return res.rows.map((r: any) => r.code);
  }

  async replaceRolePermissions(conn: DbConnection, roleId: number, codes: string[]): Promise<void> {
    await conn.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    if (codes.length === 0) return;
    await conn.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, permission_id FROM permissions WHERE code = ANY($2::text[])`,
      [roleId, codes]
    );
  }
}
