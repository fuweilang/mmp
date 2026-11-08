/** Command identity and localized input spelling over the effective Host catalog. */
import type { CommandDescriptor } from '@mammoth-ai/mmp-commands/types';
import type { TranslateNS } from '@mammoth-ai/mmp-client-locale/client';
/**
 * Select the input spelling for a menu-picked command.
 * @param descriptor - effective Host descriptor.
 * @param t - command-namespace translator.
 * @returns localized spelling for a known definition, otherwise its registered name.
 */
export declare function claimToken(descriptor: CommandDescriptor, t: TranslateNS<'command'>): string;
//# sourceMappingURL=resolution.d.ts.map