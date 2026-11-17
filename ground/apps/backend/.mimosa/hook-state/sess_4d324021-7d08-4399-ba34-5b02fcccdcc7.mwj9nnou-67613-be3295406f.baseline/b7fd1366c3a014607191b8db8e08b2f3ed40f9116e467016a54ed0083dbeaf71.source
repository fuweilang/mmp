import { LibraryError } from './library.errors';
import { libraryLimitsFromEnv, type LibraryLimits } from './library.limits';
import type { LibraryStore } from './library.store';
import type { Actor } from './library.types';

/**
 * Everything a library call needs: the store handle, the limits, the clock and
 * whether a tenant write transaction is already open. A sub-service never
 * constructs another store or transaction on its own.
 */
export type LibraryContext = {
  readonly store: LibraryStore;
  readonly limits: LibraryLimits;
  readonly now: () => number;
  readonly writing: boolean;
};

export type LibraryContextInput = {
  store: LibraryStore;
  limits?: LibraryLimits;
  now?: () => number;
  writing?: boolean;
};

export function createLibraryContext(input: LibraryContextInput): LibraryContext {
  return {
    store: input.store,
    limits: input.limits ?? libraryLimitsFromEnv(),
    now: input.now ?? (() => Date.now()),
    writing: input.writing ?? false,
  };
}

export function assertTenantActor(actor: Actor): void {
  if (!actor.tenantId) throw new LibraryError(403, '缺少企业上下文', 'NO_TENANT');
}

/**
 * The single place that opens a tenant write transaction. `store.withTenantWrite`
 * reuses the caller's transaction when the store already wraps one, so an admin
 * transaction and a plain HTTP write path share the same handle instead of
 * nesting a second transaction.
 */
export function withWrite<T>(
  ctx: LibraryContext,
  actor: Actor,
  work: (ctx: LibraryContext) => Promise<T>,
): Promise<T> {
  assertTenantActor(actor);
  return ctx.store.withTenantWrite(actor.tenantId, store => work({ ...ctx, store, writing: true }));
}
