import { GraphQLSchema, subscribe, execute } from 'graphql';
import { Ignore, OnRoute, Method, ContextFn, ContextValue } from './types';
import { ErrorHandler } from './router';
interface RouteConfig {
    method?: Method;
    path?: string;
    responseStatus?: number;
    tags?: string[];
    description?: string;
}
export interface Route {
    method: Method;
    path: string;
    responseStatus: number;
}
export interface SofaConfig {
    basePath: string;
    schema: GraphQLSchema;
    execute?: typeof execute;
    subscribe?: typeof subscribe;
    /**
     * Treats an Object with an ID as not a model.
     * @example ["User", "Message.author"]
     */
    ignore?: Ignore;
    onRoute?: OnRoute;
    depthLimit?: number;
    errorHandler?: ErrorHandler;
    /**
     * Overwrites the default HTTP route.
     */
    routes?: Record<string, RouteConfig>;
    context?: ContextFn | ContextValue;
}
export interface Sofa {
    basePath: string;
    schema: GraphQLSchema;
    models: string[];
    ignore: Ignore;
    depthLimit: number;
    routes?: Record<string, RouteConfig>;
    execute: typeof execute;
    subscribe: typeof subscribe;
    onRoute?: OnRoute;
    errorHandler?: ErrorHandler;
    contextFactory: ContextFn;
}
export declare function createSofa(config: SofaConfig): Sofa;
export declare function isContextFn(context: any): context is ContextFn;
export {};
