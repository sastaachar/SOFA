import { DocumentNode } from 'graphql';
export declare type ContextValue = Record<string, any>;
export declare type Ignore = string[];
export declare type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export interface RouteInfo {
    document: DocumentNode;
    path: string;
    method: Method;
    tags?: string[];
    description?: string;
}
export declare type OnRoute = (info: RouteInfo) => void;
export declare type ContextFn = (init: {
    req: any;
    res: any;
}) => Promise<ContextValue> | ContextValue;
