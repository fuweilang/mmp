import type { PrismaService } from '../prisma/prisma.service';

/**
 * 代理商子树：org_tree 递归取 rootId 下全部子孙租户 id（含 root 本身）。
 * cuid 主键无注入风险；递归 CTE 避免多次查询。
 */
export async function subtreeTenantIds(prisma: PrismaService, rootId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ child_id: string }>>(`
    WITH RECURSIVE sub AS (
      SELECT child_id FROM org_tree WHERE parent_id = '${rootId}'
      UNION ALL
      SELECT ot.child_id FROM org_tree ot JOIN sub s ON ot.parent_id = s.child_id
    )
    SELECT child_id FROM sub
  `);
  return [rootId, ...rows.map((r) => r.child_id)];
}
