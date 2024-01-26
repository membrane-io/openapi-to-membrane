import ts, { factory } from "typescript";

export default function createStringTemplateFromPath(path: string) {
  const re = new RegExp("({[^}]+}|[^{][^{]*)", "g");

  let match;
  const matches: string[] = [];
  while ((match = re.exec(path)) !== null) {
    matches.push(match[0]);
  }

  let grouped = [];
  let span;
  if (matches?.length) {
    function isSpan(i: number) {
      return matches[i][0] === "{";
    }

    for (let i = 0; i < matches.length; i++) {
      if (isSpan(i)) {
        if (i === 0) {
          grouped.push("");
        }
        if (span) {
          grouped.push([...span, ""]);
        }
        span = [matches[i]];
      } else {
        if (span) {
          span.push(matches[i]);
          grouped.push(span);
          span = null;
        } else {
          grouped.push(matches[i]);
        }
      }
    }
    if (span) {
      grouped.push([...span, ""]);
    }
  }

  const spans = [];
  for (let i = 1; i < grouped.length; i++) {
    const [variable, text] = grouped[i];
    const span = factory.createTemplateSpan(
      factory.createPropertyAccessExpression(
        factory.createIdentifier("args"),
        factory.createIdentifier(variable.replace("{", "").replace("}", ""))
      ),
      i === grouped.length - 1
        ? factory.createTemplateTail(text)
        : factory.createTemplateMiddle(text)
    );
    spans.push(span);
  }

  const expression = factory.createTemplateExpression(
    factory.createTemplateHead(grouped[0] as string),
    spans
  );

  return expression;
}
