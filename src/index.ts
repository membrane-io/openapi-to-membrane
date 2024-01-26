import { pluralize, camelize } from "inflection";
import { OpenAPI, OpenAPIV3, OpenAPIV2 } from "openapi-types";
import { writeFile } from "node:fs/promises";
import ts, { factory, ListFormat } from "typescript";
import generateApiFunction from "./generateApiFunction";
import createStringTemplateFromPath from "./createStringTemplateFromPath";
import _ from "lodash";
import RefParser from "@apidevtools/json-schema-ref-parser";
import generateProgramFromV3 from "./generateProgramFromV3";
import {
  Field,
  jsonSchemaToMembraneType,
  Member,
  Memconfig,
  MType,
  ProgramDefinition,
  Schema,
  SCHEMA_PATH,
  STRATEGY,
  TypeDef,
} from "./common";
import generateProgramFromV2 from "./generateProgramFromV2";
import generateCollectionFunctions from "./generateCollectionFunctions";
import generateGetSelfGref from "./generateGetSelfGrefFunction";

function generateRootActions(): Member[] {
  const actions: Member[] = [];
  if (spec.authScheme === "bearer") {
    actions.push({
      name: "configure",
      type: "Void",
      params: [
        {
          name: "token",
          type: "String",
        },
      ],
      [STRATEGY]: { kind: "configureBearerToken" },
    });
  } else {
    console.warn("Non bearer auth schemes are not supported yet");
  }
  return actions;
}

function generateMemconfig(): Memconfig {
  const types = spec.types;
  const schema: Schema = {
    types: [
      {
        name: "Root",
        fields: [],
        actions: generateRootActions(),
        events: [],
      },
    ],
  };

  for (const [typeName, _type] of Object.entries(types)) {
    schema.types.push({
      name: typeName,
      fields: [
        {
          name: "gref",
          type: "Ref",
          ofType: typeName,
          [STRATEGY]: { kind: "getSelfGref" },
        },
      ],
      actions: [],
      events: [],
    });
  }

  for (const [typeName, type] of Object.entries(types)) {
    // Get one instance
    const fetchOneOp = type.operations.find(
      (op) => op.kind === "fetchInstance"
    );
    const listOp = type.operations.find((op) => op.kind === "listInstances");

    if (fetchOneOp || listOp) {
      const collectionType = getOrCreateCollectionType(schema, typeName, type);

      if (fetchOneOp) {
        collectionType.fields.push({
          name: "one",
          type: typeName,
          params: fetchOneOp.parameters.map((p) => ({
            name: p.name,
            ...p.determineMembraneType(),
            description: p.description,
          })),
          [STRATEGY]: { kind: "operation", operation: fetchOneOp },
        });

        // const responseSchema = specifics.determineResponseSchema(fetchOneOp);
        const { responseSchema } = fetchOneOp;
        if (responseSchema) {
          const mtype = schema.types.find((t) => t.name === typeName)!;
          // const props = collectProperties(fetchOneOp.responseSchema);
          for (const {
            name,
            schema: propSchema,
          } of responseSchema.getCombinedProperties()) {
            console.log(" PROP:", name);
            const existing =
              mtype.fields.find((f) => f.name === name) ||
              mtype.actions.find((f) => f.name === name) ||
              mtype.events.find((f) => f.name === name);
            const type = jsonSchemaToMembraneType(propSchema);
            if (!existing) {
              const field: Field = {
                name: name,
                ...type,
              };
              // Simplest heuristic to determine if this is primary or not
              // TODO: allow to override this
              if (type.type === "String") {
                if (name === "name" || name === "title" || name === "alias") {
                  field.hints = { primary: true };
                }
              }
              mtype.fields.push(field);
            } else if (existing && !_.isEqual(existing.type, type)) {
              console.warn(
                `Two possible field types mismatch ${name} on ${typeName}, using: ${existing.type} vs ${type}`
              );
            }
          }
        }
      }

      // Get a list of instances
      if (listOp) {
        const pageType = ensurePageType(schema, typeName);
        if (!collectionType.fields.find((f) => f.name === "page")) {
          collectionType.fields.push({
            name: "page",
            type: pageType.name,
            params: listOp.parameters.map((p) => ({
              name: p.name,
              ...p.determineMembraneType(),
              description: p.description,
            })),
            [STRATEGY]: { kind: "operation", operation: listOp },
          });
        }
      }
    }
    // TODO: other ops
  }

  return {
    schema,
    dependencies: {},
  };
}

