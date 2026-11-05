/** Private built entry for retained Node evaluations. */
import { openInheritedControlChannel } from '@mammoth-ai/mmp-subprocess/control'
import { runPersistentMain } from './persistent-process.ts'

void runPersistentMain(openInheritedControlChannel(), Number(process.argv[2]), process)
