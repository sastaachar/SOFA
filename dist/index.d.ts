import type { SofaConfig } from './sofa';
export { OpenAPI } from './open-api';
export declare function useSofa(config: SofaConfig): import("@whatwg-node/server").ServerAdapter<unknown, import("itty-router").Router<import("itty-router").Request & Request, {}>>;
