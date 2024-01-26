import { OpenAPIV3 } from "openapi-types";
import ts, { factory } from "typescript";
import { ProgramDefinition } from "./common";

export default function generateApiFunction(program: ProgramDefinition) {
  const { baseUrl, authScheme } = program;
  if (authScheme === "bearer") {
    return generateTokenBearerApiFunction(baseUrl);
  } else {
    return generateStubApiFunction();
  }
}

function generateTokenBearerApiFunction(baseUrl: string) {
  return factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
    undefined,
    factory.createIdentifier("api"),
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("method"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("path"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("query"),
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("body"),
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
    ],
    undefined,
    factory.createBlock(
      [
        factory.createIfStatement(
          factory.createPrefixUnaryExpression(
            ts.SyntaxKind.ExclamationToken,
            factory.createPropertyAccessExpression(
              factory.createIdentifier("state"),
              factory.createIdentifier("token")
            )
          ),
          factory.createBlock(
            [
              factory.createThrowStatement(
                factory.createNewExpression(
                  factory.createIdentifier("Error"),
                  undefined,
                  [
                    factory.createStringLiteral(
                      "You must first invoke the configure action with an API token"
                    ),
                  ]
                )
              ),
            ],
            true
          ),
          undefined
        ),
        factory.createIfStatement(
          factory.createIdentifier("query"),
          factory.createBlock(
            [
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createCallExpression(
                      factory.createPropertyAccessExpression(
                        factory.createIdentifier("Object"),
                        factory.createIdentifier("keys")
                      ),
                      undefined,
                      [factory.createIdentifier("query")]
                    ),
                    factory.createIdentifier("forEach")
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
                          factory.createIdentifier("key"),
                          undefined,
                          undefined,
                          undefined
                        ),
                      ],
                      undefined,
                      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                      factory.createConditionalExpression(
                        factory.createBinaryExpression(
                          factory.createElementAccessExpression(
                            factory.createIdentifier("query"),
                            factory.createIdentifier("key")
                          ),
                          factory.createToken(
                            ts.SyntaxKind.EqualsEqualsEqualsToken
                          ),
                          factory.createIdentifier("undefined")
                        ),
                        factory.createToken(ts.SyntaxKind.QuestionToken),
                        factory.createDeleteExpression(
                          factory.createElementAccessExpression(
                            factory.createIdentifier("query"),
                            factory.createIdentifier("key")
                          )
                        ),
                        factory.createToken(ts.SyntaxKind.ColonToken),
                        factory.createObjectLiteralExpression([], false)
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
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                factory.createIdentifier("querystr"),
                undefined,
                undefined,
                factory.createConditionalExpression(
                  factory.createBinaryExpression(
                    factory.createIdentifier("query"),
                    factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                    factory.createPropertyAccessExpression(
                      factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                          factory.createIdentifier("Object"),
                          factory.createIdentifier("keys")
                        ),
                        undefined,
                        [factory.createIdentifier("query")]
                      ),
                      factory.createIdentifier("length")
                    )
                  ),
                  factory.createToken(ts.SyntaxKind.QuestionToken),
                  factory.createTemplateExpression(
                    factory.createTemplateHead("?", "?"),
                    [
                      factory.createTemplateSpan(
                        factory.createNewExpression(
                          factory.createIdentifier("URLSearchParams"),
                          undefined,
                          [factory.createIdentifier("query")]
                        ),
                        factory.createTemplateTail("", "")
                      ),
                    ]
                  ),
                  factory.createToken(ts.SyntaxKind.ColonToken),
                  factory.createStringLiteral("")
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
                factory.createIdentifier("url"),
                undefined,
                undefined,
                factory.createTemplateExpression(
                  factory.createTemplateHead(
                    baseUrl.replace(/\/?$/, "/"),
                    baseUrl.replace(/\/?$/, "/")
                  ),
                  [
                    factory.createTemplateSpan(
                      factory.createIdentifier("path"),
                      factory.createTemplateMiddle("", "")
                    ),
                    factory.createTemplateSpan(
                      factory.createIdentifier("querystr"),
                      factory.createTemplateTail("", "")
                    ),
                  ]
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
                factory.createIdentifier("req"),
                undefined,
                undefined,
                factory.createObjectLiteralExpression(
                  [
                    factory.createShorthandPropertyAssignment(
                      factory.createIdentifier("method"),
                      undefined
                    ),
                    factory.createShorthandPropertyAssignment(
                      factory.createIdentifier("body"),
                      undefined
                    ),
                    factory.createPropertyAssignment(
                      factory.createIdentifier("headers"),
                      factory.createObjectLiteralExpression(
                        [
                          factory.createPropertyAssignment(
                            factory.createStringLiteral("Authorization"),
                            factory.createTemplateExpression(
                              factory.createTemplateHead("Bearer ", "Bearer "),
                              [
                                factory.createTemplateSpan(
                                  factory.createPropertyAccessExpression(
                                    factory.createIdentifier("state"),
                                    factory.createIdentifier("token")
                                  ),
                                  factory.createTemplateTail("", "")
                                ),
                              ]
                            )
                          ),
                          factory.createPropertyAssignment(
                            factory.createStringLiteral("Content-Type"),
                            factory.createStringLiteral("application/json")
                          ),
                        ],
                        true
                      )
                    ),
                  ],
                  true
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
          factory.createAwaitExpression(
            factory.createCallExpression(
              factory.createIdentifier("fetch"),
              undefined,
              [factory.createIdentifier("url"), factory.createIdentifier("req")]
            )
          )
        ),
      ],
      true
    )
  );
}

function generateStubApiFunction() {
  return factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
    undefined,
    factory.createIdentifier("api"),
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("method"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("path"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("query"),
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("body"),
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
    ],
    undefined,
    factory.createBlock([], true)
  );
}
