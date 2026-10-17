import { CodeModel, inferModel } from './infer';
import { KOTLIN_DEFAULTS, toKotlin } from './generators/kotlin';
import { JAVA_DEFAULTS, toJava } from './generators/java';
import { TYPESCRIPT_DEFAULTS, toTypeScript } from './generators/typescript';
import { TARGETS, optionsFor } from './targets';

const model = (json: unknown): CodeModel => {
  const result = inferModel(JSON.stringify(json));
  if (!result.ok) throw new Error(result.message);
  return result.model;
};

const SAMPLE = {
  id: 1,
  user_name: 'Ada',
  class: 'admin',
  big: 9007199254740993,
  tags: ['a'],
  address: { city: 'Pune' },
  orders: [{ total: 9.5 }, { total: 3, note: null }],
};

describe('toKotlin', () => {
  it('writes kotlinx.serialization data classes', () => {
    expect(toKotlin(model(SAMPLE))).toBe(`import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Root(
    val id: Int,
    @SerialName("user_name") val userName: String,
    val \`class\`: String,
    val big: Long,
    val tags: List<String>,
    val address: Address,
    val orders: List<Order>,
)

@Serializable
data class Address(
    val city: String,
)

@Serializable
data class Order(
    val total: Double,
    val note: JsonElement? = null,
)
`.replace('import kotlinx.serialization.Serializable', 'import kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.JsonElement'));
  });

  it('annotates every property for Gson, so release builds keep the names', () => {
    const code = toKotlin(model({ id: 1 }), { ...KOTLIN_DEFAULTS, library: 'gson' });
    expect(code).toContain('import com.google.gson.annotations.SerializedName');
    expect(code).toContain('@SerializedName("id") val id: Int,');
  });

  it('writes Moshi adapters and plain classes', () => {
    const moshi = toKotlin(model({ user_id: 1 }), { ...KOTLIN_DEFAULTS, library: 'moshi' });
    expect(moshi).toContain('@JsonClass(generateAdapter = true)');
    expect(moshi).toContain('@Json(name = "user_id") val userId: Int,');
    const plain = toKotlin(model({ x: null }), { ...KOTLIN_DEFAULTS, library: 'none', mutable: true });
    expect(plain).toBe('data class Root(\n    var x: Any? = null,\n)\n');
  });

  it('can make everything nullable, and handles empty objects and top-level lists', () => {
    const code = toKotlin(model([{ a: 1, meta: {} }]), { ...KOTLIN_DEFAULTS, library: 'none', allNullable: true });
    expect(code).toContain('// The JSON is a list. Read it as List<Root>.');
    expect(code).toContain('val a: Int? = null,');
    expect(code).toContain('class Meta\n');
  });
});

describe('toJava', () => {
  it('writes one file with nested static classes, getters and setters', () => {
    const code = toJava(model({ user_name: 'Ada', address: { city: 'Pune' }, tags: ['x'] }));
    expect(code).toBe(`import java.util.List;

public class Root {
    private String userName;
    private Address address;
    private List<String> tags;

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public Address getAddress() {
        return address;
    }

    public void setAddress(Address address) {
        this.address = address;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public static class Address {
        private String city;

        public String getCity() {
            return city;
        }

        public void setCity(String city) {
            this.city = city;
        }
    }
}
`);
  });

  it('writes Jackson records and avoids keywords', () => {
    const code = toJava(model({ class: 'a', count: 1, child: { ok: true } }), { library: 'jackson', style: 'record' });
    expect(code).toBe(`import com.fasterxml.jackson.annotation.JsonProperty;

public record Root(
    @JsonProperty("class") String class_,
    @JsonProperty("count") Integer count,
    @JsonProperty("child") Child child
) {

    public record Child(
        @JsonProperty("ok") Boolean ok
    ) {
    }
}
`);
  });

  it('writes public fields with Gson names', () => {
    const code = toJava(model({ id: 1 }), { ...JAVA_DEFAULTS, library: 'gson', style: 'fields' });
    expect(code).toContain('    @SerializedName("id")\n    public Integer id;');
  });
});

describe('toTypeScript', () => {
  it('writes interfaces with optional and nullable keys, keeping key names', () => {
    expect(toTypeScript(model({ 'user-name': 'a', items: [{ id: 1 }, { id: 2, note: null }], tags: [null, 'x'] })))
      .toBe(`export interface Root {
  "user-name": string;
  items: Item[];
  tags: (string | null)[];
}

export interface Item {
  id: number;
  note?: unknown;
}
`);
  });

  it('writes readonly types and a list type for a top-level list', () => {
    const code = toTypeScript(model([{ a: true }]), { ...TYPESCRIPT_DEFAULTS, declaration: 'type', readonly: true });
    expect(code).toBe('export type RootList = Root[];\n\nexport type Root = {\n  readonly a: boolean;\n};\n');
  });
});

describe('TARGETS', () => {
  it('produces code for every entry without throwing', () => {
    for (const target of TARGETS) {
      expect(target.language.generate(model(SAMPLE), optionsFor(target)).length, target.id).toBeGreaterThan(20);
    }
  });

  it('has unique ids', () => {
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
  });
});
