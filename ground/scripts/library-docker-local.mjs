import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function localEndpoint(value) {
  // A TCP loopback port could itself be an SSH tunnel. Only local IPC is supported.
  if(typeof value!=='string')return false;
  if(process.platform==='win32' && value==='npipe:////./pipe/docker_engine')return true;
  try {const endpoint=new URL(value);return endpoint.protocol==='unix:' && !endpoint.host && endpoint.pathname.startsWith('/') && !endpoint.search && !endpoint.hash;}catch{return false;}
}
function context(args) {
  const result=spawnSync('docker',['context',...args],{encoding:'utf8',maxBuffer:1024*1024});
  if(result.error || result.status!==0)throw new Error('Cannot verify local Docker context');
  return result.stdout.trim();
}
/** Resolve the actual inherited CLI endpoint before allowing a local-only operation. */
export function assertLocalDocker() {
  const host=process.env.DOCKER_HOST;
  if(host && !localEndpoint(host))throw new Error('Refusing non-local Docker host');
  let endpoint=host;
  if(!host || process.env.DOCKER_CONTEXT) {
    const name=process.env.DOCKER_CONTEXT || context(['show']);
    const entries=JSON.parse(context(['inspect',name]));
    if(entries.length!==1 || !localEndpoint(entries[0]?.Endpoints?.docker?.Host))throw new Error('Refusing non-local Docker context');
    endpoint=entries[0].Endpoints.docker.Host;
  }
  // Bind subsequent commands to the endpoint just checked, even if another process changes the CLI context.
  const environment={...process.env,DOCKER_HOST:endpoint};
  delete environment.DOCKER_CONTEXT;
  return environment;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {assertLocalDocker();}catch(error){console.error(error.message);process.exitCode=2;}
}
