import { OpenAPIV3, OpenAPIV2 } from "openapi-types";

export const SCHEMA_PATH = Symbol();
export const STRATEGY = Symbol();

// These interfaces abstract away the differences between OpenAPI V2 and V3
export interface IParameter {
  get name(): string;
  get description(): string | undefined;
  determineMembraneType: () => Typed;
}

// These interfaces abstract away the differences between OpenAPI V2 and V3
export interface ISchema {
  get type(): string | undefined;
  get items(): ISchema | undefined;
  get enum(): any[] | undefined;
  get oneOf(): ISchema[] | undefined;
  get allOf(): ISchema[] | undefined;
  get anyOf(): ISchema[] | undefined;

  getCombinedProperties(): Generator<{
    name: string;
    schema: ISchema;
  }>;
}

export type OperationBase = {
  method: string;
  path: string;
  description: string;
  responseTypeName?: string;
  // TODO: make these two fields version agnostic
  responseSchema?: ISchema;
  parameters: IParameter[];
};

export type ListInstancesOperation = { kind: "listInstances" } & OperationBase;

export type FetchInstanceOperation = { kind: "fetchInstance" } & OperationBase;

export type FetchInstanceFieldOperation = {
  kind: "fetchInstanceField";
} & OperationBase;

export type FetchFieldOperation = {
  kind: "fetchField";
} & OperationBase;

export type CreateInstanceOperation = {
  kind: "createInstance";
  idempotent: boolean;
} & OperationBase;

export type InstanceActionOperation = {
  kind: "instanceAction";
  idempotent: boolean;
} & OperationBase;

export type GeneralActionOperation = {
  kind: "generalAction";
  idempotent: boolean;
} & OperationBase;

export type PatchInstanceOperation = { kind: "patchInstance" } & OperationBase;

export type DeleteInstanceOperation = {
  kind: "deleteInstance";
} & OperationBase;

export type Operation =
  | ListInstancesOperation
  | FetchInstanceOperation
  | FetchInstanceFieldOperation
  | CreateInstanceOperation
  | PatchInstanceOperation
  | InstanceActionOperation
  | GeneralActionOperation
  | DeleteInstanceOperation
  | FetchFieldOperation;

export interface TypeDef {
  operations: Operation[];
  name: string;
}

export type AuthScheme = "unknown" | "bearer" | "basic" | "oauth2";

export interface ProgramDefinition {
  types: Record<string, TypeDef>;
  operations: Operation[];
  baseUrl: string;
  authScheme: AuthScheme;
}

export type EmptyObjectStrategy = {
  kind: "emptyObject";
};

export type GetSelfGrefStrategy = {
  kind: "getSelfGref";
};

export type OperationStrategy = {
  kind: "operation";
  operation: Operation;
};

export type ConfigureBearerTokenStrategy = {
  kind: "configureBearerToken";
};

export type CoerceToStringStrategy = {
  kind: "coerceToString";
};

export type CoerceItemsToStringStrategy = {
  kind: "coerceItemsToString";
};

// Field resolver strategy
export type Strategy =
  | EmptyObjectStrategy
  | OperationStrategy
  | CoerceToStringStrategy
  | CoerceItemsToStringStrategy
  | GetSelfGrefStrategy
  | ConfigureBearerTokenStrategy;

export type OfType = string | Typed;
export interface Typed {
  type: string;
  ofType?: OfType;
}

export interface DepType extends Typed {
  gref_hash: string;
}

export interface Import {
  name: string;
  schema: ImportedSchema;
  source: {
    program: string;
  };
}

export interface ImportedSchema extends Schema {
  imports?: Import[];
}

export interface Schema {
  types: MType[];
}

export interface Param extends Typed {
  name: string;
}

export interface Member extends Typed {
  name: string;
  params?: Param[];
  [STRATEGY]?: Strategy;
}

export type Action = Member;
export type MEvent = Member;
export type Field = Member & { hints?: Record<string, any> };

export interface MType {
  name: string;
  fields: Field[];
  actions: Action[];
  events: MEvent[];
}

export interface Memconfig {
  dependencies: { [key: string]: string };
  schema: Schema;
}

// Customizable function to handle specifics of APIs
export interface Specifics {
  // Sometimes the response comes back in a nested property like `{ "user": { ... } }` so here we can return the schema
  // of the user property for such a path
  determineResponseSchema: (operation: Operation) => any;
  // From a path like "/v13/deployments/{idOrUrl}". Determines the corresponding Membrane type to which this operation is
  // most relevant. e.g. Deployment
  determineTypeNameFromPath: (path: string) => string | undefined;

  shouldIgnorePath: (path: string) => boolean;
}

export function jsonSchemaToMembraneType(
  schema: ISchema | undefined
): Typed & { [STRATEGY]?: Strategy } {
  if (!schema) {
    return { type: "Void" };
  } else if (schema.type === "string") {
    return { type: "String" };
  } else if (schema.type === "number") {
    return { type: "Int" };
  } else if (schema.type === "integer") {
    return { type: "Int" };
  } else if (schema.type === "boolean") {
    return { type: "Boolean" };
  } else if (schema.type === "array") {
    const { [STRATEGY]: strategy, ...itemType } = jsonSchemaToMembraneType(
      schema.items
    );
    if (strategy?.kind === "coerceToString") {
      return {
        type: "List",
        ofType: jsonSchemaToMembraneType(schema.items),
        [STRATEGY]: { kind: "coerceItemsToString" },
      };
    } else {
      return { type: "List", ofType: jsonSchemaToMembraneType(schema.items) };
    }
  } else if (schema.type === "object") {
    console.warn("TODO: object types. Using String for now");
    return { type: "String", [STRATEGY]: { kind: "coerceToString" } };
  } else if (schema.enum) {
    console.warn("TODO: enum. Using String for now");
    return { type: "String" };
  }
  // TODO: Polymorphism. For now just use the first sub schema that's not an array
  const sub = schema.oneOf || schema.allOf || schema.anyOf;
  if (sub) {
    const subSchema = sub.find((s) => !("$ref" in s) && s.type !== "array");
    if (subSchema && !("$ref" in subSchema)) {
      return jsonSchemaToMembraneType(subSchema);
    }
  }
  return { type: "String", [STRATEGY]: { kind: "coerceToString" } };
}
