/**
 * The request as code in many languages, like Postman's code snippets. Every
 * generator works from the request as it will be sent: variables filled in,
 * auth and signatures applied.
 */
import { PreparedRequest } from './build';
import { shellQuote, toCurl, toFetchCode } from './curl';

/** A request reduced to what code needs. */
interface Req {
  method: string;
  url: string;
  headers: [string, string][];
  /** Raw, JSON, urlencoded or GraphQL bodies, as text. */
  text: string | null;
  /** form-data fields and files (field name, file name). */
  fields: [string, string][];
  files: [string, string][];
  /** A binary body: the file's name. */
  file: string | null;
}

export interface SnippetLanguage {
  id: string;
  label: string;
  /** Monaco language for colouring. */
  editor: string;
  build: (req: Req, prepared: PreparedRequest) => string;
}

const q = (text: string) => JSON.stringify(text);
const single = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const psQuote = (text: string) => `'${text.replace(/'/g, "''")}'`;
const isForm = (r: Req) => r.text === null && !r.file && (r.fields.length > 0 || r.files.length > 0);
/** Multipart bodies set their own Content-Type with the boundary. */
const headersFor = (r: Req) => (isForm(r) ? r.headers.filter(([n]) => !/^content-type$/i.test(n)) : r.headers);
const lines = (...parts: (string | false | null | undefined)[]) => parts.filter((p) => p !== false && p !== null && p !== undefined).join('\n');
const indent = (text: string, by = '  ') => text.split('\n').map((l) => (l ? by + l : l)).join('\n');
const cap = (m: string) => m[0].toUpperCase() + m.slice(1).toLowerCase();

function toReq(p: PreparedRequest): Req {
  return {
    method: p.method,
    url: p.url,
    headers: p.headers,
    text: p.bodyText,
    fields: p.formFields,
    files: p.formFiles ?? [],
    file: p.bodyFile ?? null,
  };
}

