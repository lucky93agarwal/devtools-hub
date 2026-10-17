import { CodeModel, inferModel } from './infer';
import { toDart } from './generators/dart';
import { toSwift } from './generators/swift';
import { toCSharp, CSHARP_DEFAULTS } from './generators/csharp';
import { goName, toGo } from './generators/go';
import { toRust } from './generators/rust';
import { toPydantic, toPython } from './generators/python';
import { toPhp } from './generators/php';
import { toRuby } from './generators/ruby';

const model = (json: unknown): CodeModel => {
  const result = inferModel(JSON.stringify(json));
  if (!result.ok) throw new Error(result.message);
  return result.model;
};

/** A key renamed in most languages, a nested class, a list of classes and an optional, nullable key. */
const SAMPLE = model({
  user_id: 7,
  address: { city: 'Pune' },
  orders: [{ total: 1 }, { total: 2.5, coupon: null }],
});

describe('toDart', () => {
  const code = toDart(SAMPLE);

  it('writes fields, a constructor and fromJson/toJson', () => {
    expect(code).toContain('  final int userId;');
    expect(code).toContain('    required this.userId,');
    expect(code).toContain("        userId: json['user_id'] as int,");
    expect(code).toContain("        address: Address.fromJson(json['address'] as Map<String, dynamic>),");
    expect(code).toContain(
      "        orders: (json['orders'] as List<dynamic>).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList(),",
    );
    expect(code).toContain("        'orders': orders.map((e) => e.toJson()).toList(),");
  });

  it('reads JSON numbers into doubles safely and keeps optional values nullable', () => {
    expect(code).toContain("        total: (json['total'] as num).toDouble(),");
    expect(code).toContain('  final dynamic coupon;');
    expect(code).toContain('    this.coupon,');
  });

  it('writes json_serializable annotations', () => {
    const generated = toDart(SAMPLE, { style: 'json_serializable', finalFields: true });
    expect(generated).toContain("part 'root.g.dart';");
    expect(generated).toContain("  @JsonKey(name: 'user_id')\n  final int userId;");
    expect(generated).toContain('  factory Root.fromJson(Map<String, dynamic> json) => _$RootFromJson(json);');
  });

  it('escapes $ in keys, which Dart strings would read as interpolation', () => {
    expect(toDart(model({ $ref: 'x' }))).toContain("json['\\$ref'] as String");
  });
});

describe('toSwift', () => {
  it('writes Codable structs with CodingKeys only where names change', () => {
    const code = toSwift(SAMPLE);
    expect(code).toContain('struct Root: Codable {\n    let userId: Int');
    expect(code).toContain('    enum CodingKeys: String, CodingKey {\n        case userId = "user_id"');
    expect(code).toContain('struct Address: Codable {\n    let city: String\n}');
    expect(code).toContain('    let coupon: JSONValue?');
    expect(code).toContain('enum JSONValue: Codable, Equatable {');
  });

  it('writes final classes with var, and escapes keywords', () => {
    const code = toSwift(model({ default: 1 }), { declaration: 'class', mutable: true, protocol: 'Decodable' });
    expect(code).toContain('final class Root: Decodable {\n    var `default`: Int\n}');
    expect(code).not.toContain('JSONValue');
  });
});

describe('toCSharp', () => {
  it('writes classes with System.Text.Json names and safe defaults', () => {
    const code = toCSharp(SAMPLE);
    expect(code).toContain('#nullable enable');
    expect(code).toContain('    [JsonPropertyName("user_id")]\n    public int UserId { get; set; }');
    expect(code).toContain('    public Address Address { get; set; } = new Address();');
    expect(code).toContain('    public JsonElement? Coupon { get; set; }');
  });

  it('writes Newtonsoft records', () => {
    const code = toCSharp(model({ id: 1 }), { ...CSHARP_DEFAULTS, library: 'newtonsoft', declaration: 'record' });
    expect(code).toContain('using Newtonsoft.Json;');
    expect(code).toContain('public record Root(\n    [property: JsonProperty("id")] int Id\n);');
  });
});