function getOrCreateCollectionType(
  schema: Schema,
  itemTypeName: string,
  type: TypeDef
): MType {
  const parent = determineParentType(schema, itemTypeName, type);
  const fieldName = camelize(pluralize(itemTypeName), true);
  const collectionTypeName = `${itemTypeName}Collection`;
  if (!parent.fields.find((f) => f.name === fieldName)) {
    parent.fields.push({
      name: fieldName,
      type: collectionTypeName,
      [STRATEGY]: { kind: "emptyObject" },
    });

    if (!schema.types.find((t) => t.name === collectionTypeName)) {
      schema.types.push({
        name: collectionTypeName,
        fields: [],
        actions: [],
        events: [],
      });
    }
  }
  return schema.types.find((t) => t.name === collectionTypeName)!;
}

function ensurePageType(schema: Schema, itemTypeName: string): MType {
  const pageTypeName = `${itemTypeName}Page`;
  if (!schema.types.find((t) => t.name === pageTypeName)) {
    schema.types.push({
      name: pageTypeName,
      fields: [
        { name: "items", type: "List", ofType: itemTypeName },
        { name: "next", type: "Ref", ofType: pageTypeName },
      ],
      actions: [],
      events: [],
    });
  }
  return schema.types.find((t) => t.name === pageTypeName)!;
}

// TODO: implement for nested resources
function determineParentType(
  schema: Schema,
  itemTypeName: string,
  type: TypeDef
): MType {
  return schema.types.find((t) => t.name === "Root")!;
}

function generateObjectForType(
  type: MType,
  functions: ts.PropertyAssignment[]
): ts.Node {
  return factory.createVariableStatement(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createIdentifier(type.name),
          undefined,
          undefined,
          factory.createObjectLiteralExpression(functions, true)
        ),
      ],
      ts.NodeFlags.Const
    )
  );
}

