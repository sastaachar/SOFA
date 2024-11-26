import { DocumentNode, GraphQLSchema } from 'graphql';
import { OpenAPIV3 } from 'openapi-types';
export declare function buildPathFromOperation({ url, schema, operation, useRequestBody, tags, description, customScalars, }: {
    url: string;
    schema: GraphQLSchema;
    operation: DocumentNode;
    useRequestBody: boolean;
    tags?: string[];
    description?: string;
    customScalars: Record<string, any>;
}): OpenAPIV3.OperationObject;