describe('toGo', () => {
  it('uses Go initialisms', () => {
    expect(goName('user_id')).toBe('UserID');
    expect(goName('avatarUrl')).toBe('AvatarURL');
    expect(goName('2fa')).toBe('F2fa');
  });

  it('writes aligned structs with json tags', () => {
    const code = toGo(SAMPLE);
    expect(code).toContain('type Root struct {\n\tUserID  int     `json:"user_id"`\n\tAddress Address `json:"address"`\n\tOrders  []Order `json:"orders"`\n}');
    expect(code).toContain('\tCoupon any     `json:"coupon,omitempty"`');
  });

  it('uses pointers for optional values', () => {
    const code = toGo(model([{ a: 1 }, { b: 'x' }]));
    expect(code).toContain('\tA *int    `json:"a,omitempty"`');
  });
});

describe('toRust', () => {
  it('writes serde structs, renaming only where needed', () => {
    const code = toRust(model({ userId: 1, type: 'a', items: [{ x: 1 }, {}] }));
    expect(code).toContain('    #[serde(rename = "userId")]\n    pub user_id: i32,');
    expect(code).toContain('    pub r#type: String,');
    expect(code).toContain('    pub x: Option<i32>,');
  });

  it('makes missing values of unknown type optional too', () => {
    expect(toRust(SAMPLE)).toContain('    pub coupon: Option<serde_json::Value>,');
  });
});

describe('toPython', () => {
  const code = toPython(SAMPLE);

  it('defines nested classes first and optional fields last', () => {
    expect(code.indexOf('class Order:')).toBeLessThan(code.indexOf('class Root:'));
    expect(code).toContain('class Order:\n    total: float\n    coupon: Any = None');
  });

  it('maps keys and nested classes in from_dict and to_dict', () => {
    expect(code).toContain('            orders=[Order.from_dict(x) for x in data["orders"]],');
    expect(code).toContain('            total=float(data["total"]),');
    expect(code).toContain('            coupon=data.get("coupon"),');
    expect(code).toContain('            "address": self.address.to_dict(),');
  });

  it('writes Pydantic models with aliases', () => {
    const pydantic = toPydantic(model({ userId: 1, maybe: null }));
    expect(pydantic).toContain('from pydantic import BaseModel, ConfigDict, Field');
    expect(pydantic).toContain('    model_config = ConfigDict(populate_by_name=True)');
    expect(pydantic).toContain('    user_id: int = Field(alias="userId")');
    expect(pydantic).toContain('    maybe: Any = None');
  });
});

describe('toPhp', () => {
  const code = toPhp(SAMPLE);

  it('writes readonly constructor properties with array types in PHPDoc', () => {
    expect(code).toContain('     * @param list<Order> $orders');
    expect(code).toContain('        public readonly int $userId,');
    expect(code).toContain('        public readonly mixed $coupon = null,');
  });

  it('maps arrays in fromArray and toArray', () => {
    expect(code).toContain("            orders: array_map(fn ($item) => Order::fromArray($item), $data['orders']),");
    expect(code).toContain("            coupon: $data['coupon'] ?? null,");
    expect(code).toContain("            'orders' => array_map(fn ($item) => $item->toArray(), $this->orders),");
  });

  it('puts required parameters before optional ones', () => {
    const php = toPhp(model([{ a: null, b: 1 }]));
    expect(php.indexOf('int $b')).toBeLessThan(php.indexOf('mixed $a'));
  });
});

describe('toRuby', () => {
  it('writes keyword initializers with from_hash and to_h', () => {
    const code = toRuby(SAMPLE);
    expect(code).toContain('  attr_reader :user_id, :address, :orders');
    expect(code).toContain('  def initialize(total:, coupon: nil)');
    expect(code).toContain('      orders: hash["orders"].map { |item| Order.from_hash(item) },');
    expect(code).toContain('      "address" => @address.to_h,');
  });

  it('guards optional nested objects', () => {
    const code = toRuby(model([{ a: { x: 1 } }, {}]));
    expect(code).toContain('      a: hash["a"] && A.from_hash(hash["a"]),');
    expect(code).toContain('      "a" => @a&.to_h,');
  });
});
