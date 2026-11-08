/** Execute the actual Login.vue setup, Pinia auth store and HTTP client against the test API. */
const { readFileSync, existsSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const frontendRoot = resolve(__dirname, '../../frontend');
const frontendRequire = createRequire(resolve(frontendRoot, 'package.json'));
const ts = frontendRequire('typescript');
const { parse, compileScript } = require('@vue/compiler-sfc');
const vue = frontendRequire('vue');
const pinia = frontendRequire('pinia');

module.exports = async function runLoginPage({ origin, ticket, next, cookieName, cookie }) {
  let currentCookie = cookie || '';
  const calls = [], errors = [], mounted = [], modules = new Map();
  const location = { search: `?sso=${encodeURIComponent(ticket)}&next=${encodeURIComponent(next)}`, hostname: '127.0.0.1', href: '/login' };
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  const localStorage = storage(), sessionStorage = storage();
  const window = { location, localStorage, sessionStorage };
  const history = { replaceState(_state, _unused, url) { location.search = new URL(url, origin).search; } };
  const browserFetch = async (url, init = {}) => {
    const path = String(url).replace('/console/api/', '/api/');
    calls.push(path);
    const headers = new Headers(init.headers);
    if (currentCookie) headers.set('cookie', `${cookieName}=${currentCookie}`);
    const response = await fetch(origin + path, { ...init, headers });
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith(cookieName + '=')) currentCookie = value.split(';')[0].slice(cookieName.length + 1);
    }
    return response;
  };
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, FormData, AbortSignal,
    window, location, history, localStorage, sessionStorage, fetch: browserFetch });
  const load = filename => {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = filename.endsWith('.vue')
      ? compileScript(parse(readFileSync(filename, 'utf8')).descriptor, { id: 'browser-sso-login' }).content
      : readFileSync(filename, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const requireModule = name => {
      if (name === 'vue') return { ...vue, onMounted: callback => mounted.push(callback) };
      if (name === 'element-plus') return { ElMessage: { error: message => errors.push(message), warning: message => errors.push(message) } };
      if (name.endsWith('.vue')) return { default: {} };
      // Download artwork and non-console return routing are outside this authentication scenario.
      if (name === '../utils/agent') return {
        trustedAgentReturn: () => null,
        redirectToAgentWeb: () => false,
        launchAgentClient: () => {},
        openAgentChat: () => false,
        openAgentOnboarding: () => false,
      };
      if (name.startsWith('.')) {
        const base = resolve(dirname(filename), name);
        const file = [base, base + '.ts'].find(path => existsSync(path));
        if (!file) throw new Error(`Missing test module: ${name}`);
        return load(file);
      }
      return frontendRequire(name);
    };
    const execute = vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename });
    execute(requireModule, module, module.exports);
    return module.exports;
  };
  const previousPinia = pinia.getActivePinia();
  const testPinia = pinia.createPinia();
  pinia.setActivePinia(testPinia);
  try {
    const component = load(resolve(frontendRoot, 'src/views/Login.vue')).default;
    component.setup({}, { expose() {} });
    for (const callback of mounted) await callback();
    const store = load(resolve(frontendRoot, 'src/stores/auth.ts')).useAuthStore();
    return { cookie: currentCookie, calls, errors, destination: location.href, session: store.session };
  } finally {
    pinia.disposePinia(testPinia);
    pinia.setActivePinia(previousPinia);
  }
};
