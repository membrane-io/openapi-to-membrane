import ts, { factory } from "typescript";

export default function generateGetSelfGref() {
  return factory.createFunctionDeclaration(
    undefined,
    undefined,
    factory.createIdentifier("getSelfGref"),
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("obj"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("typeName"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("args"),
        undefined,
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined
      ),
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("self"),
        undefined,
        factory.createTypeReferenceNode(factory.createIdentifier("Gref"), [
          factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        ]),
        undefined
      ),
    ],
    factory.createUnionTypeNode([
      factory.createTypeReferenceNode(factory.createIdentifier("Gref"), [
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      ]),
      factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
    ]),
    factory.createBlock(
      [
        factory.createReturnStatement(
          factory.createAsExpression(
            factory.createNull(),
            factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
          )
        ),
      ],
      true
    )
  );
}
