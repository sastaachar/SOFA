'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

const tslib = require('tslib');
const graphql = require('graphql');
const ittyRouter = require('itty-router');
const utils = require('@graphql-tools/utils');
const paramCase = require('param-case');
const fetch = require('@whatwg-node/fetch');
const colors = _interopDefault(require('ansi-colors'));
const server = require('@whatwg-node/server');
const titleCase = require('title-case');

function getOperationInfo(doc) {
    const op = graphql.getOperationAST(doc, null);
    if (!op) {
        return;
    }
    return {
        operation: op,
        name: op.name.value,
        variables: op.variableDefinitions || [],
    };
}

function convertName(name) {
    return paramCase.paramCase(name);
}
function isNil(val) {
    return val == null;
}

function parseVariable({ value, variable, schema, }) {
    if (isNil(value)) {
        return;
    }
    return resolveVariable({
        value,
        type: variable.type,
        schema,
    });
}
function resolveVariable({ value, type, schema, }) {
    if (type.kind === graphql.Kind.NAMED_TYPE) {
        const namedType = schema.getType(type.name.value);
        if (graphql.isScalarType(namedType)) {
            // GraphQLBoolean.serialize expects a boolean or a number only
            if (graphql.isEqualType(graphql.GraphQLBoolean, namedType)) {
                // we don't support TRUE
                value = (value === 'true' || value === true);
            }
            return namedType.serialize(value);
        }
        if (graphql.isInputObjectType(namedType)) {
            return value && typeof value === 'object' ? value : JSON.parse(value);
        }
        return value;
    }
    if (type.kind === graphql.Kind.LIST_TYPE) {
        return (Array.isArray(value) ? value : [value]).map((val) => resolveVariable({
            value: val,
            type: type.type,
            schema,
        }));
    }
    if (type.kind === graphql.Kind.NON_NULL_TYPE) {
        return resolveVariable({
            value: value,
            type: type.type,
            schema,
        });
    }
}

var _a;
const levels = ['error', 'warn', 'info', 'debug'];
const toLevel = (string) => levels.includes(string) ? string : null;
const currentLevel = process.env.SOFA_DEBUG
    ? 'debug'
    : (_a = toLevel(process.env.SOFA_LOGGER_LEVEL)) !== null && _a !== void 0 ? _a : 'info';
const log = (level, color, args) => {
    if (levels.indexOf(level) <= levels.indexOf(currentLevel)) {
        console.log(`${color(level)}:`, ...args);
    }
};
const logger = {
    error: (...args) => {
        log('error', colors.red, args);
    },
    warn: (...args) => {
        log('warn', colors.yellow, args);
    },
    info: (...args) => {
        log('info', colors.green, args);
    },
    debug: (...args) => {
        log('debug', colors.blue, args);
    },
};

