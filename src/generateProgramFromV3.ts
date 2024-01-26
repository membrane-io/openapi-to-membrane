import { capitalize, singularize } from "inflection";
import { OpenAPIV3 } from "openapi-types";
import {
  AuthScheme,
  IParameter,
  ISchema,
  jsonSchemaToMembraneType,
  Operation,
  ProgramDefinition,
  SCHEMA_PATH,
  Specifics,
  Typed,
  TypeDef,
} from "./common";

export function noref<T extends object>(o: T | OpenAPIV3.ReferenceObject): T {
  if ("$ref" in o) {
    throw new Error("Unexpected reference");
  }
  return o as T;
}
// Customizable function to handle specifics of APIs
const defaultV3Specifics = {
  // Sometimes the response comes back in a nested property like `{ "user": { ... } }` so here we can return the schema
  // of the user property for such a path
  determineResponseSchema: (operation: Operation): any => {
    return operation.responseSchema;
  },

  // From a path like "/v13/deployments/{idOrUrl}". Determines the corresponding Membrane type to which this operation is
  // most relevant. e.g. Deployment
  determineTypeNameFromPath: (path: string): string | undefined => {
    const parts = path.split("/");
    const maybeType = parts[2];
    if (maybeType) {
      return capitalize(singularize(parts[2]));
    }
    return;
  },

  shouldIgnorePath: (path: string): boolean => {
    return false;
  },
};

function getParamName(pathPart?: string) {
  if (pathPart === undefined) {
    return;
  }
  const matches = pathPart.match(/{(.*)}/);
  return matches?.[1];
}

function determineResponseSchema(
  endpoint: OpenAPIV3.OperationObject
): OpenAPIV3.SchemaObject | undefined {
  const response =
    endpoint.responses?.["200"] ||
    endpoint.responses?.["201"] ||
    endpoint.responses?.["202"];
  if (!response) {
    console.warn("No 200/201/202 response for", endpoint.operationId);
    return;
  }
  if ("$ref" in response) {
    console.warn("Not implemented $ref in responses", response.$ref);
    return;
  }
  const mediaTypeResponse = response?.content?.["application/json"]!;
  if (!mediaTypeResponse) {
    return;
  }
  const { schema, example, examples } = mediaTypeResponse;
  // TODO: do something with the examples? Generate tests?
  return schema as OpenAPIV3.SchemaObject;
}

class V3Parameter implements IParameter {
  inner: OpenAPIV3.ParameterObject;

  constructor(inner: OpenAPIV3.ParameterObject) {
    this.inner = inner;
  }
  get name(): string {
    return this.inner.name;
  }
  get description(): string | undefined {
    return this.inner.description;
  }

  determineMembraneType(): Typed {
    const { schema } = this.inner;
    if (!schema) {
      console.warn("Param has no schema", this.inner.name);
      return { type: "String" };
    }

    if ("$ref" in schema) {
      console.warn("TODO: handle $ref in determinParamType:", this.inner.name);
      return { type: "String" };
    }
    return jsonSchemaToMembraneType(new V3Schema(schema));
  }
}

class V3Schema implements ISchema {
  inner: OpenAPIV3.SchemaObject;

  constructor(inner: OpenAPIV3.SchemaObject) {
    this.inner = inner;
  }
  get type(): string | undefined {
    return this.inner.type;
  }
  get items(): ISchema | undefined {
    if ("items" in this.inner && this.inner.items) {
      return new V3Schema(noref(this.inner.items));
    }
    return;
  }
  get enum(): any[] | undefined {
    return this.inner.enum;
  }
  get oneOf(): ISchema[] | undefined {
    if ("oneOf" in this.inner && this.inner.oneOf) {
      return this.inner.oneOf.map((i) => new V3Schema(noref(i)));
    }
    return;
  }
  get allOf(): ISchema[] | undefined {
    if ("allOf" in this.inner && this.inner.allOf) {
      return this.inner.allOf.map((i) => new V3Schema(noref(i)));
    }
    return;
  }
  get anyOf(): ISchema[] | undefined {
    if ("anyOf" in this.inner && this.inner.anyOf) {
      return this.inner.anyOf.map((i) => new V3Schema(noref(i)));
    }
    return;
  }

  *getCombinedProperties(): Generator<{
    name: string;
    schema: ISchema;
  }> {
    const schema = this.inner;
    if ("properties" in schema) {
      for (const [name, v3Schema] of Object.entries(schema.properties!)) {
        yield { name, schema: new V3Schema(noref(v3Schema)) };
      }
    } else if ("anyOf" in schema) {
      for (const variant of schema.anyOf!) {
        yield* new V3Schema(noref(variant)).getCombinedProperties();
      }
    } else if ("allOf" in schema) {
      for (const variant of schema.allOf!) {
        yield* new V3Schema(noref(variant)).getCombinedProperties();
      }
    } else if ("oneOf" in schema) {
      for (const variant of schema.oneOf!) {
        yield* new V3Schema(noref(variant)).getCombinedProperties();
      }
    }
  }
}