// Snippets generated with https://ts-ast-viewer.com/
function generateMemberResolver(
  member: Member
): ts.PropertyAssignment | undefined {
  const strategy = member[STRATEGY];
  if (!strategy) {
    // This member doesn't need a resolver
    return;
  }

  switch (strategy.kind) {
    case "getSelfGref":
      return factory.createPropertyAssignment(
        factory.createIdentifier("gref"),
        factory.createArrowFunction(
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createObjectBindingPattern([
                factory.createBindingElement(
                  undefined,
                  undefined,
                  factory.createIdentifier("obj"),
                  undefined
                ),
                factory.createBindingElement(
                  undefined,
                  undefined,
                  factory.createIdentifier("self"),
                  undefined
                ),
              ]),
              undefined,
              undefined,
              undefined
            ),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createBlock(
            [
              factory.createReturnStatement(
                factory.createCallExpression(
                  factory.createIdentifier("getSelfGref"),
                  undefined,
                  [
                    factory.createIdentifier("obj"),
                    factory.createStringLiteral(member.ofType as string),
                    factory.createIdentifier("self"),
                  ]
                )
              ),
            ],
            true
          )
        )
      );

    case "emptyObject":
      return factory.createPropertyAssignment(
        factory.createIdentifier(member.name),
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createParenthesizedExpression(
            factory.createObjectLiteralExpression([], false)
          )
        )
      );
    case "operation":
      const operation = strategy.operation;
      switch (operation.kind) {
        case "fetchInstance":
          return factory.createPropertyAssignment(
            factory.createIdentifier(member.name),
            factory.createArrowFunction(
              [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
              undefined,
              [
                factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  factory.createObjectBindingPattern([
                    factory.createBindingElement(
                      undefined,
                      undefined,
                      factory.createIdentifier("args"),
                      undefined
                    ),
                  ]),
                  undefined,
                  undefined,
                  undefined
                ),
              ],
              undefined,
              factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              factory.createBlock(
                [
                  factory.createVariableStatement(
                    undefined,
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          factory.createIdentifier("res"),
                          undefined,
                          undefined,
                          factory.createAwaitExpression(
                            factory.createCallExpression(
                              factory.createIdentifier("api"),
                              undefined,
                              [
                                factory.createStringLiteral(
                                  operation.method.toUpperCase()
                                ),
                                createStringTemplateFromPath(
                                  operation.path.replace(/^\//, "")
                                ),
                              ]
                            )
                          )
                        ),
                      ],
                      ts.NodeFlags.Const
                    )
                  ),
                  factory.createReturnStatement(
                    factory.createAwaitExpression(
                      factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                          factory.createIdentifier("res"),
                          factory.createIdentifier("json")
                        ),
                        undefined,
                        []
                      )
                    )
                  ),
                ],
                true
              )
            )
          );
        case "listInstances": {
          return factory.createPropertyAssignment(
            factory.createIdentifier("page"),
            factory.createArrowFunction(
              [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
              undefined,
              [
                factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  factory.createObjectBindingPattern([
                    factory.createBindingElement(
                      undefined,
                      undefined,
                      factory.createIdentifier("self"),
                      undefined
                    ),
                    factory.createBindingElement(
                      undefined,
                      undefined,
                      factory.createIdentifier("args"),
                      undefined
                    ),
                  ]),
                  undefined,
                  undefined,
                  undefined
                ),
              ],
              undefined,
              factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              factory.createBlock(
                [
                  factory.createVariableStatement(
                    undefined,
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          factory.createIdentifier("path"),
                          undefined,
                          undefined,
                          factory.createStringLiteral(
                            operation.path.replace(/^\//, "")
                          )
                        ),
                      ],
                      ts.NodeFlags.Const |
                        ts.NodeFlags.AwaitContext |
                        ts.NodeFlags.ContextFlags |
                        ts.NodeFlags.TypeExcludesFlags
                    )
                  ),
                  factory.createVariableStatement(
                    undefined,
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          factory.createIdentifier("res"),
                          undefined,
                          undefined,
                          factory.createAwaitExpression(
                            factory.createCallExpression(
                              factory.createIdentifier("api"),
                              undefined,
                              [
                                factory.createStringLiteral(
                                  operation.method.toUpperCase()
                                ),
                                factory.createIdentifier("path"),
                                factory.createIdentifier("args"),
                              ]
                            )
                          )
                        ),
                      ],
                      ts.NodeFlags.Const |
                        ts.NodeFlags.AwaitContext |
                        ts.NodeFlags.ContextFlags |
                        ts.NodeFlags.TypeExcludesFlags
                    )
                  ),
                  factory.createVariableStatement(
                    undefined,
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          factory.createIdentifier("json"),
                          undefined,
                          undefined,
                          factory.createAwaitExpression(
                            factory.createCallExpression(
                              factory.createPropertyAccessExpression(
                                factory.createIdentifier("res"),
                                factory.createIdentifier("json")
                              ),
                              undefined,
                              []
                            )
                          )
                        ),
                      ],
                      ts.NodeFlags.Const |
                        ts.NodeFlags.AwaitContext |
                        ts.NodeFlags.ContextFlags |
                        ts.NodeFlags.TypeExcludesFlags
                    )
                  ),
                  factory.createReturnStatement(
                    factory.createObjectLiteralExpression(
                      [
                        factory.createPropertyAssignment(
                          factory.createIdentifier("items"),
                          factory.createCallExpression(
                            factory.createIdentifier("getItemsFromResponse"),
                            undefined,
                            [
                              factory.createIdentifier("json"),
                              factory.createIdentifier("path"),
                              factory.createIdentifier("args"),
                              factory.createIdentifier("self"),
                            ]
                          )
                        ),
                        factory.createPropertyAssignment(
                          factory.createIdentifier("next"),
                          factory.createCallExpression(
                            factory.createIdentifier("getNextPageRef"),
                            undefined,
                            [
                              factory.createIdentifier("json"),
                              factory.createIdentifier("path"),
                              factory.createIdentifier("args"),
                              factory.createIdentifier("self"),
                            ]
                          )
                        ),
                      ],
                      true
                    )
                  ),
                ],
                true
              )
            )
          );
        }
        default:
          // TODO:
          return;
      }
    case "configureBearerToken":
      return factory.createPropertyAssignment(
        factory.createIdentifier("configure"),
        factory.createArrowFunction(
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createObjectBindingPattern([
                factory.createBindingElement(
                  undefined,
                  factory.createIdentifier("args"),
                  factory.createObjectBindingPattern([
                    factory.createBindingElement(
                      undefined,
                      undefined,
                      factory.createIdentifier("token"),
                      undefined
                    ),
                  ]),
                  undefined
                ),
              ]),
              undefined,
              undefined,
              undefined
            ),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createBlock(
            [
              factory.createExpressionStatement(
                factory.createBinaryExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier("state"),
                    factory.createIdentifier("token")
                  ),
                  factory.createToken(ts.SyntaxKind.EqualsToken),
                  factory.createIdentifier("token")
                )
              ),
            ],
            true
          )
        )
      );
    case "coerceToString":
      return factory.createPropertyAssignment(
        factory.createIdentifier(member.name),
        factory.createArrowFunction(
          [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createObjectBindingPattern([
                factory.createBindingElement(
                  undefined,
                  undefined,
                  factory.createIdentifier("obj"),
                  undefined
                ),
              ]),
              undefined,
              undefined,
              undefined
            ),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createBlock(
            [
              factory.createVariableStatement(
                undefined,
                factory.createVariableDeclarationList(
                  [
                    factory.createVariableDeclaration(
                      factory.createIdentifier("val"),
                      undefined,
                      undefined,
                      factory.createElementAccessExpression(
                        factory.createIdentifier("obj"),
                        factory.createStringLiteral(member.name)
                      )
                    ),
                  ],
                  ts.NodeFlags.Const |
                    ts.NodeFlags.AwaitContext |
                    ts.NodeFlags.ContextFlags |
                    ts.NodeFlags.TypeExcludesFlags
                )
              ),
              factory.createReturnStatement(
                factory.createConditionalExpression(
                  factory.createBinaryExpression(
                    factory.createTypeOfExpression(
                      factory.createIdentifier("val")
                    ),
                    factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                    factory.createStringLiteral("string")
                  ),
                  factory.createToken(ts.SyntaxKind.QuestionToken),
                  factory.createIdentifier("val"),
                  factory.createToken(ts.SyntaxKind.ColonToken),
                  factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier("JSON"),
                      factory.createIdentifier("stringify")
                    ),
                    undefined,
                    [factory.createIdentifier("val")]
                  )
                )
              ),
            ],
            true
          )
        )
      );
    case "coerceItemsToString":
      return factory.createPropertyAssignment(
        factory.createIdentifier(member.name),
        factory.createArrowFunction(
          [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createObjectBindingPattern([
                factory.createBindingElement(
                  undefined,
                  undefined,
                  factory.createIdentifier("obj"),
                  undefined
                ),
              ]),
              undefined,
              undefined,
              undefined
            ),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createBlock(
            [
              factory.createVariableStatement(
                undefined,
                factory.createVariableDeclarationList(
                  [
                    factory.createVariableDeclaration(
                      factory.createIdentifier("items"),
                      undefined,
                      undefined,
                      factory.createElementAccessExpression(
                        factory.createIdentifier("obj"),
                        factory.createStringLiteral(member.name)
                      )
                    ),
                  ],
                  ts.NodeFlags.Const |
                    ts.NodeFlags.AwaitContext |
                    ts.NodeFlags.ContextFlags |
                    ts.NodeFlags.TypeExcludesFlags
                )
              ),
              factory.createIfStatement(
                factory.createIdentifier("items"),
                factory.createBlock(
                  [
                    factory.createReturnStatement(
                      factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                          factory.createIdentifier("items"),
                          factory.createIdentifier("map")
                        ),
                        undefined,
                        [
                          factory.createArrowFunction(
                            undefined,
                            undefined,
                            [
                              factory.createParameterDeclaration(
                                undefined,
                                undefined,
                                factory.createIdentifier("e"),
                                undefined,
                                factory.createKeywordTypeNode(
                                  ts.SyntaxKind.AnyKeyword
                                ),
                                undefined
                              ),
                            ],
                            undefined,
                            factory.createToken(
                              ts.SyntaxKind.EqualsGreaterThanToken
                            ),
                            factory.createCallExpression(
                              factory.createPropertyAccessExpression(
                                factory.createIdentifier("JSON"),
                                factory.createIdentifier("stringify")
                              ),
                              undefined,
                              [factory.createIdentifier("e")]
                            )
                          ),
                        ]
                      )
                    ),
                  ],
                  true
                ),
                undefined
              ),
            ],
            true
          )
        )
      );
  }
}