function isAsyncIterable(obj) {
    return typeof obj[Symbol.asyncIterator] === 'function';
}
class SubscriptionManager {
    constructor(sofa) {
        this.sofa = sofa;
        this.operations = new Map();
        this.clients = new Map();
        this.buildOperations();
    }
    start(event, contextValue) {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            const id = fetch.crypto.randomUUID();
            const name = event.subscription;
            if (!this.operations.has(name)) {
                throw new Error(`Subscription '${name}' is not available`);
            }
            logger.info(`[Subscription] Start ${id}`, event);
            const result = yield this.execute({
                id,
                name,
                url: event.url,
                variables: event.variables,
                contextValue,
            });
            if (typeof result !== 'undefined') {
                return result;
            }
            return { id };
        });
    }
    stop(id) {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            logger.info(`[Subscription] Stop ${id}`);
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const execution = this.clients.get(id);
            if (execution.iterator.return) {
                execution.iterator.return();
            }
            this.clients.delete(id);
            return { id };
        });
    }
    update(event, contextValue) {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            const { variables, id } = event;
            logger.info(`[Subscription] Update ${id}`, event);
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const { name: subscription, url } = this.clients.get(id);
            this.stop(id);
            return this.start({
                url,
                subscription,
                variables,
            }, contextValue);
        });
    }
    execute({ id, name, url, variables, contextValue, }) {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            const { document, operationName, variables: variableNodes } = this.operations.get(name);
            const variableValues = variableNodes.reduce((values, variable) => {
                const value = parseVariable({
                    value: variables[variable.variable.name.value],
                    variable,
                    schema: this.sofa.schema,
                });
                if (typeof value === 'undefined') {
                    return values;
                }
                return Object.assign(Object.assign({}, values), { [variable.variable.name.value]: value });
            }, {});
            const execution = yield this.sofa.subscribe({
                schema: this.sofa.schema,
                document,
                operationName,
                variableValues,
                contextValue,
            });
            if (isAsyncIterable(execution)) {
                // successful
                // add execution to clients
                this.clients.set(id, {
                    name,
                    url,
                    iterator: execution,
                });
                // success
                (() => tslib.__awaiter(this, void 0, void 0, function* () {
                    var e_1, _a;
                    try {
                        for (var execution_1 = tslib.__asyncValues(execution), execution_1_1; execution_1_1 = yield execution_1.next(), !execution_1_1.done;) {
                            const result = execution_1_1.value;
                            yield this.sendData({
                                id,
                                result,
                            });
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (execution_1_1 && !execution_1_1.done && (_a = execution_1.return)) yield _a.call(execution_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }))().then(() => {
                    // completes
                    this.clients.delete(id);
                }, (e) => {
                    logger.info(`Subscription #${id} closed`);
                    logger.error(e);
                    this.clients.delete(id);
                });
            }
            else {
                return execution;
            }
        });
    }
    sendData({ id, result }) {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const { url } = this.clients.get(id);
            logger.info(`[Subscription] Trigger ${id}`);
            const response = yield fetch.fetch(url, {
                method: 'POST',
                body: JSON.stringify(result),
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            yield response.text();
        });
    }
    buildOperations() {
        const subscription = this.sofa.schema.getSubscriptionType();
        if (!subscription) {
            return;
        }
        const fieldMap = subscription.getFields();
        for (const field in fieldMap) {
            const operationNode = utils.buildOperationNodeForField({
                kind: 'subscription',
                field,
                schema: this.sofa.schema,
                models: this.sofa.models,
                ignore: this.sofa.ignore,
                circularReferenceDepth: this.sofa.depthLimit,
            });
            const document = {
                kind: graphql.Kind.DOCUMENT,
                definitions: [operationNode],
            };
            const { variables, name: operationName } = getOperationInfo(document);
            this.operations.set(field, {
                operationName,
                document,
                variables,
            });
        }
    }
}

