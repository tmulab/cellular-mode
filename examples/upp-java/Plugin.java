// The UPP 1.0 conformance reference plugin, in Java 21, as ONE source file.
//
// Launched with `java Plugin.java <manifest.json>` (JEP 330 single-file source launcher): no
// build tool, no jar, no dependency, nothing outside java.base, and nothing at all from this
// repository — sharing code with the host that tests it would only prove the two agree with
// themselves. The hand-written JSON reader and writer at the bottom are the only reason the
// file is long; they are complete enough for the corpus and no more, JDK 21 cannot
// source-launch a second file, and examples/upp-java/README.md lists what they do not do.
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Plugin {
    static final String PROTOCOL = "1.0";
    static final int MAX_TEXT = 4096;
    static Map<String, Object> manifest;

    public static void main(String[] args) throws Exception {
        if (args.length < 1) { System.err.println("usage: java Plugin.java <manifest.json>"); System.exit(2); }
        manifest = object(new Json(Files.readString(Path.of(args[0]), StandardCharsets.UTF_8)).parse());
        var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        var out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
        for (String line; (line = in.readLine()) != null; ) {
            if (line.isBlank()) continue;
            Object parsed;
            try {
                parsed = new Json(line).parse();
            } catch (RuntimeException broken) {
                // The id could not be read: the one case JSON-RPC reserves a null id for.
                out.println(error(null, -32700, "PLUGIN_ERROR", "the line is not valid JSON"));
                continue;
            }
            String answer = dispatch(object(parsed));
            if (answer != null) out.println(answer);
        }
    }
    static String dispatch(Map<String, Object> message) {
        Object id = message.get("id");
        Object method = message.get("method");
        Map<String, Object> params = object(message.get("params"));
        if ("upp.cancel".equals(method)) return null;            // a notification is never answered
        if ("upp.exit".equals(method)) System.exit(0);
        if ("upp.initialize".equals(method)) {
            List<Object> offered = params.get("protocolVersions") instanceof List<?> l ? new ArrayList<>(l) : List.of();
            if (!offered.contains(PROTOCOL)) {
                return error(id, -32002, "CONTRACT_INVALID",
                        "this plugin speaks " + PROTOCOL + "; the host offered " + offered);
            }
            return result(id, map("protocolVersion", PROTOCOL, "manifest", manifest));
        }
        if ("upp.capabilities".equals(method)) return result(id, map("capabilities", manifest.get("capabilities")));
        if ("upp.health".equals(method)) return result(id, map("status", "ok"));
        if ("upp.shutdown".equals(method)) return result(id, map());
        if ("upp.execute".equals(method)) return execute(id, params);
        return error(id, -32601, "CONTRACT_INVALID", "unknown method \"" + method + "\"");
    }
    static String execute(Object id, Map<String, Object> params) {
        if (!"wordcount".equals(params.get("capability"))) {
            return error(id, -32001, "NOT_FOUND", "no capability \"" + params.get("capability") + "\"");
        }
        String breach = breachOf(params.get("input"));
        if (breach != null) return error(id, -32602, "INPUT_INVALID", breach);
        return result(id, map("output", map("words", countWords((String) object(params.get("input")).get("text")))));
    }
    /** The declared input contract, by hand. Returns the breach, or null. */
    static String breachOf(Object input) {
        if (!(input instanceof Map<?, ?> m)) return "input must be an object";
        var extra = new ArrayList<String>();
        for (Object key : m.keySet()) if (!"text".equals(key)) extra.add(String.valueOf(key));
        if (!extra.isEmpty()) return "unknown input field(s): " + String.join(", ", extra);
        if (!(m.get("text") instanceof String text)) return "input.text is required and must be a string";
        return text.length() > MAX_TEXT ? "input.text must be at most " + MAX_TEXT + " characters" : null;
    }

    /** Words are runs of non-whitespace. */
    static long countWords(String text) {
        String trimmed = text.strip();
        return trimmed.isEmpty() ? 0 : trimmed.split("\\s+").length;
    }
    /** An ordered object literal: key, value, key, value… */
    static Map<String, Object> map(Object... pairs) {
        var out = new LinkedHashMap<String, Object>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }
    static String result(Object id, Object out) { return write(map("jsonrpc", "2.0", "id", id, "result", out)); }

    static String error(Object id, int code, String kernelCode, String message) {
        return write(map("jsonrpc", "2.0", "id", id,
                "error", map("code", code, "message", message, "data", map("code", kernelCode))));
    }
    @SuppressWarnings("unchecked")
    static Map<String, Object> object(Object v) { return v instanceof Map<?, ?> m ? (Map<String, Object>) m : map(); }

    // ---- JSON writer: objects, arrays, strings, numbers, booleans, null. Nothing else. ----
    static String write(Object value) {
        var out = new StringBuilder();
        emit(value, out);
        return out.toString();
    }
    static void emit(Object value, StringBuilder out) {
        if (value == null) { out.append("null"); return; }
        if (value instanceof String s) { quote(s, out); return; }
        if (value instanceof Boolean b) { out.append(b ? "true" : "false"); return; }
        if (value instanceof Number n) {
            double d = n.doubleValue();
            out.append(d == Math.rint(d) && !Double.isInfinite(d) ? String.valueOf((long) d) : String.valueOf(d));
        } else if (value instanceof Map<?, ?> m) {
            var parts = new ArrayList<String>();
            for (var e : m.entrySet()) parts.add(write(String.valueOf(e.getKey())) + ":" + write(e.getValue()));
            out.append('{').append(String.join(",", parts)).append('}');
        } else if (value instanceof List<?> l) {
            var parts = new ArrayList<String>();
            for (Object item : l) parts.add(write(item));
            out.append('[').append(String.join(",", parts)).append(']');
        } else {
            throw new IllegalArgumentException("not JSON: " + value.getClass());
        }
    }

    static void quote(String text, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        out.append('"');
    }

    // ---- JSON reader. Malformed input is a RuntimeException, turned into -32700 above.
    static final class Json {
        private final String s;
        private int i;
        Json(String source) { this.s = source; }
        Object parse() {
            Object value = value();
            skip();
            if (i < s.length()) throw new IllegalStateException("trailing input at " + i);
            return value;
        }
        private void skip() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        private Object value() {
            skip();
            if (i >= s.length()) throw new IllegalStateException("unexpected end of input");
            char c = s.charAt(i);
            if (c == '{' || c == '[') return collection(c == '{' ? '}' : ']');
            if (c == '"') return string();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (start == i) throw new IllegalStateException("not a value at " + start);
            return Double.valueOf(s.substring(start, i));
        }
        /** Objects and arrays differ in one member each, so they share one loop: the
         * alternative was two near-identical methods, and near-identical is where bugs live. */
        private Object collection(char close) {
            var list = new ArrayList<Object>();
            var object = new LinkedHashMap<String, Object>();
            i++;
            skip();
            if (i < s.length() && s.charAt(i) == close) { i++; return close == '}' ? object : list; }
            for (;;) {
                if (close == '}') { skip(); String key = string(); expect(':'); object.put(key, value()); }
                else list.add(value());
                skip();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                expect(close);
                return close == '}' ? object : list;
            }
        }
        private String string() {
            expect('"');
            var out = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') return out.toString();
                if (c != '\\') { out.append(c); continue; }
                char e = s.charAt(i++);
                if (e == 'n') out.append('\n');
                else if (e == 't') out.append('\t');
                else if (e == 'r') out.append('\r');
                else if (e == 'u') { out.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
                else out.append(e);
            }
            throw new IllegalStateException("unterminated string");
        }
        private void expect(char c) {
            skip();
            if (i >= s.length() || s.charAt(i) != c) throw new IllegalStateException("expected '" + c + "' at " + i);
            i++;
        }    }
}
