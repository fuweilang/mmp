/** 平台角色与企业自定义角色的并集行类型（tenant/permissionsLocked 仅企业自定义角色有）。 */
export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  builtIn: boolean;
  editable: boolean;
  permissionsLocked?: boolean;
  permissions: string[];
  userCount: number;
  tenant?: { id: string; name: string } | null;
};
