import { pathToFileURL } from 'node:url';

/** Check before any migration or mutation; query parameters can redirect PostgreSQL clients. */
export function assertLibraryTestTarget(value, restore = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Refusing invalid dedicated library database target'); }
  const port = restore ? '55440' : '55439';
  const database = restore ? 'mmp_library_restore_acceptance' : 'mmp_library_acceptance';
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== port || url.pathname !== `/${database}` || !url.username || url.search || url.hash) {
    throw new Error(`Refusing database outside dedicated 127.0.0.1:${port}/${database}`);
  }
  return { port, database, user:decodeURIComponent(url.username) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assertLibraryTestTarget(process.env.LIBRARY_TEST_DATABASE_URL); }
  catch (error) { console.error(error.message); process.exitCode=2; }
}
