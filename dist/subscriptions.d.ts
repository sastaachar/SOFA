import { ExecutionResult } from 'graphql';
import type { ContextValue } from './types';
import type { Sofa } from './sofa';
export declare type ID = string;
export declare type SubscriptionFieldName = string;
export interface StartSubscriptionEvent {
    subscription: SubscriptionFieldName;
    variables: any;
    url: string;
}
export interface UpdateSubscriptionEvent {
    id: ID;
    variables: any;
}
export interface StopSubscriptionResponse {
    id: ID;
}
export declare class SubscriptionManager {
    private sofa;
    private operations;
    private clients;
    constructor(sofa: Sofa);
    start(event: StartSubscriptionEvent, contextValue: ContextValue): Promise<ExecutionResult<import("graphql/jsutils/ObjMap").ObjMap<unknown>, import("graphql/jsutils/ObjMap").ObjMap<unknown>> | {
        id: string;
    }>;
    stop(id: ID): Promise<StopSubscriptionResponse>;
    update(event: UpdateSubscriptionEvent, contextValue: ContextValue): Promise<ExecutionResult<import("graphql/jsutils/ObjMap").ObjMap<unknown>, import("graphql/jsutils/ObjMap").ObjMap<unknown>> | {
        id: string;
    }>;
    private execute;
    private sendData;
    private buildOperations;
}
