/** Starting programs for the Kotlin Playground. */
export const KOTLIN_SAMPLES: { label: string; code: string }[] = [
  {
    label: 'Hello',
    code: `fun main() {
    val name = "DevTools24"
    println("Hello, $name!")
    for (i in 1..3) println("Line $i")
}`,
  },
  {
    label: 'Data classes',
    code: `data class Order(val id: Int, val total: Double, val paid: Boolean)

fun main() {
    val orders = listOf(
        Order(1, 499.0, true),
        Order(2, 120.5, false),
        Order(3, 899.0, true),
    )
    val paid = orders.filter { it.paid }
    println("Paid: \${paid.map { it.id }}")
    println("Revenue: \${paid.sumOf { it.total }}")
    println(orders.first().copy(paid = false))
}`,
  },
  {
    label: 'Null safety',
    code: `fun lengthOf(text: String?): Int = text?.length ?: 0

fun main() {
    val values = listOf("kotlin", null, "android")
    values.forEach { println("\${it ?: "(null)"} -> \${lengthOf(it)}") }
}`,
  },
  {
    label: 'Sealed classes',
    code: `sealed interface Result<out T> {
    data class Success<T>(val value: T) : Result<T>
    data class Failure(val error: String) : Result<Nothing>
}

fun parse(text: String): Result<Int> =
    text.toIntOrNull()?.let { Result.Success(it) } ?: Result.Failure("Not a number: $text")

fun main() {
    for (input in listOf("42", "abc")) {
        when (val r = parse(input)) {
            is Result.Success -> println("Got \${r.value}")
            is Result.Failure -> println(r.error)
        }
    }
}`,
  },
  {
    label: 'Extension functions',
    code: `fun String.toSlug() = lowercase().trim().replace(Regex("[^a-z0-9]+"), "-").trim('-')

fun main() {
    println("Hello World from Kotlin!".toSlug())
    println(listOf(3, 1, 2).sorted().joinToString(prefix = "[", postfix = "]"))
}`,
  },
];
