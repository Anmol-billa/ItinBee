import { z } from 'zod';

/**
 * Converts a zod schema into the OpenAPI-3.0 *subset* that Gemini's `responseSchema` accepts.
 *
 * Supported (by Gemini): type (STRING|NUMBER|INTEGER|BOOLEAN|ARRAY|OBJECT), nullable, enum, format (enum|date-time),
 * description, properties, required, propertyOrdering, items, minItems, maxItems, minimum, maximum.
 * NOT supported and therefore never emitted: $ref, additionalProperties, oneOf/anyOf/allOf, default, const,
 * patterns, string length bounds, tuples, records, unions of different shapes.
 *
 * Constraints that Gemini cannot express (min/max length, regex, ...) are enforced afterwards by zod validation.
 */
export interface GeminiSchema {
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  description?: string;
  nullable?: boolean;
  enum?: string[];
  format?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: GeminiSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}

export class UnsupportedSchemaError extends Error {
  constructor(what: string) {
    super(`Cannot convert zod type to a Gemini responseSchema: ${what}`);
    this.name = 'UnsupportedSchemaError';
  }
}

interface Unwrapped {
  inner: z.ZodTypeAny;
  nullable: boolean;
  optional: boolean;
  description?: string;
}

function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let cur: z.ZodTypeAny = schema;
  let nullable = false;
  let optional = false;
  let description: string | undefined = schema.description;
  for (let i = 0; i < 12; i += 1) {
    const def = cur._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    switch (def.typeName) {
      case 'ZodNullable':
        nullable = true;
        cur = def.innerType as z.ZodTypeAny;
        break;
      case 'ZodOptional':
        optional = true;
        cur = def.innerType as z.ZodTypeAny;
        break;
      case 'ZodDefault':
        optional = true;
        cur = def.innerType as z.ZodTypeAny;
        break;
      case 'ZodEffects':
        cur = def.schema as z.ZodTypeAny;
        break;
      case 'ZodReadonly':
      case 'ZodBranded':
      case 'ZodCatch':
        cur = (def.innerType ?? (def as { type?: z.ZodTypeAny }).type) as z.ZodTypeAny;
        break;
      default:
        return { inner: cur, nullable, optional, description: description ?? cur.description };
    }
    description = description ?? cur.description;
  }
  throw new UnsupportedSchemaError('wrapper nesting too deep');
}

function convert(schema: z.ZodTypeAny): { schema: GeminiSchema; optional: boolean } {
  const { inner, nullable, optional, description } = unwrap(schema);
  const def = inner._def as { typeName?: string };
  const out = ((): GeminiSchema => {
    switch (def.typeName) {
      case 'ZodString':
        return { type: 'STRING' };
      case 'ZodNumber': {
        const checks = (inner as z.ZodNumber)._def.checks;
        const isInt = checks.some((c) => c.kind === 'int');
        const s: GeminiSchema = { type: isInt ? 'INTEGER' : 'NUMBER' };
        for (const c of checks) {
          if (c.kind === 'min') s.minimum = c.value;
          if (c.kind === 'max') s.maximum = c.value;
        }
        return s;
      }
      case 'ZodBoolean':
        return { type: 'BOOLEAN' };
      case 'ZodEnum':
        return { type: 'STRING', enum: [...(inner as z.ZodEnum<[string, ...string[]]>).options] };
      case 'ZodNativeEnum':
        throw new UnsupportedSchemaError('nativeEnum');
      case 'ZodLiteral': {
        const v = (inner as z.ZodLiteral<unknown>).value;
        if (typeof v === 'string') return { type: 'STRING', enum: [v] };
        if (typeof v === 'boolean') return { type: 'BOOLEAN' };
        if (typeof v === 'number') return { type: Number.isInteger(v) ? 'INTEGER' : 'NUMBER' };
        throw new UnsupportedSchemaError('literal');
      }
      case 'ZodArray': {
        const arr = inner as z.ZodArray<z.ZodTypeAny>;
        const s: GeminiSchema = { type: 'ARRAY', items: convert(arr.element).schema };
        if (arr._def.minLength) s.minItems = arr._def.minLength.value;
        if (arr._def.maxLength) s.maxItems = arr._def.maxLength.value;
        return s;
      }
      case 'ZodObject': {
        const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
        const properties: Record<string, GeminiSchema> = {};
        const required: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
          const c = convert(value as z.ZodTypeAny);
          properties[key] = c.schema;
          if (!c.optional) required.push(key);
        }
        const s: GeminiSchema = {
          type: 'OBJECT',
          properties,
          propertyOrdering: Object.keys(shape),
        };
        if (required.length > 0) s.required = required;
        return s;
      }
      default:
        throw new UnsupportedSchemaError(def.typeName ?? 'unknown');
    }
  })();
  if (nullable) out.nullable = true;
  if (description) out.description = description;
  return { schema: out, optional };
}

export function toGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  return convert(schema).schema;
}
