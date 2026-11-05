import { apiUrl, request } from './http';

export type AppVersion = {
  product: string;
  version: string;
};

/** 版本号唯一接口：/console/api/version（真实后端 /api/version）。 */
export function fetchAppVersion() {
  return request<AppVersion>(apiUrl('/api/version'));
}