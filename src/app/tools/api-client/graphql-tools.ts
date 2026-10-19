/**
 * GraphQL schema reading and query editing for the API Client's explorer.
 * This file pulls in graphql-js, so it is only loaded with the explorer.
 */
import {
  GraphQLField,
  GraphQLNamedType,
  GraphQLSchema,
  IntrospectionQuery,
  OperationTypeNode,
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  getNamedType,
  isInterfaceType,
  isLeafType,
  isNonNullType,
  isObjectType,
  isUnionType,
  parse,
  parseType,
  print,
  validate,
} from 'graphql';

export type Operation = 'query' | 'mutation' | 'subscription';

/** The body that asks a server to describe its schema. */
export function introspectionBody(): string {
  return JSON.stringify({ query: getIntrospectionQuery(), operationName: 'IntrospectionQuery' });
}

/**
 * A schema from an introspection result (as a server returns it, or saved to a file)
 * or from schema text in SDL ("type Query { … }").
 */
export function schemaFromText(text: string): GraphQLSchema {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed) as { data?: IntrospectionQuery; errors?: { message: string }[] } & Partial<IntrospectionQuery>;
    const result = json.data ?? (json.__schema ? (json as IntrospectionQuery) : undefined);
    if (!result?.__schema) {
      const reason = json.errors?.[0]?.message;
      throw new Error(reason ? `The server did not describe its schema: ${reason}` : 'This JSON is not a GraphQL introspection result.');
    }
    return buildClientSchema(result);
  }
  return buildSchema(trimmed, { assumeValidSDL: true });
}

export interface ArgInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FieldInfo {
  name: string;
  type: string;
  description: string;
  /** Strings, numbers, enums: nothing to select inside. */
  leaf: boolean;
  deprecated: boolean;
  args: ArgInfo[];
}

export function rootTypes(schema: GraphQLSchema): { operation: Operation; name: string }[] {
  const roots: { operation: Operation; type: GraphQLNamedType | null | undefined }[] = [
    { operation: 'query', type: schema.getQueryType() },
    { operation: 'mutation', type: schema.getMutationType() },
    { operation: 'subscription', type: schema.getSubscriptionType() },
  ];
  return roots.filter((root) => root.type).map((root) => ({ operation: root.operation, name: root.type!.name }));
}

type AnyField = GraphQLField<unknown, unknown>;

function fieldsMap(type: GraphQLNamedType): Record<string, AnyField> | null {
  return isObjectType(type) || isInterfaceType(type) ? type.getFields() : null;
}

function describe(field: AnyField): FieldInfo {
  return {
    name: field.name,
    type: String(field.type),
    description: field.description ?? '',
    leaf: isLeafType(getNamedType(field.type)),
    deprecated: !!field.deprecationReason,
    args: field.args.map((arg) => ({
      name: arg.name,
      type: String(arg.type),
      required: isNonNullType(arg.type) && arg.defaultValue === undefined,
      description: arg.description ?? '',
    })),
  };
}

/** The type reached by following field names from an operation's root. */
function typeAt(schema: GraphQLSchema, operation: Operation, path: string[]): GraphQLNamedType | null {
  let type: GraphQLNamedType | null | undefined = schema.getRootType(operation as OperationTypeNode);
  for (const name of path) {
    const field: AnyField | undefined = type ? fieldsMap(type)?.[name] : undefined;
    if (!field) return null;
    type = getNamedType(field.type) as GraphQLNamedType;
  }
  return type ?? null;
}

/** The fields that can be selected at a path; union types offer only __typename. */
export function fieldsAt(schema: GraphQLSchema, operation: Operation, path: string[]): FieldInfo[] {
  const type = typeAt(schema, operation, path);
  if (!type) return [];
  if (isUnionType(type)) return [{ name: '__typename', type: 'String!', description: 'The name of the object type', leaf: true, deprecated: false, args: [] }];
  const fields = fieldsMap(type);
  return fields ? Object.values(fields).map(describe) : [];
}

// Query editing works on a plain copy of the parsed document, then prints it again.

interface Node {
  kind: string;
  [key: string]: unknown;
}
interface FieldNode extends Node {
  name: { kind: 'Name'; value: string };
  alias?: unknown;
  arguments?: Node[];
  selectionSet?: SelectionSet;
}
interface SelectionSet extends Node {
  selections: Node[];
}
interface OperationNode extends Node {
  operation: Operation;
  name?: { kind: 'Name'; value: string };
  variableDefinitions?: Node[];
  selectionSet: SelectionSet;
}

