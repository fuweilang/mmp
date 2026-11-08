const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {EventEmitter}=require('node:events');
const{ApplicationLog,redactLog}=require('../dist/logging/application-log.service');const{RequestLoggingMiddleware}=require('../dist/request-logging.middleware');
test('operational redaction hides credentials and dialogue while preserving token counts',()=>{
 const text=JSON.stringify(redactLog({Authorization:'Bearer sensitive',cookie:'session',body:{content:'secret prompt'},messages:['private'],accessToken:'credential',inputTokens:123,outputTokens:4,url:'http://host/?token=sensitive&code=abc',error:Error('Bearer secret sk-testsecret')}));
 for(const secret of ['sensitive','secret prompt','credential','private','sk-testsecret'])assert.ok(!text.includes(secret));assert.ok(text.includes('123'));assert.ok(text.includes('REDACTED'));
});
test('HTTP start, finish and model logs share an isolated request id, omit queries, and persist as JSON lines',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mmp-log-test-'));const originalDir=process.env.LOG_DIR;process.env.LOG_DIR=directory;const originalLog=console.log;console.log=()=>{};
 const log=new ApplicationLog();const middleware=new RequestLoggingMiddleware(log);const ids=[];
 try{await Promise.all([1,2].map(i=>new Promise(resolve=>{const response=new EventEmitter();Object.assign(response,{headers:{},statusCode:200,writableFinished:true,setHeader(k,v){this.headers[k]=v;}});const req={method:'GET',originalUrl:'/api/models?token=do-not-log',user:{id:'user-'+i},tenantId:'tenant-'+i};middleware.use(req,response,()=>{ids.push(response.headers['X-Request-Id']);setImmediate(()=>{log.event('info','model.request',{model:'deepseek/example'});response.emit('finish');resolve();});});})));
 await log.onModuleDestroy();assert.notEqual(ids[0],ids[1]);const files=await fs.readdir(directory);assert.equal(files.length,1);const records=(await fs.readFile(path.join(directory,files[0]),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(records.length,6);for(const id of ids)assert.equal(records.filter(r=>r.requestId===id).length,3);assert.ok(!JSON.stringify(records).includes('do-not-log'));
 }finally{console.log=originalLog;if(originalDir===undefined)delete process.env.LOG_DIR;else process.env.LOG_DIR=originalDir;await fs.rm(directory,{recursive:true,force:true});}
});

test('successful http traces stay off the console but still land in the jsonl file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmp-log-quiet-'));
  const originalDir = process.env.LOG_DIR;
  process.env.LOG_DIR = directory;
  const lines = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => { lines.push(['log', ...args]); };
  console.error = (...args) => { lines.push(['error', ...args]); };
  const log = new ApplicationLog();
  try {
    log.event('info', 'http.start', { method: 'GET', path: '/api/auth/me' });
    log.event('info', 'http.finish', { method: 'GET', path: '/api/auth/me', status: 200 });
    log.event('warn', 'http.finish', { method: 'GET', path: '/api/auth/me', status: 401 });
    log.event('info', 'model.health.probe', { ok: true });
    await log.onModuleDestroy();
    assert.equal(lines.filter(([kind, line]) => kind === 'log' && String(line).includes('http.start')).length, 0);
    assert.equal(lines.filter(([kind, line]) => kind === 'log' && String(line).includes('"event":"http.finish"') && String(line).includes('"status":200')).length, 0);
    assert.equal(lines.filter((entry) => String(entry[1]).includes('"status":401')).length, 1);
    assert.equal(lines.filter((entry) => String(entry[1]).includes('model.health.probe')).length, 1);
    const files = await fs.readdir(directory);
    const records = (await fs.readFile(path.join(directory, files[0]), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(records.filter((r) => r.event === 'http.start' || r.event === 'http.finish').length, 3);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (originalDir === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = originalDir;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