function generateImportStatements() {
  return [
    factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("state")
          ),
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("root")
          ),
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("nodes")
          ),
        ])
      ),
      factory.createStringLiteral("membrane"),
      undefined
    ),
    factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        factory.createIdentifier("fetch"),
        undefined
      ),
      factory.createStringLiteral("node-fetch"),
      undefined
    ),
    factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("getItemsFromResponse")
          ),
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("getNextPageRef")
          ),
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("getSelfGref")
          ),
        ])
      ),
      factory.createStringLiteral("./index.custom"),
      undefined
    ),
  ];
}

function generateCode(memconfig: Memconfig): string {
  const types = spec.types;
  const resultFile = ts.createSourceFile(
    "index.gen.ts",
    "",
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS
  );

  const statements: ts.Node[] = [
    ...generateImportStatements(),
    generateApiFunction(spec),
    // These must now be declared in the index.custom.ts file
    // ...generateCollectionFunctions(),
    // generateGetSelfGref(),
  ];
  generateCodeForTypes(statements, memconfig);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printList(
    ListFormat.MultiLine | ListFormat.PreferNewLine | ListFormat.LinesMask,
    factory.createNodeArray(statements),
    resultFile
  );
  // return printer.printNode(ts.EmitHint.Unspecified, resultFile.statements);
}