function createRouter(sofa) {
    logger.debug('[Sofa] Creating router');
    const router = ittyRouter.Router({
        base: sofa.basePath,
    });
    const queryType = sofa.schema.getQueryType();
    const mutationType = sofa.schema.getMutationType();
    const subscriptionManager = new SubscriptionManager(sofa);
    if (queryType) {
        Object.keys(queryType.getFields()).forEach((fieldName) => {
            const route = createQueryRoute({ sofa, router, fieldName });
            if (sofa.onRoute) {
                sofa.onRoute(route);
            }
        });
    }
    if (mutationType) {
        Object.keys(mutationType.getFields()).forEach((fieldName) => {
            const route = createMutationRoute({ sofa, router, fieldName });
            if (sofa.onRoute) {
                sofa.onRoute(route);
            }
        });
    }
    router.post('/webhook', (request, serverContext) => tslib.__awaiter(this, void 0, void 0, function* () {
        const { subscription, variables, url } = yield request.json();
        try {
            const contextValue = yield sofa.contextFactory(serverContext);
            const result = yield subscriptionManager.start({
                subscription,
                variables,
                url,
            }, contextValue);
            return new fetch.Response(JSON.stringify(result), {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (error) {
            return new fetch.Response(JSON.stringify(error), {
                status: 500,
                statusText: 'Subscription failed',
            });
        }
    }));
    router.post('/webhook/:id', (request, serverContext) => tslib.__awaiter(this, void 0, void 0, function* () {
        var _a;
        const id = (_a = request.params) === null || _a === void 0 ? void 0 : _a.id;
        const body = yield request.json();
        const variables = body.variables;
        try {
            const contextValue = yield sofa.contextFactory(serverContext);
            const result = yield subscriptionManager.update({
                id,
                variables,
            }, contextValue);
            return new fetch.Response(JSON.stringify(result), {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (error) {
            return new fetch.Response(JSON.stringify(error), {
                status: 500,
                statusText: 'Subscription failed to update',
            });
        }
    }));
    router.delete('/webhook/:id', (request) => tslib.__awaiter(this, void 0, void 0, function* () {
        var _b;
        const id = (_b = request.params) === null || _b === void 0 ? void 0 : _b.id;
        try {
            const result = yield subscriptionManager.stop(id);
            return new fetch.Response(JSON.stringify(result), {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (error) {
            return new fetch.Response(JSON.stringify(error), {
                status: 500,
                statusText: 'Subscription failed to stop',
            });
        }
    }));
    return router;
}
function createQueryRoute({ sofa, router, fieldName, }) {
    var _a, _b, _c, _d, _e, _f;
    logger.debug(`[Router] Creating ${fieldName} query`);
    const queryType = sofa.schema.getQueryType();
    const operationNode = utils.buildOperationNodeForField({
        kind: 'query',
        schema: sofa.schema,
        field: fieldName,
        models: sofa.models,
        ignore: sofa.ignore,
        circularReferenceDepth: sofa.depthLimit,
    });
    const operation = {
        kind: graphql.Kind.DOCUMENT,
        definitions: [operationNode],
    };
    const info = getOperationInfo(operation);
    const field = queryType.getFields()[fieldName];
    const fieldType = field.type;
    const isSingle = graphql.isObjectType(fieldType) ||
        (graphql.isNonNullType(fieldType) && graphql.isObjectType(fieldType.ofType));
    const hasIdArgument = field.args.some((arg) => arg.name === 'id');
    const graphqlPath = `${queryType.name}.${fieldName}`;
    const routeConfig = (_a = sofa.routes) === null || _a === void 0 ? void 0 : _a[graphqlPath];
    const route = {
        method: (_b = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.method) !== null && _b !== void 0 ? _b : 'GET',
        path: (_c = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.path) !== null && _c !== void 0 ? _c : getPath(fieldName, isSingle && hasIdArgument),
        responseStatus: (_d = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.responseStatus) !== null && _d !== void 0 ? _d : 200,
    };
    router[route.method](route.path, useHandler({ info, route, fieldName, sofa, operation }));
    logger.debug(`[Router] ${fieldName} query available at ${route.method} ${route.path}`);
    return {
        document: operation,
        path: route.path,
        method: route.method.toUpperCase(),
        tags: (_e = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.tags) !== null && _e !== void 0 ? _e : [],
        description: (_f = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.description) !== null && _f !== void 0 ? _f : '',
    };
}
function createMutationRoute({ sofa, router, fieldName, }) {
    var _a, _b, _c, _d;
    logger.debug(`[Router] Creating ${fieldName} mutation`);
    const mutationType = sofa.schema.getMutationType();
    const operationNode = utils.buildOperationNodeForField({
        kind: 'mutation',
        schema: sofa.schema,
        field: fieldName,
        models: sofa.models,
        ignore: sofa.ignore,
        circularReferenceDepth: sofa.depthLimit,
    });
    const operation = {
        kind: graphql.Kind.DOCUMENT,
        definitions: [operationNode],
    };
    const info = getOperationInfo(operation);
    const graphqlPath = `${mutationType.name}.${fieldName}`;
    const routeConfig = (_a = sofa.routes) === null || _a === void 0 ? void 0 : _a[graphqlPath];
    const route = {
        method: (_b = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.method) !== null && _b !== void 0 ? _b : 'POST',
        path: (_c = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.path) !== null && _c !== void 0 ? _c : getPath(fieldName),
        responseStatus: (_d = routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.responseStatus) !== null && _d !== void 0 ? _d : 200,
    };
    const { method, path } = route;
    router[method](path, useHandler({ info, route, fieldName, sofa, operation }));
    logger.debug(`[Router] ${fieldName} mutation available at ${method} ${path}`);
    return {
        document: operation,
        path,
        method,
        tags: (routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.tags) || [],
        description: (routeConfig === null || routeConfig === void 0 ? void 0 : routeConfig.description) || '',
    };
}
function useHandler(config) {
    const { sofa, operation, fieldName } = config;
    const info = config.info;
    return (request, serverContext) => tslib.__awaiter(this, void 0, void 0, function* () {
        var _a;
        let body = {};
        if (request.body != null) {
            const strBody = yield request.text();
            if (strBody) {
                body = JSON.parse(strBody);
            }
        }
        const variableValues = info.variables.reduce((variables, variable) => {
            const name = variable.variable.name.value;
            const value = parseVariable({
                value: pickParam({
                    url: request.url,
                    body,
                    params: request.params || {},
                    name,
                }),
                variable,
                schema: sofa.schema,
            });
            if (typeof value === 'undefined') {
                return variables;
            }
            return Object.assign(Object.assign({}, variables), { [name]: value });
        }, {});
        const contextValue = yield sofa.contextFactory(serverContext);
        const result = yield sofa.execute({
            schema: sofa.schema,
            document: operation,
            contextValue,
            variableValues,
            operationName: info.operation.name && info.operation.name.value,
        });
        if (result.errors) {
            const defaultErrorHandler = (errors) => {
                return new fetch.Response(errors[0], {
                    status: 500,
                });
            };
            const errorHandler = sofa.errorHandler || defaultErrorHandler;
            return errorHandler(result.errors);
        }
        return new fetch.Response(JSON.stringify((_a = result.data) === null || _a === void 0 ? void 0 : _a[fieldName]), {
            status: config.route.responseStatus,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    });
}
function getPath(fieldName, hasId = false) {
    return `/${convertName(fieldName)}${hasId ? '/:id' : ''}`;
}
function pickParam({ name, url, params, body, }) {
    if (name in params) {
        return params[name];
    }
    const searchParams = new URLSearchParams(url.split('?')[1]);
    if (searchParams.has(name)) {
        const values = searchParams.getAll(name);
        return values.length === 1 ? values[0] : values;
    }
    if (body && body.hasOwnProperty(name)) {
        return body[name];
    }
}

function createSofa(config) {
    logger.debug('[Sofa] Created');
    const models = extractsModels(config.schema);
    const ignore = config.ignore || [];
    const depthLimit = config.depthLimit || 1;
    logger.debug(`[Sofa] models: ${models.join(', ')}`);
    logger.debug(`[Sofa] ignore: ${ignore.join(', ')}`);
    return Object.assign({ execute: graphql.execute,
        subscribe: graphql.subscribe,
        models,
        ignore,
        depthLimit,
        contextFactory(serverContext) {
            if (config.context != null) {
                if (isContextFn(config.context)) {
                    return config.context(serverContext);
                }
                else {
                    return config.context;
                }
            }
            return serverContext;
        } }, config);
}
function isContextFn(context) {
    return typeof context === 'function';
}
// Objects and Unions are the only things that are used to define return types
// and both might contain an ID
// We don't treat Unions as models because
// they might represent an Object that is not a model
// We check it later, when an operation is being built
function extractsModels(schema) {
    const modelMap = {};
    const query = schema.getQueryType();
    const fields = query.getFields();
    // if Query[type] (no args) and Query[type](just id as an argument)
    // loop through every field
    for (const fieldName in fields) {
        const field = fields[fieldName];
        const namedType = graphql.getNamedType(field.type);
        if (hasID(namedType)) {
            if (!modelMap[namedType.name]) {
                modelMap[namedType.name] = {};
            }
            if (isArrayOf(field.type, namedType)) {
                // check if type is a list
                // check if name of a field matches a name of a named type (in plural)
                // check if has no non-optional arguments
                // add to registry with `list: true`
                const sameName = isNameEqual(field.name, namedType.name + 's');
                const allOptionalArguments = !field.args.some((arg) => graphql.isNonNullType(arg.type));
                modelMap[namedType.name].list = sameName && allOptionalArguments;
            }
            else if (graphql.isObjectType(field.type) ||
                (graphql.isNonNullType(field.type) && graphql.isObjectType(field.type.ofType))) {
                // check if type is a graphql object type
                // check if name of a field matches with name of an object type
                // check if has only one argument named `id`
                // add to registry with `single: true`
                const sameName = isNameEqual(field.name, namedType.name);
                const hasIdArgument = field.args.length === 1 && field.args[0].name === 'id';
                modelMap[namedType.name].single = sameName && hasIdArgument;
            }
        }
    }
    return Object.keys(modelMap).filter((name) => modelMap[name].list && modelMap[name].single);
}
// it's dumb but let's leave it for now
function isArrayOf(type, expected) {
    const typeNameInSdl = type.toString();
    return (typeNameInSdl.includes('[') && typeNameInSdl.includes(expected.toString()));
}
function hasID(type) {
    return graphql.isObjectType(type) && !!type.getFields().id;
}
function isNameEqual(a, b) {
    return convertName(a) === convertName(b);
}

function mapToPrimitive(type) {
    const formatMap = {
        Int: {
            type: 'integer',
            format: 'int32',
        },
        Float: {
            type: 'number',
            format: 'float',
        },
        String: {
            type: 'string',
        },
        Boolean: {
            type: 'boolean',
        },
        ID: {
            type: 'string',
        },
    };
    if (formatMap[type]) {
        return formatMap[type];
    }
}
function mapToRef(type) {
    return `#/components/schemas/${type}`;
}

function buildSchemaObjectFromType(type, opts) {
    const required = [];
    const properties = {};
    const fields = type.getFields();
    for (const fieldName in fields) {
        const field = fields[fieldName];
        if (graphql.isNonNullType(field.type)) {
            required.push(field.name);
        }
        properties[fieldName] = resolveField(field, opts);
        if (field.description) {
            properties[fieldName].description = field.description;
        }
    }
    return Object.assign(Object.assign(Object.assign({ type: 'object' }, (required.length ? { required } : {})), { properties }), (type.description ? { description: type.description } : {}));
}
function resolveField(field, opts) {
    return resolveFieldType(field.type, opts);
}
// array -> [type]
// type -> $ref
// scalar -> swagger primitive
function resolveFieldType(type, opts) {
    if (graphql.isNonNullType(type)) {
        return resolveFieldType(type.ofType, opts);
    }
    if (graphql.isListType(type)) {
        return {
            type: 'array',
            items: resolveFieldType(type.ofType, opts),
        };
    }
    if (graphql.isObjectType(type)) {
        return {
            $ref: mapToRef(type.name),
        };
    }
    if (graphql.isScalarType(type)) {
        return (mapToPrimitive(type.name) ||
            opts.customScalars[type.name] || {
            type: 'object',
        });
    }
    if (graphql.isEnumType(type)) {
        return {
            type: 'string',
            enum: type.getValues().map((value) => value.name),
        };
    }
    return {
        type: 'object',
    };
}

function buildPathFromOperation({ url, schema, operation, useRequestBody, tags, description, customScalars, }) {
    const info = getOperationInfo(operation);
    const summary = resolveSummary(schema, info.operation);
    return Object.assign(Object.assign({ tags,
        description,
        summary, operationId: info.name }, (useRequestBody
        ? {
            requestBody: {
                content: {
                    'application/json': {
                        schema: resolveRequestBody(info.operation.variableDefinitions),
                    },
                },
            },
        }
        : {
            parameters: resolveParameters(url, info.operation.variableDefinitions),
        })), { responses: {
            200: {
                description: summary,
                content: {
                    'application/json': {
                        schema: resolveResponse({
                            schema,
                            operation: info.operation,
                            customScalars,
                        }),
                    },
                },
            },
        } });
}
function resolveParameters(url, variables) {
    if (!variables) {
        return [];
    }
    return variables.map((variable) => {
        return {
            in: isInPath(url, variable.variable.name.value) ? 'path' : 'query',
            name: variable.variable.name.value,
            required: variable.type.kind === graphql.Kind.NON_NULL_TYPE,
            schema: resolveParamSchema(variable.type),
        };
    });
}
function resolveRequestBody(variables) {
    if (!variables) {
        return {};
    }
    const properties = {};
    const required = [];
    variables.forEach((variable) => {
        if (variable.type.kind === graphql.Kind.NON_NULL_TYPE) {
            required.push(variable.variable.name.value);
        }
        properties[variable.variable.name.value] = resolveParamSchema(variable.type);
    });
    return Object.assign({ type: 'object', properties }, (required.length ? { required } : {}));
}
// array -> [type]
// type -> $ref
// scalar -> swagger primitive
function resolveParamSchema(type) {
    if (type.kind === graphql.Kind.NON_NULL_TYPE) {
        return resolveParamSchema(type.type);
    }
    if (type.kind === graphql.Kind.LIST_TYPE) {
        return {
            type: 'array',
            items: resolveParamSchema(type.type),
        };
    }
    const primitive = mapToPrimitive(type.name.value);
    return (primitive || {
        $ref: mapToRef(type.name.value),
    });
}
function resolveResponse({ schema, operation, customScalars, }) {
    const operationType = operation.operation;
    const rootField = operation.selectionSet.selections[0];
    if (rootField.kind === graphql.Kind.FIELD) {
        if (operationType === 'query') {
            const queryType = schema.getQueryType();
            const field = queryType.getFields()[rootField.name.value];
            return resolveFieldType(field.type, { customScalars });
        }
        if (operationType === 'mutation') {
            const mutationType = schema.getMutationType();
            const field = mutationType.getFields()[rootField.name.value];
            return resolveFieldType(field.type, { customScalars });
        }
    }
}
function isInPath(url, param) {
    return url.indexOf(`{${param}}`) !== -1;
}
function resolveSummary(schema, operation) {
    const selection = operation.selectionSet.selections[0];
    const fieldName = selection.name.value;
    const typeDefinition = schema.getType(titleCase.titleCase(operation.operation));
    if (!typeDefinition) {
        return '';
    }
    const definitionNode = typeDefinition.astNode || graphql.parse(graphql.printType(typeDefinition)).definitions[0];
    if (!isObjectTypeDefinitionNode(definitionNode)) {
        return '';
    }
    const fieldNode = definitionNode.fields.find((field) => field.name.value === fieldName);
    const descriptionDefinition = fieldNode && fieldNode.description;
    return descriptionDefinition && descriptionDefinition.value
        ? descriptionDefinition.value
        : '';
}
function isObjectTypeDefinitionNode(node) {
    return node.kind === graphql.Kind.OBJECT_TYPE_DEFINITION;
}

function OpenAPI({ schema, info, servers, components, security, tags, customScalars = {}, }) {
    const types = schema.getTypeMap();
    const swagger = {
        openapi: '3.0.0',
        info,
        servers,
        tags: [],
        paths: {},
        components: {
            schemas: {},
        },
    };
    for (const typeName in types) {
        const type = types[typeName];
        if ((graphql.isObjectType(type) || graphql.isInputObjectType(type)) &&
            !graphql.isIntrospectionType(type)) {
            swagger.components.schemas[typeName] = buildSchemaObjectFromType(type, {
                customScalars,
            });
        }
    }
    if (components) {
        swagger.components = Object.assign(Object.assign({}, components), swagger.components);
    }
    if (security) {
        swagger.security = security;
    }
    if (tags) {
        swagger.tags = tags;
    }
    return {
        addRoute(info, config) {
            const basePath = (config === null || config === void 0 ? void 0 : config.basePath) || '';
            const path = basePath +
                info.path.replace(/\:[a-z0-9]+\w/i, (param) => `{${param.replace(':', '')}}`);
            if (!swagger.paths[path]) {
                swagger.paths[path] = {};
            }
            const pathsObj = swagger.paths[path];
            pathsObj[info.method.toLowerCase()] = buildPathFromOperation({
                url: path,
                operation: info.document,
                schema,
                useRequestBody: ['POST', 'PUT', 'PATCH'].includes(info.method),
                tags: info.tags || [],
                description: info.description || '',
                customScalars,
            });
        },
        get() {
            return swagger;
        },
    };
}

function useSofa(config) {
    return server.createServerAdapter(createRouter(createSofa(config)));
}

exports.OpenAPI = OpenAPI;
exports.useSofa = useSofa;