const nameNode = (value: string) => ({ kind: 'Name', value }) as const;
const fieldNode = (name: string): FieldNode => ({ kind: 'Field', name: nameNode(name), arguments: [], directives: [] });
const selectionSet = (): SelectionSet => ({ kind: 'SelectionSet', selections: [] });

function parseDocument(text: string): { definitions: Node[] } | null {
  if (!text.trim()) return { kind: 'Document', definitions: [] } as { definitions: Node[] };
  try {
    return JSON.parse(JSON.stringify(parse(text, { noLocation: true }))) as { definitions: Node[] };
  } catch {
    return null;
  }
}

const isField = (node: Node, name: string): node is FieldNode => node.kind === 'Field' && (node as FieldNode).name.value === name;

function findOperation(doc: { definitions: Node[] }, operation: Operation): OperationNode | undefined {
  return doc.definitions.find((d): d is OperationNode => d.kind === 'OperationDefinition' && (d as OperationNode).operation === operation);
}

/** Which fields and arguments the query selects, as paths like "user/address/city" and "user(id". */
export function selection(text: string): { operation: Operation | null; fields: Set<string>; args: Set<string> } | null {
  const doc = parseDocument(text);
  if (!doc) return null;
  const fields = new Set<string>();
  const args = new Set<string>();
  const op = doc.definitions.find((d): d is OperationNode => d.kind === 'OperationDefinition');
  const walk = (set: SelectionSet | undefined, prefix: string) => {
    for (const node of set?.selections ?? []) {
      if (node.kind !== 'Field') continue;
      const field = node as FieldNode;
      const path = prefix + field.name.value;
      fields.add(path);
      for (const arg of field.arguments ?? []) args.add(`${path}(${(arg['name'] as { value: string }).value}`);
      walk(field.selectionSet, `${path}/`);
    }
  };
  walk(op?.selectionSet, '');
  return { operation: op?.operation ?? null, fields, args };
}

const OPERATION_NAMES: Record<Operation, string> = { query: 'MyQuery', mutation: 'MyMutation', subscription: 'MySubscription' };

/** The operation to edit, made (replacing the document) when the query has none of this kind. */
function operationFor(doc: { definitions: Node[] }, operation: Operation): OperationNode {
  const found = findOperation(doc, operation);
  if (found) return found;
  const created: OperationNode = {
    kind: 'OperationDefinition',
    operation,
    name: nameNode(OPERATION_NAMES[operation]),
    variableDefinitions: [],
    directives: [],
    selectionSet: selectionSet(),
  };
  doc.definitions = [created];
  return created;
}

function printDocument(doc: { definitions: Node[] }): string {
  const operations = doc.definitions.filter((d) => d.kind !== 'OperationDefinition' || (d as OperationNode).selectionSet.selections.length);
  return operations.length ? print({ ...doc, definitions: operations } as never) + '\n' : '';
}

/** Fields picked when a whole object is ticked: its leaves that need no arguments. */
function defaultLeaves(schema: GraphQLSchema, operation: Operation, path: string[]): FieldNode[] {
  const fields = fieldsAt(schema, operation, path).filter((f) => f.leaf && !f.args.some((a) => a.required));
  return (fields.length ? fields : [{ name: '__typename' } as FieldInfo]).map((f) => fieldNode(f.name));
}

/** Walks to the field at the path, creating the fields on the way when asked. */
function fieldAt(op: OperationNode, path: string[], create: boolean): { field: FieldNode; parents: FieldNode[] } | null {
  let set = op.selectionSet;
  const parents: FieldNode[] = [];
  let field: FieldNode | undefined;
  for (const [i, name] of path.entries()) {
    field = set.selections.find((node): node is FieldNode => isField(node, name));
    if (!field) {
      if (!create) return null;
      field = fieldNode(name);
      set.selections.push(field);
    }
    if (i < path.length - 1) {
      parents.push(field);
      field.selectionSet ??= selectionSet();
      set = field.selectionSet;
    }
  }
  return field ? { field, parents } : null;
}

/** Ticks or unticks a field in the query, returning the new query text, or null when the query cannot be read. */
export function toggleField(text: string, schema: GraphQLSchema, operation: Operation, path: string[], on: boolean): string | null {
  const doc = parseDocument(text);
  if (!doc) return null;
  const op = operationFor(doc, operation);
  if (on) {
    const found = fieldAt(op, path, true)!;
    const type = typeAt(schema, operation, path);
    if (type && !isLeafType(type) && !found.field.selectionSet?.selections.length) {
      found.field.selectionSet = { ...selectionSet(), selections: defaultLeaves(schema, operation, path) };
    }
  } else {
    removeAt(op, path);
  }
  pruneVariables(op);
  return printDocument(doc);
}

