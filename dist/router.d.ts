import { Request as IttyRequest, Router } from 'itty-router';
import type { Sofa } from './sofa';
export declare type ErrorHandler = (errors: ReadonlyArray<any>) => Response;
declare type SofaRequest = IttyRequest & Request;
export declare function createRouter(sofa: Sofa): Router<SofaRequest, {}>;
export {};
