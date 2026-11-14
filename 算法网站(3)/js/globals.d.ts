/**
 * globals.d.ts —— 前端全局对象的类型声明（零构建项目里"跨文件共享全局"的类型补丁）
 *
 * 说明：本项目前端是原生经典脚本（非 ESM），各模块通过 window 上的命名空间协作。
 * 这份声明让 TypeScript 能对 `window.ICH` / `window.API` 等做基本约束，
 * 从而在**不引入打包器**的前提下获得类型检查（tsc --noEmit）。
 */

interface ICHProject {
  id: string;
  name: string;
  category: string;
  level?: string;
  region?: string;
  gradient?: string;
  brief?: string;
  popularity?: number;
  [key: string]: unknown;
}

interface ICHNamespace {
  projects: ICHProject[];
  categories: Array<{ id: string; name: string; [key: string]: unknown }>;
  works: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  news: Array<Record<string, unknown>>;
  getProject(id: string): ICHProject | null;
  getCategory(id: string): { id: string; name: string } | null;
  [key: string]: unknown;
}

interface OfflineStoreNamespace {
  call<T>(apiFn: () => Promise<T>, fallbackFn: () => T | Promise<T>): Promise<T>;
  auth: { login(username: string, password: string): { token: string; user: Record<string, unknown> } };
  [key: string]: unknown;
}

interface PatternResult {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  palette: { all: string[]; name: string; [key: string]: unknown };
  style: string;
  seed: number;
  heritageId: string;
  meta: { styleName: string; size: number; seed: number; heritageName: string; colors: string[] };
}

interface PatternGeneratorNamespace {
  generate(opts: { heritageId?: string; style?: string; seed?: number; size?: number }): PatternResult;
  STYLES: Array<{ key: string; name: string; desc: string }>;
  paletteOf(heritageId: string): Record<string, unknown>;
}

/** 带 HTTP 语义的错误对象（前端自行构造时用） */
interface HttpError extends Error {
  status?: number;
  details?: any;
  network?: boolean;
}

/** 前端全局命名空间（经典脚本跨文件共享，靠这份声明换取类型检查） */
declare const ICH: ICHNamespace;
declare const API: any;
declare const OfflineStore: any;
declare const PatternGenerator: any;

interface BackendGuard {
  notify(): void;
  hide(): void;
  check(): Promise<boolean>;
  chip(): void;
}

interface Window {
  ICH?: ICHNamespace;
  API?: Record<string, any>;
  OfflineStore?: OfflineStoreNamespace;
  PatternGenerator?: PatternGeneratorNamespace;
  __backendGuard?: BackendGuard;
  __offlineMode?: boolean;
  __dataLoadFailed?: boolean;
  __visionIndex?: unknown;
  launchBackendHint?: () => boolean;
  renderSiteHeader?: (active: string) => void;
  renderSiteFooter?: () => void;
  showToast?: (msg: string, type?: string) => void;
  showMessage?: (el: Element | null, html: string, type: string) => void;
  getUserData?: () => { username?: string; displayName?: string } | null;
  getRelativePath?: (p: string) => string;
  [key: string]: any;
}