/** Removes the field, then any parent left with nothing selected. */
function removeAt(op: OperationNode, path: string[]): void {
  for (let depth = path.length; depth > 0; depth--) {
    const parentSet = depth === 1 ? op.selectionSet : fieldAt(op, path.slice(0, depth - 1), false)?.field.selectionSet;
    if (!parentSet) return;
    const name = path[depth - 1];
    const node = parentSet.selections.find((n): n is FieldNode => isField(n, name));
    if (depth === path.length || (node && !node.selectionSet?.selections.length)) {
      parentSet.selections = parentSet.selections.filter((n) => n !== node);
    }
    if (parentSet.selections.length) return;
  }
}

/** Variables the operation declares but no longer uses are dropped. */
function pruneVariables(op: OperationNode): void {
  const used = new Set<string>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const node = value as Node;
    if (node.kind === 'Variable') used.add((node['name'] as { value: string }).value);
    for (const [key, child] of Object.entries(node)) if (key !== 'variableDefinitions') collect(child);
  };
  collect(op.selectionSet);
  op.variableDefinitions = (op.variableDefinitions ?? []).filter((def) =>
    used.has(((def['variable'] as Node)['name'] as { value: string }).value),
  );
}

/**
 * Ticks or unticks an argument. A ticked argument becomes a variable ($name)
 * declared on the operation, with a key in the variables JSON to fill in.
 */
export function toggleArgument(
  text: string,
  variables: string,
  schema: GraphQLSchema,
  operation: Operation,
  path: string[],
  arg: string,
  on: boolean,
): { query: string; variables: string } | null {
  const doc = parseDocument(text);
  if (!doc) return null;
  const op = operationFor(doc, operation);
  const info = fieldsAt(schema, operation, path.slice(0, -1)).find((f) => f.name === path.at(-1))?.args.find((a) => a.name === arg);
  if (!info) return null;
  const found = fieldAt(op, path, false);
  if (!found) {
    if (!on) return { query: text, variables };
    // Tick the field first, then come back for the argument.
    const added = toggleField(text, schema, operation, path, true);
    return added === null ? null : toggleArgument(added, variables, schema, operation, path, arg, true);
  }
  const field = found.field;
  field.arguments = (field.arguments ?? []).filter((a) => (a['name'] as { value: string }).value !== arg);
  let variable = arg;
  if (on) {
    // Reuse $arg if it already means the same type; otherwise number it.
    const defs = op.variableDefinitions ?? [];
    const typeOf = (name: string) => defs.find((d) => ((d['variable'] as Node)['name'] as { value: string }).value === name);
    for (let n = 2; typeOf(variable) && print(typeOf(variable)!['type'] as never) !== info.type; n++) variable = `${arg}${n}`;
    field.arguments.push({ kind: 'Argument', name: nameNode(arg), value: { kind: 'Variable', name: nameNode(variable) } });
    if (!typeOf(variable)) {
      defs.push({
        kind: 'VariableDefinition',
        variable: { kind: 'Variable', name: nameNode(variable) },
        type: JSON.parse(JSON.stringify(parseType(info.type, { noLocation: true }))),
        directives: [],
      });
    }
    op.variableDefinitions = defs;
  }
  pruneVariables(op);
  const declared = new Set((op.variableDefinitions ?? []).map((d) => ((d['variable'] as Node)['name'] as { value: string }).value));
  return { query: printDocument(doc), variables: syncVariables(variables, declared, on ? variable : null) };
}

/** Adds a key for a new variable and drops keys no longer declared, when the JSON can be read. */
function syncVariables(text: string, declared: Set<string>, added: string | null): string {
  let values: Record<string, unknown>;
  try {
    values = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return text;
  }
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return text;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) if (declared.has(key)) next[key] = value;
  if (added && !(added in next)) next[added] = null;
  return Object.keys(next).length ? JSON.stringify(next, null, 2) : '';
}

export interface QueryProblem {
  message: string;
  line?: number;
  column?: number;
}

/** Syntax errors, and with a schema, fields and arguments the server does not have. */
export function queryProblems(text: string, schema: GraphQLSchema | null): QueryProblem[] {
  if (!text.trim()) return [];
  let doc;
  try {
    doc = parse(text);
  } catch (e) {
    const error = e as { message: string; locations?: { line: number; column: number }[] };
    return [{ message: error.message, ...error.locations?.[0] }];
  }
  if (!schema) return [];
  return validate(schema, doc).map((error) => ({ message: error.message, ...error.locations?.[0] }));
}