function generateCodeForTypes(
  statements: ts.Node[],
  memconfig: Memconfig
): ts.Node[] {
  for (const type of memconfig.schema.types) {
    let properties: ts.PropertyAssignment[] = [];
    for (const member of [...type.fields, ...type.actions, ...type.events]) {
      const resolver = generateMemberResolver(member);
      if (resolver) {
        properties.push(resolver);
      }
    }
    if (properties.length > 0) {
      statements.push(generateObjectForType(type, properties));
    }
  }
  return statements;
}

let spec: ProgramDefinition;
async function main() {
  // const parser = new RefParser();
  const options: RefParser.Options = {
    dereference: {
      onDereference: (path: string, value: any) => {
        value[SCHEMA_PATH] = path;
      },
    },
  };
  const rawSpec = (await RefParser.dereference(
    "./api.json",
    options
  )) as OpenAPI.Document;

  if ("swagger" in rawSpec) {
    spec = generateProgramFromV2(rawSpec as OpenAPIV2.Document);
  } else if ("openapi" in rawSpec) {
    spec = generateProgramFromV3(rawSpec as OpenAPIV3.Document);
  } else {
    console.log("Unknown spec version");
    process.exit(1);
  }

  // for (const [typeName, type] of Object.entries(types)) {
  //   console.log(typeName);
  //   for (const op of type.operations) {
  //     console.log(
  //       "  ",
  //       op.method.toUpperCase(),
  //       op.path,
  //       JSON.stringify(op.kind),
  //       op.responseTypeName,
  //       Object.keys(collectProperties(op.responseSchema || {})).length,
  //       "props"
  //     );
  //   }
  // }

  const memconfig = generateMemconfig();
  memconfig.dependencies = { http: "http:" };
  await writeFile("memconfig.json", JSON.stringify(memconfig, null, 2));
  const code: string = generateCode(memconfig);
  await writeFile("index.gen.ts", code);
}
main().catch((e) => {
  console.error(e);
});

// async function api(method, path, query, body) {
//   const res = await fetch(`https://api.example.com${path}`, {
//     method,
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(body),
//   });
//   return await res.json();
// }

// // Comment
// async function resource_operation(args) {}
