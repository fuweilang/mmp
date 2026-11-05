export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 中台 API 前缀改写：`/api/*` → 网关 `/console/api/*`。http() 与 kbDownloadUrl() 共用。 */
export function apiUrl(path: string) {
  if (path.startsWith('/api/')) {
    return `/console/api/${path.slice(5)}`;
  }
  return path;
}

export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !headers.has('Content-Type') && !isForm) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  if (
    res.status === 401
    && !url.endsWith('/auth/login')
    && !url.includes('/auth/browser-sso-consume')
  ) {
    // login / sso-consume 页面自身不跳转，让调用方处理 401。
    if (!location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/login?next=${next}`;
      // 已经在跳登录了：返回不落地的 Promise，避免调用方 toast 报错造成双重提示。
      return new Promise<T>(() => {});
    }
    throw new ApiError(401, '未登录');
  }
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  if (text && !contentType.includes('application/json')) {
    throw new ApiError(res.status || 502, "接口未就绪：返回的不是 JSON。请确认中台 API 和网关已重启。");
  }
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(res.status || 502, '接口返回的数据无法解析：请确认中台 API 已正常启动。');
    }
  }
  if (!res.ok) {
    const msg = (data as { message?: unknown })?.message;
    const msgText = Array.isArray(msg)
      ? msg.join('；')
      : typeof msg === 'string' && msg
        ? msg
        : '请求失败';
    throw new ApiError(res.status, msgText);
  }
  return data as T;
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(apiUrl(path), init);
}

/** 总后台请求：`/admin/api/*` → 网关 → 中台 `/api/admin/*`。 */
export async function adminHttp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('/admin/api') ? path : `/admin/api${path}`;
  return request<T>(url, init);
}