export const SNIPPET_LANGUAGES: SnippetLanguage[] = [
  {
    id: 'c-libcurl',
    label: 'C - libcurl',
    editor: 'c',
    build: (r) =>
      lines(
        'CURL *curl = curl_easy_init();',
        'if (curl) {',
        indent(
          lines(
            `curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, ${q(r.method)});`,
            `curl_easy_setopt(curl, CURLOPT_URL, ${q(r.url)});`,
            'curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);',
            'struct curl_slist *headers = NULL;',
            ...headersFor(r).map(([n, v]) => `headers = curl_slist_append(headers, ${q(`${n}: ${v}`)});`),
            'curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);',
            r.text !== null && `curl_easy_setopt(curl, CURLOPT_POSTFIELDS, ${q(r.text)});`,
            isForm(r) &&
              lines(
                'curl_mime *mime = curl_mime_init(curl);',
                'curl_mimepart *part;',
                ...r.fields.map(([n, v]) => `part = curl_mime_addpart(mime);\ncurl_mime_name(part, ${q(n)});\ncurl_mime_data(part, ${q(v)}, CURL_ZERO_TERMINATED);`),
                ...r.files.map(([n, f]) => `part = curl_mime_addpart(mime);\ncurl_mime_name(part, ${q(n)});\ncurl_mime_filedata(part, ${q(f)});`),
                'curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);',
              ),
            r.file && `/* Binary body: read ${r.file} and pass it with CURLOPT_POSTFIELDS and CURLOPT_POSTFIELDSIZE. */`,
            'CURLcode res = curl_easy_perform(curl);',
            isForm(r) && 'curl_mime_free(mime);',
            'curl_slist_free_all(headers);',
          ),
          '  ',
        ),
        '}',
        'curl_easy_cleanup(curl);',
      ),
  },
  {
    id: 'csharp-httpclient',
    label: 'C# - HttpClient',
    editor: 'csharp',
    build: (r) => {
      const contentType = r.headers.find(([n]) => /^content-type$/i.test(n))?.[1];
      return lines(
        'var client = new HttpClient();',
        `var request = new HttpRequestMessage(new HttpMethod(${q(r.method)}), ${q(r.url)});`,
        ...headersFor(r)
          .filter(([n]) => !/^content-type$/i.test(n))
          .map(([n, v]) => `request.Headers.TryAddWithoutValidation(${q(n)}, ${q(v)});`),
        r.text !== null && `request.Content = new StringContent(${q(r.text)}, null, ${q((contentType ?? 'text/plain').split(';')[0])});`,
        isForm(r) &&
          lines(
            'var content = new MultipartFormDataContent();',
            ...r.fields.map(([n, v]) => `content.Add(new StringContent(${q(v)}), ${q(n)});`),
            ...r.files.map(([n, f]) => `content.Add(new StreamContent(File.OpenRead(${q(f)})), ${q(n)}, ${q(f)});`),
            'request.Content = content;',
          ),
        r.file && `request.Content = new StreamContent(File.OpenRead(${q(r.file)}));`,
        'var response = await client.SendAsync(request);',
        'response.EnsureSuccessStatusCode();',
        'Console.WriteLine(await response.Content.ReadAsStringAsync());',
      );
    },
  },
  {
    id: 'csharp-restsharp',
    label: 'C# - RestSharp',
    editor: 'csharp',
    build: (r) =>
      lines(
        `var client = new RestClient(${q(r.url)});`,
        `var request = new RestRequest("", Method.${cap(r.method)});`,
        ...headersFor(r).map(([n, v]) => `request.AddHeader(${q(n)}, ${q(v)});`),
        r.text !== null && `request.AddStringBody(${q(r.text)}, DataFormat.None);`,
        isForm(r) && 'request.AlwaysMultipartFormData = true;',
        ...r.fields.map(([n, v]) => `request.AddParameter(${q(n)}, ${q(v)});`),
        ...r.files.map(([n, f]) => `request.AddFile(${q(n)}, ${q(f)});`),
        r.file && `request.AddParameter("application/octet-stream", File.ReadAllBytes(${q(r.file)}), ParameterType.RequestBody);`,
        'RestResponse response = await client.ExecuteAsync(request);',
        'Console.WriteLine(response.Content);',
      ),
  },
  { id: 'curl', label: 'cURL', editor: 'shell', build: (_r, p) => toCurl(p) },
  {
    id: 'dart-dio',
    label: 'Dart - dio',
    editor: 'dart',
    build: (r) =>
      lines(
        'var dio = Dio();',
        isForm(r) &&
          lines(
            'var data = FormData.fromMap({',
            ...r.fields.map(([n, v]) => `  ${q(n)}: ${q(v)},`),
            ...r.files.map(([n, f]) => `  ${q(n)}: await MultipartFile.fromFile(${q(f)}),`),
            '});',
          ),
        r.text !== null && `var data = ${q(r.text)};`,
        r.file && `var data = File(${q(r.file)}).openRead();`,
        'var response = await dio.request(',
        `  ${q(r.url)},`,
        '  options: Options(',
        `    method: ${q(r.method)},`,
        '    headers: {',
        ...headersFor(r).map(([n, v]) => `      ${q(n)}: ${q(v)},`),
        '    },',
        '  ),',
        (r.text !== null || isForm(r) || r.file) && '  data: data,',
        ');',
        'print(response.data);',
      ),
  },
  {
    id: 'dart-http',
    label: 'Dart - http',
    editor: 'dart',
    build: (r) =>
      isForm(r)
        ? lines(
            `var request = http.MultipartRequest(${q(r.method)}, Uri.parse(${q(r.url)}));`,
            ...headersFor(r).map(([n, v]) => `request.headers[${q(n)}] = ${q(v)};`),
            ...r.fields.map(([n, v]) => `request.fields[${q(n)}] = ${q(v)};`),
            ...r.files.map(([n, f]) => `request.files.add(await http.MultipartFile.fromPath(${q(n)}, ${q(f)}));`),
            'var response = await request.send();',
            'print(await response.stream.bytesToString());',
          )
        : lines(
            `var request = http.Request(${q(r.method)}, Uri.parse(${q(r.url)}));`,
            ...headersFor(r).map(([n, v]) => `request.headers[${q(n)}] = ${q(v)};`),
            r.text !== null && `request.body = ${q(r.text)};`,
            r.file && `request.bodyBytes = await File(${q(r.file)}).readAsBytes();`,
            'var response = await request.send();',
            'print(await response.stream.bytesToString());',
          ),
  },
  {
    id: 'go',
    label: 'Go - Native',
    editor: 'go',
    build: (r) =>
      lines(
        'package main',
        '',
        'import (',
        '  "fmt"',
        '  "io"',
        '  "net/http"',
        r.text !== null && '  "strings"',
        (isForm(r) || r.file) && '  "bytes"\n  "mime/multipart"\n  "os"',
        ')',
        '',
        'func main() {',
        indent(
          lines(
            r.text !== null && `payload := strings.NewReader(${q(r.text)})`,
            isForm(r) &&
              lines(
                'payload := &bytes.Buffer{}',
                'writer := multipart.NewWriter(payload)',
                ...r.fields.map(([n, v]) => `_ = writer.WriteField(${q(n)}, ${q(v)})`),
                ...r.files.map(
                  ([n, f]) => `file, _ := os.Open(${q(f)})\npart, _ := writer.CreateFormFile(${q(n)}, ${q(f)})\n_, _ = io.Copy(part, file)\nfile.Close()`,
                ),
                'writer.Close()',
              ),
            r.file && `payload, _ := os.Open(${q(r.file)})`,
            `req, err := http.NewRequest(${q(r.method)}, ${q(r.url)}, ${r.text !== null || isForm(r) || r.file ? 'payload' : 'nil'})`,
            'if err != nil {\n  fmt.Println(err)\n  return\n}',
            ...headersFor(r).map(([n, v]) => `req.Header.Add(${q(n)}, ${q(v)})`),
            isForm(r) && 'req.Header.Set("Content-Type", writer.FormDataContentType())',
            'res, err := http.DefaultClient.Do(req)',
            'if err != nil {\n  fmt.Println(err)\n  return\n}',
            'defer res.Body.Close()',
            'body, _ := io.ReadAll(res.Body)',
            'fmt.Println(string(body))',
          ),
        ),
        '}',
      ),
  },
  {
    id: 'http',
    label: 'HTTP',
    editor: 'plaintext',
    build: (r) => {
      const url = new URL(r.url);
      return lines(
        `${r.method} ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        ...headersFor(r).map(([n, v]) => `${n}: ${v}`),
        isForm(r) && 'Content-Type: multipart/form-data; boundary=----Boundary',
        r.text !== null && `Content-Length: ${new TextEncoder().encode(r.text).length}\n\n${r.text}`,
        isForm(r) &&
          '\n' +
            [
              ...r.fields.map(([n, v]) => `------Boundary\nContent-Disposition: form-data; name="${n}"\n\n${v}`),
              ...r.files.map(([n, f]) => `------Boundary\nContent-Disposition: form-data; name="${n}"; filename="${f}"\n\n(contents of ${f})`),
            ].join('\n') +
            '\n------Boundary--',
        r.file && `\n(contents of ${r.file})`,
      );
    },
  },
  {
    id: 'java-okhttp',
    label: 'Java - OkHttp',
    editor: 'java',
    build: (r) =>
      lines(
        'OkHttpClient client = new OkHttpClient().newBuilder().build();',
        okHttpBody(r, 'java'),
        'Request request = new Request.Builder()',
        `  .url(${q(r.url)})`,
        `  .method(${q(r.method)}, ${hasBody(r) ? 'body' : 'null'})`,
        ...headersFor(r).map(([n, v]) => `  .addHeader(${q(n)}, ${q(v)})`),
        '  .build();',
        'Response response = client.newCall(request).execute();',
        'System.out.println(response.body().string());',
      ),
  },
  {
    id: 'java-unirest',
    label: 'Java - Unirest',
    editor: 'java',
    build: (r) =>
      lines(
        `HttpResponse<String> response = Unirest.${r.method.toLowerCase() === 'delete' ? 'delete' : r.method.toLowerCase()}(${q(r.url)})`,
        ...headersFor(r).map(([n, v]) => `  .header(${q(n)}, ${q(v)})`),
        ...r.fields.map(([n, v]) => `  .field(${q(n)}, ${q(v)})`),
        ...r.files.map(([n, f]) => `  .field(${q(n)}, new File(${q(f)}))`),
        r.text !== null && `  .body(${q(r.text)})`,
        r.file && `  .body(Files.readAllBytes(Paths.get(${q(r.file)})))`,
        '  .asString();',
        'System.out.println(response.getBody());',
      ),
  },
  { id: 'js-fetch', label: 'JavaScript - Fetch', editor: 'javascript', build: (_r, p) => toFetchCode(p) },
  {
    id: 'js-jquery',
    label: 'JavaScript - jQuery',
    editor: 'javascript',
    build: (r) =>
      lines(
        formJs(r),
        'const settings = {',
        `  url: ${q(r.url)},`,
        `  method: ${q(r.method)},`,
        '  timeout: 0,',
        headersFor(r).length > 0 && `  headers: {\n${headersFor(r).map(([n, v]) => `    ${q(n)}: ${q(v)},`).join('\n')}\n  },`,
        isForm(r) && '  processData: false,\n  contentType: false,\n  data: form,',
        r.text !== null && `  data: ${q(r.text)},`,
        r.file && '  processData: false,\n  data: fileInput.files[0],',
        '};',
        '',
        '$.ajax(settings).done((response) => console.log(response));',
      ),
  },
  {
    id: 'js-xhr',
    label: 'JavaScript - XHR',
    editor: 'javascript',
    build: (r) =>
      lines(
        formJs(r),
        r.text !== null && `const data = ${q(r.text)};`,
        'const xhr = new XMLHttpRequest();',
        'xhr.addEventListener("readystatechange", function () {',
        '  if (this.readyState === 4) console.log(this.responseText);',
        '});',
        `xhr.open(${q(r.method)}, ${q(r.url)});`,
        ...headersFor(r).map(([n, v]) => `xhr.setRequestHeader(${q(n)}, ${q(v)});`),
        `xhr.send(${isForm(r) ? 'form' : r.text !== null ? 'data' : r.file ? 'fileInput.files[0]' : ''});`,
      ),
  },
  {
    id: 'kotlin-okhttp',
    label: 'Kotlin - Okhttp',
    editor: 'kotlin',
    build: (r) =>
      lines(
        'val client = OkHttpClient()',
        okHttpBody(r, 'kotlin'),
        'val request = Request.Builder()',
        `  .url(${q(r.url)})`,
        `  .method(${q(r.method)}, ${hasBody(r) ? 'body' : 'null'})`,
        ...headersFor(r).map(([n, v]) => `  .addHeader(${q(n)}, ${q(v)})`),
        '  .build()',
        'val response = client.newCall(request).execute()',
        'println(response.body?.string())',
      ),
  },
  {
    id: 'node-axios',
    label: 'NodeJs - Axios',
    editor: 'javascript',
    build: (r) =>
      lines(
        "const axios = require('axios');",
        isForm(r) && "const FormData = require('form-data');\nconst fs = require('fs');",
        r.file && "const fs = require('fs');",
        formNode(r),
        '',
        'axios',
        '  .request({',
        `    method: ${q(r.method.toLowerCase())},`,
        `    url: ${q(r.url)},`,
        '    maxBodyLength: Infinity,',
        `    headers: {\n${[...headersFor(r).map(([n, v]) => `      ${q(n)}: ${q(v)},`), isForm(r) ? '      ...form.getHeaders(),' : ''].filter(Boolean).join('\n')}\n    },`,
        r.text !== null && `    data: ${q(r.text)},`,
        isForm(r) && '    data: form,',
        r.file && `    data: fs.createReadStream(${q(r.file)}),`,
        '  })',
        '  .then((response) => console.log(JSON.stringify(response.data)))',
        '  .catch((error) => console.log(error));',
      ),
  },
  {
    id: 'node-native',
    label: 'NodeJs - Native',
    editor: 'javascript',
    build: (r) => {
      const url = new URL(r.url);
      const lib = url.protocol === 'http:' ? 'http' : 'https';
      return lines(
        `const ${lib} = require('${lib}');`,
        (isForm(r) || r.file) && "const fs = require('fs');",
        isForm(r) && "const FormData = require('form-data');",
        formNode(r),
        '',
        'const options = {',
        `  method: ${q(r.method)},`,
        `  hostname: ${q(url.hostname)},`,
        url.port && `  port: ${url.port},`,
        `  path: ${q(url.pathname + url.search)},`,
        `  headers: {\n${[...headersFor(r).map(([n, v]) => `    ${q(n)}: ${q(v)},`), isForm(r) ? '    ...form.getHeaders(),' : ''].filter(Boolean).join('\n')}\n  },`,
        '};',
        '',
        `const req = ${lib}.request(options, (res) => {`,
        '  const chunks = [];',
        '  res.on("data", (chunk) => chunks.push(chunk));',
        '  res.on("end", () => console.log(Buffer.concat(chunks).toString()));',
        '});',
        r.text !== null && `req.write(${q(r.text)});`,
        isForm(r) && 'form.pipe(req);',
        r.file && `fs.createReadStream(${q(r.file)}).pipe(req);`,
        !r.file && !isForm(r) && 'req.end();',
      );
    },
  },
  {
    id: 'node-request',
    label: 'NodeJs - Request',
    editor: 'javascript',
    build: (r) =>
      lines(
        "const request = require('request');",
        (isForm(r) || r.file) && "const fs = require('fs');",
        'const options = {',
        `  method: ${q(r.method)},`,
        `  url: ${q(r.url)},`,
        `  headers: {\n${headersFor(r).map(([n, v]) => `    ${q(n)}: ${q(v)},`).join('\n')}\n  },`,
        r.text !== null && `  body: ${q(r.text)},`,
        isForm(r) &&
          `  formData: {\n${[...r.fields.map(([n, v]) => `    ${q(n)}: ${q(v)},`), ...r.files.map(([n, f]) => `    ${q(n)}: fs.createReadStream(${q(f)}),`)].join('\n')}\n  },`,
        r.file && `  body: fs.readFileSync(${q(r.file)}),`,
        '};',
        'request(options, (error, response) => {',
        '  if (error) throw new Error(error);',
        '  console.log(response.body);',
        '});',
      ),
  },
  {
    id: 'node-unirest',
    label: 'NodeJs - Unirest',
    editor: 'javascript',
    build: (r) =>
      lines(
        "const unirest = require('unirest');",
        `unirest(${q(r.method)}, ${q(r.url)})`,
        headersFor(r).length > 0 && `  .headers({\n${headersFor(r).map(([n, v]) => `    ${q(n)}: ${q(v)},`).join('\n')}\n  })`,
        r.text !== null && `  .send(${q(r.text)})`,
        ...r.fields.map(([n, v]) => `  .field(${q(n)}, ${q(v)})`),
        ...r.files.map(([n, f]) => `  .attach(${q(n)}, ${q(f)})`),
        r.file && `  .send(require('fs').readFileSync(${q(r.file)}))`,
        '  .end((res) => {',
        '    if (res.error) throw new Error(res.error);',
        '    console.log(res.raw_body);',
        '  });',
      ),
  },
  {
    id: 'objc',
    label: 'Objective-C - NSURLSession',
    editor: 'objective-c',
    build: (r) =>
      lines(
        '#import <Foundation/Foundation.h>',
        '',
        `NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@${q(r.url)}]];`,
        `[request setHTTPMethod:@${q(r.method)}];`,
        ...headersFor(r).map(([n, v]) => `[request setValue:@${q(v)} forHTTPHeaderField:@${q(n)}];`),
        r.text !== null && `[request setHTTPBody:[@${q(r.text)} dataUsingEncoding:NSUTF8StringEncoding]];`,
        formNote(r, '//'),
        r.file && `[request setHTTPBody:[NSData dataWithContentsOfFile:@${q(r.file)}]];`,
        'NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request',
        '  completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {',
        '    if (error) { NSLog(@"%@", error); return; }',
        '    NSLog(@"%@", [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);',
        '  }];',
        '[task resume];',
      ),
  },
  {
    id: 'ocaml',
    label: 'OCaml - Cohttp',
    editor: 'plaintext',
    build: (r) =>
      lines(
        'open Lwt',
        'open Cohttp',
        'open Cohttp_lwt_unix',
        '',
        'let reqBody =',
        `  let uri = Uri.of_string ${q(r.url)} in`,
        `  let headers = Header.init () ${headersFor(r).map(([n, v]) => `|> fun h -> Header.add h ${q(n)} ${q(v)}`).join(' ')} in`,
        formNote(r, '  (*') && `${formNote(r, '  (*')} *)`,
        r.text !== null && `  let body = Cohttp_lwt.Body.of_string ${q(r.text)} in`,
        `  Client.call ~headers${r.text !== null ? ' ~body' : ''} (Code.method_of_string ${q(r.method)}) uri >>= fun (_resp, body) ->`,
        '  body |> Cohttp_lwt.Body.to_string >|= fun body -> body',
        '',
        'let () =',
        '  let respBody = Lwt_main.run reqBody in',
        '  print_endline respBody',
      ),
  },
  {
    id: 'php-curl',
    label: 'PHP - cURL',
    editor: 'php',
    build: (r) =>
      lines(
        '<?php',
        '$curl = curl_init();',
        'curl_setopt_array($curl, [',
        `  CURLOPT_URL => ${single(r.url)},`,
        '  CURLOPT_RETURNTRANSFER => true,',
        '  CURLOPT_FOLLOWLOCATION => true,',
        `  CURLOPT_CUSTOMREQUEST => ${single(r.method)},`,
        r.text !== null && `  CURLOPT_POSTFIELDS => ${single(r.text)},`,
        isForm(r) &&
          `  CURLOPT_POSTFIELDS => [${[...r.fields.map(([n, v]) => `${single(n)} => ${single(v)}`), ...r.files.map(([n, f]) => `${single(n)} => new CURLFile(${single(f)})`)].join(', ')}],`,
        r.file && `  CURLOPT_POSTFIELDS => file_get_contents(${single(r.file)}),`,
        `  CURLOPT_HTTPHEADER => [${headersFor(r).map(([n, v]) => single(`${n}: ${v}`)).join(', ')}],`,
        ']);',
        '$response = curl_exec($curl);',
        'curl_close($curl);',
        'echo $response;',
      ),
  },
  {
    id: 'php-guzzle',
    label: 'PHP - Guzzle',
    editor: 'php',
    build: (r) =>
      lines(
        '<?php',
        '$client = new GuzzleHttp\\Client();',
        `$headers = [${headersFor(r).map(([n, v]) => `${single(n)} => ${single(v)}`).join(', ')}];`,
        isForm(r)
          ? lines(
              `$options = ['multipart' => [`,
              ...r.fields.map(([n, v]) => `  ['name' => ${single(n)}, 'contents' => ${single(v)}],`),
              ...r.files.map(([n, f]) => `  ['name' => ${single(n)}, 'contents' => GuzzleHttp\\Psr7\\Utils::tryFopen(${single(f)}, 'r'), 'filename' => ${single(f)}],`),
              ']];',
              `$request = new GuzzleHttp\\Psr7\\Request(${single(r.method)}, ${single(r.url)}, $headers);`,
              '$res = $client->send($request, $options);',
            )
          : lines(
              r.text !== null && `$body = ${single(r.text)};`,
              r.file && `$body = GuzzleHttp\\Psr7\\Utils::tryFopen(${single(r.file)}, 'r');`,
              `$request = new GuzzleHttp\\Psr7\\Request(${single(r.method)}, ${single(r.url)}, $headers${r.text !== null || r.file ? ', $body' : ''});`,
              '$res = $client->send($request);',
            ),
        'echo $res->getBody();',
      ),
  },
  {
    id: 'php-http-request2',
    label: 'PHP - HTTP_Request2',
    editor: 'php',
    build: (r) =>
      lines(
        '<?php',
        "require_once 'HTTP/Request2.php';",
        '$request = new HTTP_Request2();',
        `$request->setUrl(${single(r.url)});`,
        `$request->setMethod(${single(r.method)});`,
        "$request->setConfig(['follow_redirects' => true]);",
        headersFor(r).length > 0 && `$request->setHeader([${headersFor(r).map(([n, v]) => `${single(n)} => ${single(v)}`).join(', ')}]);`,
        r.text !== null && `$request->setBody(${single(r.text)});`,
        ...r.fields.map(([n, v]) => `$request->addPostParameter(${single(n)}, ${single(v)});`),
        ...r.files.map(([n, f]) => `$request->addUpload(${single(n)}, ${single(f)});`),
        r.file && `$request->setBody(${single(r.file)}, true);`,
        'try {',
        '  $response = $request->send();',
        '  echo $response->getBody();',
        '} catch (HTTP_Request2_Exception $e) {',
        "  echo 'Error: ' . $e->getMessage();",
        '}',
      ),
  },
  {
    id: 'php-pecl-http',
    label: 'PHP - pecl_http',
    editor: 'php',
    build: (r) =>
      lines(
        '<?php',
        '$client = new http\\Client;',
        '$request = new http\\Client\\Request;',
        `$request->setRequestUrl(${single(r.url)});`,
        `$request->setRequestMethod(${single(r.method)});`,
        r.text !== null && `$body = new http\\Message\\Body;\n$body->append(${single(r.text)});\n$request->setBody($body);`,
        isForm(r) &&
          `$body = new http\\Message\\Body;\n$body->addForm([${r.fields.map(([n, v]) => `${single(n)} => ${single(v)}`).join(', ')}], [${r.files
            .map(([n, f]) => `['name' => ${single(n)}, 'type' => 'application/octet-stream', 'file' => ${single(f)}, 'data' => null]`)
            .join(', ')}]);\n$request->setBody($body);`,
        headersFor(r).length > 0 && `$request->setHeaders([${headersFor(r).map(([n, v]) => `${single(n)} => ${single(v)}`).join(', ')}]);`,
        '$client->enqueue($request)->send();',
        '$response = $client->getResponse();',
        'echo $response->getBody();',
      ),
  },
  {
    id: 'postman-cli',
    label: 'Postman CLI',
    editor: 'shell',
    build: (r) =>
      [
        `postman request ${r.method === 'GET' ? '' : `${r.method} `}${shellQuote(r.url)}`,
        ...headersFor(r).map(([n, v]) => `--header ${shellQuote(`${n}: ${v}`)}`),
        r.text !== null ? `--body ${shellQuote(r.text)}` : '',
        ...r.fields.map(([n, v]) => `--form ${shellQuote(`${n}=${v}`)}`),
        ...r.files.map(([n, f]) => `--form ${shellQuote(`${n}=@${f}`)}`),
        r.file ? `--body-file ${shellQuote(r.file)}` : '',
      ]
        .filter(Boolean)
        .join(' \\\n  '),
  },
  {
    id: 'powershell',
    label: 'PowerShell - RestMethod',
    editor: 'powershell',
    build: (r) =>
      lines(
        '$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"',
        ...headersFor(r).map(([n, v]) => `$headers.Add(${psQuote(n)}, ${psQuote(v)})`),
        r.text !== null && `$body = ${psQuote(r.text)}`,
        isForm(r) &&
          `$form = @{\n${[...r.fields.map(([n, v]) => `  ${psQuote(n)} = ${psQuote(v)}`), ...r.files.map(([n, f]) => `  ${psQuote(n)} = Get-Item -Path ${psQuote(f)}`)].join('\n')}\n}`,
        `$response = Invoke-RestMethod ${psQuote(r.url)} -Method ${psQuote(r.method)} -Headers $headers${r.text !== null ? ' -Body $body' : ''}${isForm(r) ? ' -Form $form' : ''}${r.file ? ` -InFile ${psQuote(r.file)}` : ''}`,
        '$response | ConvertTo-Json',
      ),
  },
  {
    id: 'python-http-client',
    label: 'Python - http.client',
    editor: 'python',
    build: (r) => {
      const url = new URL(r.url);
      return lines(
        'import http.client',
        '',
        `conn = http.client.${url.protocol === 'http:' ? 'HTTPConnection' : 'HTTPSConnection'}(${q(url.host)})`,
        r.text !== null ? `payload = ${q(r.text)}` : r.file ? `payload = open(${q(r.file)}, "rb").read()` : "payload = ''",
        formNote(r, '#'),
        `headers = {\n${headersFor(r).map(([n, v]) => `  ${q(n)}: ${q(v)},`).join('\n')}\n}`,
        `conn.request(${q(r.method)}, ${q(url.pathname + url.search)}, payload, headers)`,
        'res = conn.getresponse()',
        'data = res.read()',
        'print(data.decode("utf-8"))',
      );
    },
  },
  {
    id: 'python-requests',
    label: 'Python - Requests',
    editor: 'python',
    build: (r) =>
      lines(
        'import requests',
        '',
        `url = ${q(r.url)}`,
        r.text !== null && `payload = ${q(r.text)}`,
        isForm(r) && `payload = {${r.fields.map(([n, v]) => `${q(n)}: ${q(v)}`).join(', ')}}`,
        r.files.length > 0 && `files = [${r.files.map(([n, f]) => `(${q(n)}, (${q(f)}, open(${q(f)}, "rb")))`).join(', ')}]`,
        r.file && `payload = open(${q(r.file)}, "rb")`,
        `headers = {\n${headersFor(r).map(([n, v]) => `  ${q(n)}: ${q(v)},`).join('\n')}\n}`,
        '',
        `response = requests.request(${q(r.method)}, url, headers=headers${hasBody(r) ? ', data=payload' : ''}${r.files.length ? ', files=files' : ''})`,
        'print(response.text)',
      ),
  },
  {
    id: 'r-httr',
    label: 'R - httr',
    editor: 'r',
    build: (r) =>
      lines(
        'library(httr)',
        '',
        `headers = c(${headersFor(r).map(([n, v]) => `${q(n)} = ${q(v)}`).join(', ')})`,
        r.text !== null && `body = ${q(r.text)}`,
        isForm(r) && `body = list(${[...r.fields.map(([n, v]) => `${q(n)} = ${q(v)}`), ...r.files.map(([n, f]) => `${q(n)} = upload_file(${q(f)})`)].join(', ')})`,
        r.file && `body = upload_file(${q(r.file)})`,
        `res <- VERB(${q(r.method)}, url = ${q(r.url)}${hasBody(r) ? `, body = body${isForm(r) ? ', encode = "multipart"' : ''}` : ''}, add_headers(headers))`,
        'cat(content(res, "text"))',
      ),
  },
  {
    id: 'r-rcurl',
    label: 'R - RCurl',
    editor: 'r',
    build: (r) =>
      lines(
        'library(RCurl)',
        `headers = c(${headersFor(r).map(([n, v]) => `${q(n)} = ${q(v)}`).join(', ')})`,
        r.text !== null && `params = ${q(r.text)}`,
        `res <- getURLContent(${q(r.url)}, customrequest = ${q(r.method)}, httpheader = headers${r.text !== null ? ', postfields = params' : ''}, followlocation = TRUE)`,
        isForm(r) && `res <- postForm(${q(r.url)}, ${[...r.fields.map(([n, v]) => `${q(n)} = ${q(v)}`), ...r.files.map(([n, f]) => `${q(n)} = fileUpload(${q(f)})`)].join(', ')}, .opts = list(httpheader = headers))`,
        r.file && `# Binary body: postForm with fileUpload(${q(r.file)}) or httr::upload_file().`,
        'cat(res)',
      ),
  },
  {
    id: 'ruby',
    label: 'Ruby - Net::HTTP',
    editor: 'ruby',
    build: (r) =>
      lines(
        'require "uri"',
        'require "net/http"',
        '',
        `url = URI(${single(r.url)})`,
        'http = Net::HTTP.new(url.host, url.port)',
        new URL(r.url).protocol === 'https:' && 'http.use_ssl = true',
        `request = Net::HTTPGenericRequest.new(${single(r.method)}, ${hasBody(r) ? 'true' : 'false'}, true, url.request_uri)`,
        ...headersFor(r).map(([n, v]) => `request[${single(n)}] = ${single(v)}`),
        r.text !== null && `request.body = ${single(r.text)}`,
        isForm(r) &&
          `request.set_form([${[...r.fields.map(([n, v]) => `[${single(n)}, ${single(v)}]`), ...r.files.map(([n, f]) => `[${single(n)}, File.open(${single(f)})]`)].join(', ')}], 'multipart/form-data')`,
        r.file && `request.body = File.binread(${single(r.file)})`,
        'response = http.request(request)',
        'puts response.read_body',
      ),
  },
  {
    id: 'rust',
    label: 'Rust - reqwest',
    editor: 'rust',
    build: (r) =>
      lines(
        '#[tokio::main]',
        'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
        indent(
          lines(
            'let client = reqwest::Client::builder().build()?;',
            'let mut headers = reqwest::header::HeaderMap::new();',
            ...headersFor(r).map(([n, v]) => `headers.insert(${q(n)}, ${q(v)}.parse()?);`),
            isForm(r) &&
              `let form = reqwest::multipart::Form::new()${r.fields.map(([n, v]) => `\n  .text(${q(n)}, ${q(v)})`).join('')}${r.files
                .map(([n, f]) => `\n  .file(${q(n)}, ${q(f)}).await?`)
                .join('')};`,
            r.text !== null && `let data = ${q(r.text)};`,
            r.file && `let data = std::fs::read(${q(r.file)})?;`,
            `let request = client.request(reqwest::Method::from_bytes(${q(r.method)}.as_bytes())?, ${q(r.url)})`,
            '  .headers(headers)',
            isForm(r) && '  .multipart(form)',
            (r.text !== null || r.file) && '  .body(data)',
            '  ;',
            'let response = request.send().await?;',
            'let body = response.text().await?;',
            'println!("{}", body);',
            'Ok(())',
          ),
          '    ',
        ),
        '}',
      ),
  },
  {
    id: 'httpie',
    label: 'Shell - Httpie',
    editor: 'shell',
    build: (r) => {
      const headers = headersFor(r).map(([n, v]) => shellQuote(`${n}:${v}`));
      if (isForm(r)) {
        return [`http --ignore-stdin --form --follow ${r.method} ${shellQuote(r.url)}`, ...headers, ...r.fields.map(([n, v]) => shellQuote(`${n}=${v}`)), ...r.files.map(([n, f]) => shellQuote(`${n}@${f}`))].join(
          ' \\\n  ',
        );
      }
      const head = `http --follow --timeout 3600 ${r.method} ${shellQuote(r.url)}`;
      const body = r.text !== null ? `printf ${shellQuote(r.text)} | ` : r.file ? `cat ${shellQuote(r.file)} | ` : '';
      return body + [head, ...headers].join(' \\\n  ');
    },
  },
  {
    id: 'wget',
    label: 'Shell - wget',
    editor: 'shell',
    build: (r) =>
      [
        `wget --no-check-certificate --quiet --method ${r.method} --timeout=0`,
        ...headersFor(r).map(([n, v]) => `--header ${shellQuote(`${n}: ${v}`)}`),
        r.text !== null ? `--body-data ${shellQuote(r.text)}` : '',
        r.file ? `--body-file ${shellQuote(r.file)}` : '',
        formNote(r, '# wget cannot build multipart bodies; use cURL.') || '',
        `-O - ${shellQuote(r.url)}`,
      ]
        .filter(Boolean)
        .join(' \\\n  '),
  },
  {
    id: 'swift',
    label: 'Swift - URLSession',
    editor: 'swift',
    build: (r) =>
      lines(
        'import Foundation',
        '',
        `var request = URLRequest(url: URL(string: ${q(r.url)})!, timeoutInterval: Double.infinity)`,
        `request.httpMethod = ${q(r.method)}`,
        ...headersFor(r).map(([n, v]) => `request.addValue(${q(v)}, forHTTPHeaderField: ${q(n)})`),
        r.text !== null && `request.httpBody = ${q(r.text)}.data(using: .utf8)`,
        r.file && `request.httpBody = try Data(contentsOf: URL(fileURLWithPath: ${q(r.file)}))`,
        formNote(r, '// Build a multipart body and set it as request.httpBody.'),
        '',
        'let task = URLSession.shared.dataTask(with: request) { data, response, error in',
        '  guard let data = data else {',
        '    print(String(describing: error))',
        '    return',
        '  }',
        '  print(String(data: data, encoding: .utf8)!)',
        '}',
        'task.resume()',
      ),
  },
];

/** For languages without a short multipart example: the fields and files to send. */
const formNote = (r: Req, comment: string) =>
  isForm(r) &&
  `${comment} Send as multipart/form-data. Fields: ${[...r.fields.map(([n, v]) => `${n}=${v}`), ...r.files.map(([n, f]) => `${n}=@${f}`)].join(', ')}`;

const hasBody = (r: Req) => r.text !== null || isForm(r) || !!r.file;

function okHttpBody(r: Req, lang: 'java' | 'kotlin'): string | false {
  const type = (r.headers.find(([n]) => /^content-type$/i.test(n))?.[1] ?? 'text/plain').split(';')[0];
  const v = lang === 'java' ? '' : 'val ';
  const t = lang === 'java' ? 'MediaType mediaType = ' : 'val mediaType = ';
  const mediaParse = lang === 'java' ? `MediaType.parse(${q(type)})` : `${q(type)}.toMediaType()`;
  if (r.text !== null) {
    return lang === 'java'
      ? `${t}${mediaParse};\nRequestBody body = RequestBody.create(mediaType, ${q(r.text)});`
      : `${t}${mediaParse}\nval body = ${q(r.text)}.toRequestBody(mediaType)`;
  }
  if (r.file) {
    return lang === 'java'
      ? `RequestBody body = RequestBody.create(MediaType.parse("application/octet-stream"), new File(${q(r.file)}));`
      : `val body = File(${q(r.file)}).asRequestBody("application/octet-stream".toMediaType())`;
  }
  if (isForm(r)) {
    const parts = [
      ...r.fields.map(([n, val]) => `  .addFormDataPart(${q(n)}, ${q(val)})`),
      ...r.files.map(([n, f]) =>
        lang === 'java'
          ? `  .addFormDataPart(${q(n)}, ${q(f)}, RequestBody.create(MediaType.parse("application/octet-stream"), new File(${q(f)})))`
          : `  .addFormDataPart(${q(n)}, ${q(f)}, File(${q(f)}).asRequestBody("application/octet-stream".toMediaType()))`,
      ),
    ];
    return `${lang === 'java' ? 'RequestBody body = ' : `${v}body = `}MultipartBody.Builder().setType(MultipartBody.FORM)\n${parts.join('\n')}\n  .build()${lang === 'java' ? ';' : ''}`;
  }
  return false;
}

function formJs(r: Req): string | false {
  if (!isForm(r)) return false;
  return lines(
    'const form = new FormData();',
    ...r.fields.map(([n, v]) => `form.append(${q(n)}, ${q(v)});`),
    ...r.files.map(([n, f]) => `form.append(${q(n)}, fileInput.files[0], ${q(f)});`),
  );
}

function formNode(r: Req): string | false {
  if (!isForm(r)) return false;
  return lines(
    'const form = new FormData();',
    ...r.fields.map(([n, v]) => `form.append(${q(n)}, ${q(v)});`),
    ...r.files.map(([n, f]) => `form.append(${q(n)}, fs.createReadStream(${q(f)}));`),
  );
}

/** The code for a request in one language. */
export function snippet(languageId: string, prepared: PreparedRequest): string {
  const language = SNIPPET_LANGUAGES.find((l) => l.id === languageId) ?? SNIPPET_LANGUAGES[3];
  try {
    return language.build(toReq(prepared), prepared);
  } catch {
    return 'Enter a full URL, such as https://api.example.com/users, to see this code.';
  }
}