function determineOperation(
  method: string,
  path: string,
  endpoint: OpenAPIV3.OperationObject
): Operation | undefined {
  const parts = path.split("/");
  if (parts.length < 2) {
    return undefined;
  }
  parts.shift();

  // TODO: errorResponses
  const responseSchema = determineResponseSchema(endpoint);
  if (!responseSchema) {
    return;
  }
  const responseTypeName = "TODO";

  const parameters = (endpoint.parameters || []).map((p) => {
    return new V3Parameter(noref(p));
  });

  const common = {
    method,
    path,
    description: endpoint.description || "",
    responseTypeName,
    responseSchema: new V3Schema(responseSchema),
    parameters,
  };
  if ((endpoint as any)["x-membrane-operation"]) {
    return {
      ...common,
      ...(endpoint as any)["x-membrane-operation"],
    };
  }

  if (method === "get") {
    if (parts.length === 2) {
      return {
        kind: "listInstances",
        ...common,
      };
    }
    const idParam = getParamName(parts[2]);
    if (idParam) {
      // This endpoint refers to a specific instance of a resource
      if (parts.length === 3) {
        // Fetches one resource
        return {
          kind: "fetchInstance",
          ...common,
        };
      } else if (parts.length === 4) {
        // Fetches a field of a resource
        return {
          kind: "fetchInstanceField",
          ...common,
        };
      }
    } else {
      if (parts.length === 3) {
        // Fetches a field of a resource
        return {
          kind: "fetchField",
          ...common,
        };
      }
    }
  } else if (method === "patch") {
    const idParam = getParamName(parts[2]);
    if (parts.length === 3) {
      return {
        kind: "patchInstance",
        ...common,
      };
    }
  } else if (method === "post" || method === "put") {
    const idParam = getParamName(parts[2]);
    if (idParam && parts.length === 4) {
      return {
        kind: "instanceAction",
        ...common,
        idempotent: method === "put",
      };
    } else if (parts.length === 3) {
      return {
        kind: "generalAction",
        ...common,
        idempotent: method === "put",
      };
    } else if (parts.length === 2) {
      return {
        kind: "createInstance",
        ...common,
        idempotent: method === "put",
      };
    }
  } else if (method === "delete") {
    const idParam = getParamName(parts[2]);
    if (idParam && parts.length === 3) {
      return {
        kind: "deleteInstance",
        ...common,
      };
    }
  }
  return;
}

export default function generateProgramFromV3(
  spec: OpenAPIV3.Document,
  specifics: Specifics = defaultV3Specifics
): ProgramDefinition {
  const types: Record<string, TypeDef> = {};

  let count = 0;
  const unrecognized: Array<string[]> = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (specifics.shouldIgnorePath(path)) {
      continue;
    }
    const typeName = specifics.determineTypeNameFromPath(path);
    if (!typeName) {
      console.warn("No type name could be determined for path", path);
      continue;
    }
    if (!methods) {
      console.warn("No methods for path", path);
      continue;
    }
    const type =
      types[typeName] ||
      (types[typeName] = {
        name: typeName,
        operations: [],
      });

    for (const [method, endpoint] of Object.entries(methods)) {
      count++;
      const operation = determineOperation(
        method,
        path,
        endpoint as OpenAPIV3.OperationObject
      );
      if (operation) {
        type.operations.push(operation);
      } else {
        unrecognized.push([method.toUpperCase(), path]);
      }
    }
  }

  for (const [method, path] of unrecognized) {
    console.warn("? ", method, path);
  }

  console.log(
    "Recognized",
    count - unrecognized.length,
    "of",
    count,
    "operations"
  );

  return {
    types,
    baseUrl: spec.servers?.[0]?.url || "BASE_URL_HERE",
    authScheme: determineAuthScheme(spec),
  };
}

function determineAuthScheme(spec: OpenAPIV3.Document<{}>): AuthScheme {
  const components = spec.components;
  if (components) {
    const schemes = components.securitySchemes;
    if (schemes) {
      for (let [name, scheme] of Object.entries(schemes).map(([n, s]) => [
        n,
        noref(s),
      ])) {
        // TODO: support all schemes
        if (typeof scheme === "string") {
          if (scheme === "http") {
            return "bearer";
          }
        } else {
          if (scheme.type === "http") {
            return "bearer";
          }
        }
      }
    }
  }
  return "unknown";
}
