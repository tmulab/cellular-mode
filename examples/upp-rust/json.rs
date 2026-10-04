// A hand-written JSON value, reader and writer — the price of "std only" in Rust.
//
// `serde_json` would replace this whole file, and would also make the claim in
// examples/upp-rust/README.md false: nothing in this example is fetched from a registry. So
// the codec is written out, and it lives in its OWN file so that neither it nor `plugin.rs`
// passes the project's 200-line limit. `rustc plugin.rs` compiles both: a crate root may
// declare `mod json;` and rustc reads `json.rs` from the same directory, with no build tool.
//
// It is complete enough for the conformance corpus and no more. It does not implement surrogate
// pairs, number precision guarantees, duplicate-key policy or a depth limit. Nobody should
// lift it into production.

#[derive(Clone)]
pub enum J { Null, Bool(bool), Num(f64), Str(String), Arr(Vec<J>), Obj(Vec<(String, J)>) }

impl J {
    /// The value of `key`, for an object. `None` for anything else — a reader that panicked
    /// on a shape a peer chose would make every malformed message a crash.
    pub fn get(&self, key: &str) -> Option<&J> {
        match self {
            J::Obj(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn text(&self) -> Option<&str> {
        match self { J::Str(value) => Some(value), _ => None }
    }
    pub fn render(&self, out: &mut String) {
        match self {
            J::Null => out.push_str("null"),
            J::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
            J::Num(n) if n.fract() == 0.0 && n.is_finite() => out.push_str(&format!("{}", *n as i64)),
            J::Num(n) => out.push_str(&format!("{}", n)),
            J::Str(value) => quote(value, out),
            J::Arr(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 { out.push(','); }
                    item.render(out);
                }
                out.push(']');
            }
            J::Obj(entries) => {
                out.push('{');
                for (i, (key, value)) in entries.iter().enumerate() {
                    if i > 0 { out.push(','); }
                    quote(key, out);
                    out.push(':');
                    value.render(out);
                }
                out.push('}');
            }
        }
    }
    /// One framed message: no newline inside, because NDJSON gives `\n` a meaning.
    pub fn line(&self) -> String {
        let mut out = String::new();
        self.render(&mut out);
        out
    }
}

fn quote(text: &str, out: &mut String) {
    out.push('"');
    for c in text.chars() {
        match c {
            '"' | '\\' => { out.push('\\'); out.push(c); }
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// An ordered object literal. Order is kept so the output reads beside the other
/// implementations; the host compares canonical JSON, so order never changes a verdict.
pub fn obj(pairs: Vec<(&str, J)>) -> J {
    J::Obj(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

pub fn s(value: &str) -> J { J::Str(value.to_string()) }

/// Malformed input is `Err(())`, which the caller turns into -32700. It does not repair,
/// guess or recover: a frame missing its tail is not a frame.
pub struct Parser { chars: Vec<char>, at: usize }

impl Parser {
    pub fn new(source: &str) -> Parser { Parser { chars: source.chars().collect(), at: 0 } }

    pub fn parse(&mut self) -> Result<J, ()> {
        let value = self.value()?;
        if self.peek().is_some() { Err(()) } else { Ok(value) }
    }

    fn peek(&mut self) -> Option<char> {
        while self.at < self.chars.len() && self.chars[self.at].is_whitespace() { self.at += 1; }
        self.chars.get(self.at).copied()
    }

    fn eat(&mut self, c: char) -> Result<(), ()> {
        if self.peek() == Some(c) { self.at += 1; Ok(()) } else { Err(()) }
    }

    fn literal(&mut self, word: &str) -> bool {
        let end = self.at + word.chars().count();
        let hit = end <= self.chars.len() && self.chars[self.at..end].iter().collect::<String>() == word;
        if hit { self.at = end; }
        hit
    }

    fn value(&mut self) -> Result<J, ()> {
        match self.peek().ok_or(())? {
            '{' | '[' => self.collection(),
            '"' => Ok(J::Str(self.string()?)),
            _ => {
                if self.literal("true") { return Ok(J::Bool(true)); }
                if self.literal("false") { return Ok(J::Bool(false)); }
                if self.literal("null") { return Ok(J::Null); }
                let start = self.at;
                while self.at < self.chars.len() && "+-0123456789.eE".contains(self.chars[self.at]) {
                    self.at += 1;
                }
                let text: String = self.chars[start..self.at].iter().collect();
                text.parse::<f64>().map(J::Num).map_err(|_| ())
            }
        }
    }

    /// Objects and arrays differ in one member each, so they share one loop: the alternative
    /// was two near-identical functions, and near-identical is where bugs live.
    fn collection(&mut self) -> Result<J, ()> {
        let is_object = self.peek() == Some('{');
        let close = if is_object { '}' } else { ']' };
        self.at += 1;
        let mut items: Vec<J> = Vec::new();
        let mut entries: Vec<(String, J)> = Vec::new();
        let done = |items: Vec<J>, entries: Vec<(String, J)>| {
            if is_object { J::Obj(entries) } else { J::Arr(items) }
        };
        if self.peek() == Some(close) {
            self.at += 1;
            return Ok(done(items, entries));
        }
        loop {
            if is_object {
                let key = self.string()?;
                self.eat(':')?;
                entries.push((key, self.value()?));
            } else {
                items.push(self.value()?);
            }
            if self.peek() == Some(',') { self.at += 1; continue; }
            self.eat(close)?;
            return Ok(done(items, entries));
        }
    }

    fn string(&mut self) -> Result<String, ()> {
        self.eat('"')?;
        let mut out = String::new();
        while self.at < self.chars.len() {
            let c = self.chars[self.at];
            self.at += 1;
            if c == '"' { return Ok(out); }
            if c != '\\' { out.push(c); continue; }
            let escaped = *self.chars.get(self.at).ok_or(())?;
            self.at += 1;
            match escaped {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                'u' => {
                    let end = self.at + 4;
                    let hex: String = self.chars.get(self.at..end).ok_or(())?.iter().collect();
                    out.push(char::from_u32(u32::from_str_radix(&hex, 16).map_err(|_| ())?).ok_or(())?);
                    self.at = end;
                }
                other => out.push(other),
            }
        }
        Err(())
    }
}
