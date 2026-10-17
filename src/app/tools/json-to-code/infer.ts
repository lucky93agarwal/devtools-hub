import { JsonNode, parseTree } from '../json-formatter/json-tree';
import { makeUnique, pascalCase, singular } from './names';

/**
 * Works out the classes behind a JSON document, once for all languages. Every item
 * of a list is looked at, so a key missing from some items becomes optional and a
 * key that is sometimes null becomes nullable.
 */

export type Primitive = 'string' | 'int' | 'long' | 'double' | 'boolean';

export type FieldType =
  | { kind: 'primitive'; name: Primitive }
  /** Mixed types (for example a string in one item and a number in another), or only null seen. */
  | { kind: 'any' }
  | { kind: 'array'; item: FieldType; itemNullable: boolean }
  | { kind: 'object'; className: string };

export interface Field {
  /** The key exactly as in the JSON. */
  key: string;
  type: FieldType;
  /** null appeared as a value. */
  nullable: boolean;
  /** Missing from some of the objects. */
  optional: boolean;
}

export interface ClassModel {
  name: string;
  fields: Field[];
}

export interface CodeModel {
  /** The type of the whole document: a class, or a list of them. */
  root: FieldType;
  /** Root first, then each nested class in the order it first appears. */
  classes: ClassModel[];
}

export type InferResult = { ok: true; model: CodeModel } | { ok: false; message: string };

/** Everything seen at one place in the document, across all list items. */
interface Shape {
  nulls: boolean;
  primitives: Set<Primitive>;
  object?: ObjectShape;
  array?: Shape;
}

interface ObjectShape {
  /** How many objects were merged into this shape. */
  count: number;
  keys: Map<string, { count: number; shape: Shape }>;
}

const emptyShape = (): Shape => ({ nulls: false, primitives: new Set() });

const INT_MAX = 2_147_483_647n;
const LONG_MAX = 9_223_372_036_854_775_807n;

/** The type of a number written as `text`, kept exact thanks to the lossless parser. */
export function numberType(text: string): Primitive {
  if (!/^-?\d+$/.test(text)) return 'double';
  const value = BigInt(text);
  const size = value < 0n ? -value - 1n : value;
  if (size <= INT_MAX) return 'int';
  return size <= LONG_MAX ? 'long' : 'double';
}

function addToShape(shape: Shape, node: JsonNode): void {
  if (node.kind === 'object') {
    const object = (shape.object ??= { count: 0, keys: new Map() });
    object.count++;
    // A key repeated in one object counts once; the last value wins, as in JSON.parse.
    const seen = new Set<string>();
    for (const member of node.members) {
      const key = JSON.parse(member.rawKey) as string;
      let entry = object.keys.get(key);
      if (!entry) object.keys.set(key, (entry = { count: 0, shape: emptyShape() }));
      if (!seen.has(key)) entry.count++;
      seen.add(key);
      addToShape(entry.shape, member.value);
    }
  } else if (node.kind === 'array') {
    shape.array ??= emptyShape();
    for (const item of node.items) addToShape(shape.array, item);
  } else if (node.text === 'null') {
    shape.nulls = true;
  } else if (node.text === 'true' || node.text === 'false') {
    shape.primitives.add('boolean');
  } else if (node.text.startsWith('"')) {
    shape.primitives.add('string');
  } else {
    shape.primitives.add(numberType(node.text));
  }
}

/** One type for a set of primitives, widening numbers; null when they cannot share one. */
function mergePrimitives(primitives: Set<Primitive>): Primitive | null {
  if (primitives.size === 1) return [...primitives][0];
  const numbers: Primitive[] = ['int', 'long', 'double'];
  if (![...primitives].every((p) => numbers.includes(p))) return null;
  return primitives.has('double') ? 'double' : 'long';
}

class Namer {
  readonly classes: ClassModel[] = [];
  private readonly used: string[] = [];

  /** Makes a class for an object shape; `hint` is the key it was found under. */
  classFor(object: ObjectShape, hint: string): string {
    const [name] = makeUnique([pascalCase(hint)], this.used);
    this.used.push(name);
    const model: ClassModel = { name, fields: [] };
    this.classes.push(model);
    for (const [key, entry] of object.keys) {
      model.fields.push({
        key,
        type: this.typeOf(entry.shape, key),
        nullable: entry.shape.nulls,
        optional: entry.count < object.count,
      });
    }
    return name;
  }

  typeOf(shape: Shape, hint: string): FieldType {
    const kinds = (shape.primitives.size ? 1 : 0) + (shape.object ? 1 : 0) + (shape.array ? 1 : 0);
    if (kinds !== 1) return { kind: 'any' };
    if (shape.object) return { kind: 'object', className: this.classFor(shape.object, hint) };
    if (shape.array) {
      const item = shape.array;
      const empty = !item.primitives.size && !item.object && !item.array;
      return {
        kind: 'array',
        item: empty ? { kind: 'any' } : this.typeOf(item, singular(hint)),
        itemNullable: item.nulls,
      };
    }
    const primitive = mergePrimitives(shape.primitives);
    return primitive ? { kind: 'primitive', name: primitive } : { kind: 'any' };
  }
}

/** Builds the class model. `text` must already be valid JSON (the page checks it first). */
export function inferModel(text: string, rootName = 'Root'): InferResult {
  const node = parseTree(text);
  const shape = emptyShape();
  addToShape(shape, node);
  if (!hasObject(shape)) {
    return { ok: false, message: 'Classes are made from objects. Paste a JSON object, or a list of objects.' };
  }
  const namer = new Namer();
  // A top-level list is named after its items: a list of Root.
  const root: FieldType =
    node.kind === 'array'
      ? { kind: 'array', item: namer.typeOf(shape.array!, rootName), itemNullable: shape.array!.nulls }
      : namer.typeOf(shape, rootName);
  return { ok: true, model: { root, classes: namer.classes } };
}

function hasObject(shape: Shape): boolean {
  return !!shape.object || (!!shape.array && hasObject(shape.array));
}

/** The class a field or list ultimately holds, if any. */
export function innerClass(type: FieldType): string | null {
  if (type.kind === 'object') return type.className;
  if (type.kind === 'array') return innerClass(type.item);
  return null;
}
