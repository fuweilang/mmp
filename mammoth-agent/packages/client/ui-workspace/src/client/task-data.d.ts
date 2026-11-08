/** Task-owned destructive confirmation and archived-data page on the existing settings shell. */
import type { Context } from '@mammoth-ai/cordis';
/** Register once per actual connection context. Never persist task identity in global browser storage. */
export declare function installTaskDataSurfaces(ctx: Context, actions: {
    deleted(): void;
}): void;
//# sourceMappingURL=task-data.d.ts.map