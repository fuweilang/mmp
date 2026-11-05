/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 猛犸智能体网页版地址；本地开发缺省为 http://127.0.0.1:3080/。 */
  readonly VITE_AGENT_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
