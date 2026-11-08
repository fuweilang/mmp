import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Modal } from '@mammoth-ai/mmp-client-ui-primitives';
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store';
import css from './task-data.module.css';
function messageText(value) {
    if (typeof value !== 'object' || value === null)
        return '';
    const object = value;
    if (Array.isArray(object.content))
        return object.content.map(block => {
            if (typeof block !== 'object' || block === null)
                return '';
            const item = block;
            return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
        }).filter(Boolean).join('\n');
    return object.message ? messageText(object.message) : '';
}
/** Register once per actual connection context. Never persist task identity in global browser storage. */
export function installTaskDataSurfaces(ctx, actions) {
    const t = ctx.locale.bind('workspace');
    // ClientWorkspaceModel methods use `this`. React invokes callbacks unbound;
    // retain the service/model receiver rather than extracting its methods.
    const workspaceSource = {
        subscribe: (listener) => ctx.workspaces.list.subscribe(listener),
        getSnapshot: () => ctx.workspaces.list.getSnapshot(),
    };
    const sessionSource = {
        subscribe: (listener) => ctx.sessions.list.subscribe(listener),
        getSnapshot: () => ctx.sessions.list.getSnapshot(),
    };
    const permitted = (id, action) => ctx.remoteAccess.source('session', id, action).getSnapshot();
    const target = createSnapshotStore(null);
    const requestDelete = (sessionId, title) => { target.set({ sessionId, title }); };
    ctx.effect(() => ctx.contextMenus.register({
        id: 'session.delete-task', target: 'session', order: 700,
        observe: ({ sessionId }) => [ctx.remoteAccess.source('session', sessionId, 'session/deleteTask')],
        resolve: ({ sessionId, displayTitle }) => ctx.remoteAccess.source('session', sessionId, 'session/deleteTask').getSnapshot() ? [{
                id: 'delete-task', label: t('delete.task'), icon: { key: 'workspace.delete' }, danger: true, separatorBefore: true, afterContent: true,
                run: () => { requestDelete(sessionId, displayTitle); },
            }] : [],
    }), 'ui-workspace: permanent task delete');
    function DeleteTaskDialog() {
        const current = useSyncExternalStore(target.subscribe, target.getSnapshot);
        const [busy, setBusy] = useState(false), busyRef = useRef(false);
        const [error, setError] = useState('');
        if (current === null)
            return null;
        const close = () => { if (!busy) {
            target.set(null);
            setError('');
        } };
        const remove = async () => {
            if (busyRef.current)
                return;
            busyRef.current = true;
            setBusy(true);
            setError('');
            try {
                if (!permitted(current.sessionId, 'session/deleteTask'))
                    throw new Error(t('data.denied'));
                const result = await ctx.remote.session.deleteTask({ sessionId: current.sessionId, confirmation: 'permanent-delete' });
                if (!result.ok)
                    throw new Error(result.error.message);
                target.set(null);
                actions.deleted();
            }
            catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
            }
            finally {
                busyRef.current = false;
                setBusy(false);
            }
        };
        return _jsxs(Modal, { open: true, onClose: close, closeLabel: t('data.close'), title: t('delete.task.title'), description: current.title, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: busy, onClick: close, children: t('data.cancel') }), _jsx(Button, { variant: "outline", className: css.danger, disabled: busy, onClick: () => { void remove(); }, children: busy ? t('data.busy') : t('delete.task.confirm') })] }), children: [_jsx("p", { children: t('delete.task.description') }), error && _jsx("p", { role: "alert", className: css.error, children: error })] });
    }
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'task-delete-confirm' }, DeleteTaskDialog));
    function ArchivedTasks() {
        const workspace = useSyncExternalStore(workspaceSource.subscribe, workspaceSource.getSnapshot);
        const list = useSyncExternalStore(sessionSource.subscribe, sessionSource.getSnapshot);
        const [query, setQuery] = useState('');
        const [page, setPage] = useState(0);
        const [busy, setBusy] = useState(null);
        const [notice, setNotice] = useState('');
        const [error, setError] = useState('');
        const [destinations, setDestinations] = useState({});
        const [view, setView] = useState(null);
        const [retrying, setRetrying] = useState(false), retryRef = useRef(false);
        const [reading, setReading] = useState(false), readEpoch = useRef(0), readingRef = useRef(false);
        useEffect(() => () => { readEpoch.current++; readingRef.current = false; }, []);
        const needle = query.trim().toLocaleLowerCase();
        const rows = (workspace.state === 'error' ? [] : workspace.archivedSessionIds).map(id => ({ id, summary: list.byId[id] })).filter(row => row.summary !== undefined && (!needle || row.summary.displayTitle.toLocaleLowerCase().includes(needle)));
        const last = Math.max(0, Math.ceil(rows.length / 20) - 1);
        const visible = rows.slice(Math.min(page, last) * 20, (Math.min(page, last) + 1) * 20);
        const read = async (id, title, earlier = false) => {
            if (readingRef.current)
                return;
            readingRef.current = true;
            const epoch = ++readEpoch.current;
            setReading(true);
            setError('');
            try {
                if (!permitted(id, 'session/events'))
                    throw new Error(t('data.denied'));
                const result = await ctx.remote.session.events({ address: { kind: 'session', sessionId: id }, maxMessages: 20,
                    ...(earlier && view?.before !== undefined ? { beforeSeq: view.before, throughSeq: view.through } : {}) });
                if (readEpoch.current !== epoch)
                    return;
                if (!result.ok)
                    throw new Error(result.error.message);
                const records = result.value.records;
                const lines = records.filter(row => row.event.type === 'user/message' || row.event.type === 'assistant/message').map(row => messageText(row.event.data)).filter(Boolean);
                setView({ id, title, lines: earlier && view?.id === id ? [...lines, ...view.lines] : lines,
                    ...(records[0] ? { before: records[0].event.seq } : {}), through: result.value.cursor, more: result.value.hasMore });
            }
            catch (reason) {
                if (readEpoch.current === epoch)
                    setError(reason instanceof Error ? reason.message : String(reason));
            }
            finally {
                if (readEpoch.current === epoch) {
                    readingRef.current = false;
                    setReading(false);
                }
            }
        };
        const restore = async (id) => {
            if (busy)
                return;
            setBusy(id);
            setError('');
            setNotice('');
            try {
                if (!permitted(id, 'workspace/unarchiveSession'))
                    throw new Error(t('data.denied'));
                const chosen = destinations[id];
                const result = await ctx.remote.workspace.unarchiveSession({ sessionId: id, ...(chosen ? { workspaceId: chosen } : {}) });
                if (!result.ok)
                    throw new Error(result.error.message);
                setNotice(t('data.restored'));
            }
            catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
            }
            finally {
                setBusy(null);
            }
        };
        const retry = async () => {
            if (retryRef.current)
                return;
            retryRef.current = true;
            setRetrying(true);
            setError('');
            try {
                if (!ctx.workspaces.retryList)
                    throw new Error(t('data.retryUnavailable'));
                await ctx.workspaces.retryList();
            }
            catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
            }
            finally {
                retryRef.current = false;
                setRetrying(false);
            }
        };
        return _jsxs("section", { className: css.page, children: [_jsx("h2", { children: t('data.archived') }), _jsx("input", { className: css.search, "aria-label": t('data.search'), placeholder: t('data.search'), value: query, onChange: event => { setQuery(event.target.value); setPage(0); } }), notice && _jsx("p", { role: "status", children: notice }), error && _jsx("p", { role: "alert", className: css.error, children: error }), workspace.state === 'error' && _jsx("p", { role: "alert", className: css.error, children: workspace.error?.message ?? t('data.loadError') }), (workspace.state === 'error' || error) && _jsx(Button, { variant: "outline", disabled: retrying, onClick: () => { void retry(); }, children: retrying ? t('data.busy') : t('data.retry') }), (workspace.phase !== 'ready' || list.phase !== 'ready' || workspace.state === 'loading') && _jsx("p", { role: "status", children: t('data.listLoading') }), workspace.phase === 'ready' && list.phase === 'ready' && workspace.state === 'idle' && rows.length === 0 && _jsx("p", { children: t('data.empty') }), visible.map(({ id, summary }) => {
                    const title = summary?.displayTitle ?? id;
                    const owner = workspace.items.find(item => item.sessionIds.includes(id));
                    return _jsxs("article", { className: css.row, children: [_jsx("div", { className: css.name, children: title }), !owner && _jsxs("div", { className: css.destination, children: [_jsx("p", { children: t('data.destination') }), _jsxs("select", { "aria-label": t('data.destination'), value: destinations[id] ?? '', onChange: event => { setDestinations(old => ({ ...old, [id]: event.target.value })); }, children: [_jsx("option", { value: "", children: "\u2014" }), workspace.items.map(item => _jsx("option", { value: item.workspaceId, children: item.title }, item.workspaceId))] })] }), _jsxs("div", { className: css.actions, children: [_jsx(Button, { variant: "outline", disabled: reading || !permitted(id, 'session/events'), onClick: () => { void read(id, title); }, children: t('data.view') }), _jsx(Button, { variant: "outline", disabled: busy !== null || !permitted(id, 'workspace/unarchiveSession') || (!owner && !destinations[id]), onClick: () => { void restore(id); }, children: t('data.restore') }), _jsx(Button, { variant: "outline", className: css.danger, disabled: !permitted(id, 'session/deleteTask'), onClick: () => { requestDelete(id, title); }, children: t('delete.task') })] })] }, id);
                }), _jsxs("nav", { className: css.actions, "aria-label": t('data.archived'), children: [_jsx(Button, { variant: "outline", disabled: page === 0, onClick: () => { setPage(old => Math.max(0, old - 1)); }, children: t('data.previous') }), _jsxs("span", { children: [Math.min(page, last) + 1, " / ", last + 1] }), _jsx(Button, { variant: "outline", disabled: page >= last, onClick: () => { setPage(old => old + 1); }, children: t('data.next') })] }), view && _jsxs(Modal, { open: true, title: view.title, description: t('data.readonly'), closeLabel: t('data.close'), onClose: () => { if (!reading)
                        setView(null); }, children: [view.lines.map((text, index) => _jsx("pre", { className: css.history, children: text }, index)), view.more && _jsx(Button, { variant: "outline", disabled: reading || !permitted(view.id, 'session/events'), onClick: () => { void read(view.id, view.title, true); }, children: reading ? t('data.loading') : t('data.moreHistory') })] })] });
    }
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'data-management', order: 800, label: () => t('data.title') }, ArchivedTasks));
}
//# sourceMappingURL=task-data.js.map