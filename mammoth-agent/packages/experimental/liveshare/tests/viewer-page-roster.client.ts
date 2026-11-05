/**
 * Test-only client roster of the assembled viewer page.
 *
 * A served viewer page is the owner's own Web shell with the owner's client plugins; this roster is the
 * subset the viewer page specs need: the wire plugin, the Gateway, remote access, the Session/Workspace controllers,
 * the menu service, presentation plugins, and the Liveshare `./client` face, which mounts the viewer surfaces when the
 * carrier names a share. Every row is the package's own `/client` face registered as a module-table
 * factory. It must be imported only after {@link prepareViewerRemoteFaces} answered the generated
 * `/remote` faces these plugins import.
 *
 * @module @mammoth-ai/mmp-experimental-liveshare/tests/viewer-page-roster
 */

import * as apiGateway from '@mammoth-ai/mmp-api-gateway/client'
import * as apiRemoteAccess from '@mammoth-ai/mmp-api-remote-access/client'
import * as apiRemotes from '@mammoth-ai/mmp-api-remotes/client'
import * as apiSessionController from '@mammoth-ai/mmp-api-session-controller/client'
import * as apiWorkspaceController from '@mammoth-ai/mmp-api-workspace-controller/client'
import * as clientConnection from '@mammoth-ai/mmp-client-connection/client'
import * as clientFileUpload from '@mammoth-ai/mmp-client-file-upload/client'
import * as clientLocale from '@mammoth-ai/mmp-client-locale/client'
import * as clientModules from '@mammoth-ai/mmp-client-modules/client'
import * as clientResources from '@mammoth-ai/mmp-client-resources/client'
import * as clientShortcuts from '@mammoth-ai/mmp-client-shortcuts/client'
import * as uiAttachment from '@mammoth-ai/mmp-client-ui-attachment/client'
import * as uiChat from '@mammoth-ai/mmp-client-ui-chat/client'
import * as uiContextMenu from '@mammoth-ai/mmp-client-ui-context-menu/client'
import * as uiConversation from '@mammoth-ai/mmp-client-ui-conversation/client'
import * as uiDeliverables from '@mammoth-ai/mmp-client-ui-deliverables/client'
import * as uiFileDrag from '@mammoth-ai/mmp-client-ui-file-drag/client'
import * as uiLayout from '@mammoth-ai/mmp-client-ui-layout/client'
import * as uiRenderer from '@mammoth-ai/mmp-client-ui-renderer/client'
import * as uiSession from '@mammoth-ai/mmp-client-ui-session/client'
import * as uiSettings from '@mammoth-ai/mmp-client-ui-settings/client'
import * as uiSidebar from '@mammoth-ai/mmp-client-ui-sidebar/client'
import * as uiSidebarRight from '@mammoth-ai/mmp-client-ui-sidebar-right/client'
import * as uiTheme from '@mammoth-ai/mmp-client-ui-theme/client'
import * as uiTool from '@mammoth-ai/mmp-client-ui-tool/client'
import * as uiTrajectory from '@mammoth-ai/mmp-client-ui-trajectory/client'
import * as uiWorkspace from '@mammoth-ai/mmp-client-ui-workspace/client'
import * as typertRegistry from '@mammoth-ai/mmp-typert-registry/client'
import * as liveshare from '../src/client/index.ts'

/** One module-table row: the entry id the Loader creates, and that plugin's client exports. */
export interface ViewerPageRosterRow {
  readonly id: string
  readonly exports: Readonly<Record<string, unknown>>
}

/** Entry id of the module-system bootstrap whose exports the facade hands to the module system. */
export const VIEWER_PAGE_BOOTSTRAP_ID = '@mammoth-ai/mmp-client-modules'

/** The viewer page roster; Cordis composes these entries by service injection, so order is irrelevant. */
export const VIEWER_PAGE_ROSTER: readonly ViewerPageRosterRow[] = [
  { id: '@mammoth-ai/mmp-typert-registry', exports: typertRegistry },
  { id: '@mammoth-ai/mmp-experimental-liveshare', exports: liveshare },
  { id: VIEWER_PAGE_BOOTSTRAP_ID, exports: clientModules },
  { id: '@mammoth-ai/mmp-client-connection', exports: clientConnection },
  { id: '@mammoth-ai/mmp-api-gateway', exports: apiGateway },
  { id: '@mammoth-ai/mmp-api-remote-access', exports: apiRemoteAccess },
  { id: '@mammoth-ai/mmp-api-remotes', exports: apiRemotes },
  { id: '@mammoth-ai/mmp-api-session-controller', exports: apiSessionController },
  { id: '@mammoth-ai/mmp-api-workspace-controller', exports: apiWorkspaceController },
  { id: '@mammoth-ai/mmp-client-file-upload', exports: clientFileUpload },
  { id: '@mammoth-ai/mmp-client-locale', exports: clientLocale },
  { id: '@mammoth-ai/mmp-client-resources', exports: clientResources },
  { id: '@mammoth-ai/mmp-client-shortcuts', exports: clientShortcuts },
  { id: '@mammoth-ai/mmp-client-ui-renderer', exports: uiRenderer },
  { id: '@mammoth-ai/mmp-client-ui-theme', exports: uiTheme },
  { id: '@mammoth-ai/mmp-client-ui-settings', exports: uiSettings },
  { id: '@mammoth-ai/mmp-client-ui-layout', exports: uiLayout },
  { id: '@mammoth-ai/mmp-client-ui-session', exports: uiSession },
  { id: '@mammoth-ai/mmp-client-ui-sidebar', exports: uiSidebar },
  { id: '@mammoth-ai/mmp-client-ui-conversation', exports: uiConversation },
  { id: '@mammoth-ai/mmp-client-ui-chat', exports: uiChat },
  { id: '@mammoth-ai/mmp-client-ui-context-menu', exports: uiContextMenu },
  { id: '@mammoth-ai/mmp-client-ui-tool', exports: uiTool },
  { id: '@mammoth-ai/mmp-client-ui-attachment', exports: uiAttachment },
  { id: '@mammoth-ai/mmp-client-ui-file-drag', exports: uiFileDrag },
  { id: '@mammoth-ai/mmp-client-ui-sidebar-right', exports: uiSidebarRight },
  { id: '@mammoth-ai/mmp-client-ui-trajectory', exports: uiTrajectory },
  { id: '@mammoth-ai/mmp-client-ui-deliverables', exports: uiDeliverables },
  { id: '@mammoth-ai/mmp-client-ui-workspace', exports: uiWorkspace },
]
