/** Shared provider display order for the composer and command model pickers. */

function providerRank(id: string): number {
  if (id === 'mammoth-ground') return 0
  if (id === 'deepseek-account') return 1
  if (id === 'deepseek-official') return 2
  return 3
}

/**
 * Put the cloud gateway first, then account/official BYOK routes, preserving other relative order.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id))
}
