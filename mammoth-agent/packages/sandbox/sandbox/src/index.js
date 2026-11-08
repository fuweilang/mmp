/**
 * Service Definition for the same-world process-confinement capability seam: wrap exact subprocess argv under a
 * host-path file policy. Containers, microVMs, and remote execution replace the
 * surrounding capability seam instead; this service shares the host kernel and filesystem.
 * @module @mammoth-ai/mmp-sandbox
 */
import { Service } from '@mammoth-ai/cordis';
import { HarnessError } from '@mammoth-ai/mmp-llm';
export { ESCALATION_TARGETS, WIDER_MODES, approveEscalation, escalationHintMarker, sandboxDenialMarker, sandboxPermissionsDescription, validateEscalationArgs, } from "./escalation.js";
export { canonicalPath, workspaceWritableRoots, writableRoots, SandboxInvalidRootError } from "./roots.js";
/**
 * Error code for a requested confined mode when no backend is usable. The
 * provider fails closed, and `HarnessError` carries the code through
 * `tool/result` so callers can distinguish missing confinement from command
 * failure.
 */
export const SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE';
/**
 * Thrown when {@link SandboxProvider.confine} cannot enforce the requested
 * mode. Carries {@link SANDBOX_UNAVAILABLE} through the structured error
 * channel.
 */
export class SandboxUnavailableError extends HarnessError {
    constructor(mode, detail) {
        super(`sandbox mode "${mode}" is requested but no sandbox backend is usable on this host; `
            + 'refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing '
            + 'kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL '
            + 'restricted-token runner can start (Windows) — otherwise switch the consumer to '
            + 'danger-full-access.'
            + (detail === undefined ? '' : ` Runner failure: ${detail}`), SANDBOX_UNAVAILABLE);
        this.name = 'SandboxUnavailableError';
    }
}
/** The selected backend is available but cannot enforce the requested policy. */
export class SandboxUnsupportedPolicyError extends HarnessError {
    constructor(detail) {
        super(detail, 'SANDBOX_UNSUPPORTED_POLICY');
        this.name = 'SandboxUnsupportedPolicyError';
    }
}
/**
 * Abstract process-sandbox service. {@link confine} must return enforcing argv
 * or fail closed at wrap or runner-execution time; silent unconfined passthrough
 * is forbidden. Functional probes arbitrate multi-runner chains and may be
 * skipped for a sole candidate, whose own refusal remains the fail-closed end.
 */
export class SandboxProvider extends Service {
    /* v8 ignore next -- abstract service construction is covered through concrete provider packages. */
    constructor(ctx) {
        super(ctx, 'sandbox');
    }
}
export default SandboxProvider;
export { classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from "./diagnostics.js";
//# sourceMappingURL=index.js.map